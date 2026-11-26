shader_type canvas_item;
render_mode unshaded;

uniform sampler2D screen_texture : hint_screen_texture, repeat_disable, filter_linear;
uniform vec2 light_center = vec2(0.5, 0.5);
uniform vec2 viewport_size = vec2(1440.0, 900.0);
uniform float light_radius = 235.0;
uniform float darkness = 0.62;
uniform float fog_amount = 0.16;
uniform float time_sec = 0.0;
uniform float realm_blend = 0.0;
uniform float flip_wave = 0.0;
uniform float danger_pulse = 0.0;
uniform float is_title = 0.0;
uniform vec4 cold_light_0 = vec4(-2.0, -2.0, 0.0, 0.0);
uniform vec4 cold_light_1 = vec4(-2.0, -2.0, 0.0, 0.0);
uniform vec4 cold_light_2 = vec4(-2.0, -2.0, 0.0, 0.0);
uniform vec4 cold_light_3 = vec4(-2.0, -2.0, 0.0, 0.0);

float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float noise2d(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash21(i);
	float b = hash21(i + vec2(1.0, 0.0));
	float c = hash21(i + vec2(0.0, 1.0));
	float d = hash21(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float cold_contrib(vec2 uv, vec4 cl) {
	if (cl.z <= 1.0) {
		return 0.0;
	}
	float d = length((uv - cl.xy) * viewport_size);
	return (1.0 - smoothstep(cl.z * 0.15, cl.z, d)) * cl.w;
}

void fragment() {
	vec2 uv = SCREEN_UV;
	vec2 delta_px = (uv - light_center) * viewport_size;
	float dist_px = length(delta_px);

	// Expanding ink-ripple distortion during realm flip
	if (flip_wave > 0.001 && flip_wave < 1.0) {
		float wave_r = flip_wave * 620.0;
		float band = exp(-pow((dist_px - wave_r) / 42.0, 2.0)) * (1.0 - flip_wave);
		vec2 dir = dist_px > 0.001 ? (delta_px / dist_px) : vec2(0.0);
		uv += dir * (band * 14.0) / viewport_size;
	}

	vec3 source = texture(screen_texture, uv).rgb;

	if (is_title > 0.5) {
		// Title screen: gentle warm lantern glow on right, soft ink vignette, subtle xuan paper grain
		float flicker = 1.0 + sin(time_sec * 4.7) * 0.025 + sin(time_sec * 11.3) * 0.012;
		float title_light = 1.0 - smoothstep(light_radius * 0.15, light_radius * flicker, dist_px);
		vec3 warm_wash = vec3(0.96, 0.78, 0.42) * title_light * 0.16;
		float vig = smoothstep(0.32, 0.92, length(SCREEN_UV - vec2(0.5)));
		float grain = (hash21(floor(SCREEN_UV * viewport_size * 0.5)) - 0.5) * 0.018;
		vec3 col = source + warm_wash + grain;
		col = mix(col, vec3(0.024, 0.035, 0.043), vig * 0.42);
		COLOR = vec4(col, 1.0);
	} else {
		// Organic lantern flicker
		float flicker = 1.0 + sin(time_sec * 6.3) * 0.028 + sin(time_sec * 13.7) * 0.014;
		float r = light_radius * flicker;

		// Two-stage lantern falloff: bright warm core + soft ambient bleed
		float core_light = 1.0 - smoothstep(r * 0.08, r * 0.62, dist_px);
		float outer_light = 1.0 - smoothstep(r * 0.22, r * 1.18, dist_px);
		float lantern_light = clamp(outer_light * 0.78 + core_light * 0.36, 0.0, 1.0);

		// Secondary cold lights (stone lanterns / grave wisps)
		float cold = 0.0;
		cold = max(cold, cold_contrib(SCREEN_UV, cold_light_0));
		cold = max(cold, cold_contrib(SCREEN_UV, cold_light_1));
		cold = max(cold, cold_contrib(SCREEN_UV, cold_light_2));
		cold = max(cold, cold_contrib(SCREEN_UV, cold_light_3));

		// Readable moonlit ambient floor so tombstones & bamboo remain legible like the style bible
		float ambient_floor = clamp(1.0 - darkness * 0.72, 0.22, 0.55);
		float total_light = clamp(max(lantern_light, cold * 0.78), 0.0, 1.0);
		float illum = mix(ambient_floor, 1.12, total_light);

		// Warm golden tint inside lantern pool (mortal warmer, spectral cooler bone-gold)
		vec3 warm_tint = mix(vec3(1.16, 0.96, 0.70), vec3(1.02, 0.99, 0.90), realm_blend);
		vec3 shadow_tint = mix(vec3(0.68, 0.78, 0.86), vec3(0.56, 0.72, 0.82), realm_blend);
		vec3 tint = mix(shadow_tint, warm_tint, lantern_light);

		vec3 color = source * illum * tint;

		// Subtle additive lantern warmth in center & cold sage glow on stone lanterns
		vec3 amber_glow = mix(vec3(0.91, 0.70, 0.29), vec3(0.84, 0.74, 0.48), realm_blend);
		color += amber_glow * core_light * (0.14 * (1.0 - darkness * 0.35));
		color += vec3(0.48, 0.60, 0.56) * cold * 0.12;

		// Procedural drifting ink-mist (2 octaves, low cost)
		vec2 fog_uv = SCREEN_UV * vec2(4.2, 2.8) + vec2(time_sec * 0.025, -time_sec * 0.012);
		float n1 = noise2d(fog_uv);
		float n2 = noise2d(fog_uv * 2.1 - vec2(time_sec * 0.04, time_sec * 0.018));
		float mist = smoothstep(0.32, 0.85, n1 * 0.65 + n2 * 0.35);
		float mist_strength = (fog_amount + realm_blend * 0.14) * (1.0 - core_light * 0.72);
		vec3 mist_col = mix(vec3(0.11, 0.16, 0.19), vec3(0.18, 0.24, 0.26), realm_blend);
		color = mix(color, mist_col, mist * mist_strength * 0.42);

		// Expanding bright ink-gold rim during flip wave
		if (flip_wave > 0.001 && flip_wave < 1.0) {
			float wave_r = flip_wave * 620.0;
			float rim = exp(-pow((dist_px - wave_r) / 26.0, 2.0)) * (1.0 - flip_wave);
			color += vec3(0.95, 0.90, 0.76) * rim * 0.45;
		}

		// Soft ink vignette & subtle xuan paper grain
		float vignette = smoothstep(0.30, 0.84, length(SCREEN_UV - vec2(0.5)));
		color = mix(color, vec3(0.024, 0.035, 0.043), vignette * 0.40);

		// Vermilion edge warning pulse for taboo danger / hit
		if (danger_pulse > 0.001) {
			float edge = smoothstep(0.34, 0.78, length(SCREEN_UV - vec2(0.5)));
			color = mix(color, vec3(0.78, 0.25, 0.16), edge * danger_pulse * 0.42);
		}

		float grain = (hash21(floor(SCREEN_UV * viewport_size * 0.5) + floor(time_sec * 8.0)) - 0.5) * 0.014;
		color += grain;

		COLOR = vec4(clamp(color, 0.0, 1.0), 1.0);
	}
}
