shader_type canvas_item;
render_mode unshaded;

uniform sampler2D screen_texture : hint_screen_texture, repeat_disable, filter_linear;
uniform vec2 light_center = vec2(0.5, 0.5);
uniform vec2 viewport_size = vec2(1440.0, 900.0);
uniform float light_radius = 235.0;
uniform float darkness = 0.62;
uniform float fog_amount = 0.16;

void fragment() {
	vec3 source = texture(screen_texture, SCREEN_UV).rgb;
	float distance_to_light = length((SCREEN_UV - light_center) * viewport_size);
	float light = 1.0 - smoothstep(light_radius * 0.25, light_radius, distance_to_light);
	float vignette = smoothstep(0.25, 0.78, length(SCREEN_UV - vec2(0.5)));
	vec3 color = source * mix(1.0 - darkness, 1.0, light);
	color = mix(color, vec3(0.035, 0.05, 0.06), vignette * 0.28 + fog_amount * 0.12);
	COLOR = vec4(color, 1.0);
}
