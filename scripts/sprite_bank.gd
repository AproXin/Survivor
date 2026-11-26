extends RefCounted
class_name InkSpriteBank

const MANIFEST_PATH := "res://assets/sprites/manifest.json"

var specs: Dictionary = {}
var sheets: Dictionary = {}

func load_manifest(path: String = MANIFEST_PATH) -> void:
	specs.clear()
	sheets.clear()
	if not FileAccess.file_exists(path):
		return
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return
	var parsed = JSON.parse_string(f.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var root: Dictionary = parsed
	for key in root:
		var entry: Dictionary = root[key]
		var spec := {
			"path": str(entry.get("path", "")),
			"size": int(entry.get("size", 64)),
			"fps": float(entry.get("fps", 8.0)),
			"scale": float(entry.get("scale", 1.0)),
			"offset_y": float(entry.get("offset_y", -16.0)),
		}
		specs[str(key)] = spec
		if spec.path != "" and ResourceLoader.exists(spec.path):
			var tex = load(spec.path)
			if tex is Texture2D:
				register_texture(str(key), tex, spec)

func register_texture(key: String, tex: Texture2D, spec_override: Dictionary = {}) -> Dictionary:
	var spec: Dictionary = specs.get(key, {"size": 64, "fps": 8.0, "scale": 1.0, "offset_y": -16.0}).duplicate(true)
	for k in spec_override:
		spec[k] = spec_override[k]
	var tex_w := int(tex.get_width())
	var tex_h := int(tex.get_height())
	var frame_size := maxi(1, tex_h)
	var hframes := maxi(1, int(tex_w / frame_size))
	# Protocol (per AGENTS_8d0a7c83.md): hframes >= 8 => walk(W) + hit(1) + death(3); hf < 8 => single/walk placeholder
	var has_full_protocol := hframes >= 8
	var walk_count := (hframes - 4) if has_full_protocol else hframes
	var hit_frame := (hframes - 4) if has_full_protocol else 0
	var death_start := (hframes - 3) if has_full_protocol else 0
	var death_count := 3 if has_full_protocol else 1
	var sheet := {
		"texture": tex,
		"frame_size": frame_size,
		"expected_size": int(spec.get("size", 64)),
		"hframes": hframes,
		"has_full_protocol": has_full_protocol,
		"walk_count": walk_count,
		"hit_frame": hit_frame,
		"death_start": death_start,
		"death_count": death_count,
		"fps": float(spec.get("fps", 8.0)),
		"scale": float(spec.get("scale", 1.0)),
		"offset_y": float(spec.get("offset_y", -16.0)),
	}
	sheets[key] = sheet
	return sheet

func has_sheet(key: String) -> bool:
	return sheets.has(key)

func get_sheet(key: String) -> Dictionary:
	return sheets.get(key, {})

func get_spec(key: String) -> Dictionary:
	return specs.get(key, {})

func get_frame_region(key: String, state: String, anim_time: float) -> Rect2:
	if not sheets.has(key):
		return Rect2()
	var s: Dictionary = sheets[key]
	var fsize: int = int(s.frame_size)
	var fps: float = float(s.fps)
	var idx := 0
	match state:
		"hit":
			idx = int(s.hit_frame)
		"death":
			var d_count: int = int(s.death_count)
			var step_i := clampi(int(anim_time * fps), 0, d_count - 1)
			idx = int(s.death_start) + step_i
		_:
			var w_count: int = maxi(1, int(s.walk_count))
			idx = int(floor(anim_time * fps)) % w_count
	idx = clampi(idx, 0, int(s.hframes) - 1)
	return Rect2(float(idx * fsize), 0.0, float(fsize), float(fsize))
