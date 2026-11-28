extends RefCounted
class_name InkSpriteBank

const MANIFEST_PATH := "res://assets/sprites/manifest.json"
const CEL_MANIFEST_PATH := "res://assets/sprites/cel_manifest.json"

var specs: Dictionary = {}
var sheets: Dictionary = {}

func _load_texture_any(res_path: String) -> Texture2D:
	if res_path == "":
		return null
	if ResourceLoader.exists(res_path):
		var loaded = load(res_path)
		if loaded is Texture2D:
			return loaded
	var abs_path: String = ProjectSettings.globalize_path(res_path)
	if FileAccess.file_exists(abs_path):
		var img: Image = Image.load_from_file(abs_path)
		if img != null and not img.is_empty():
			return ImageTexture.create_from_image(img)
	return null

func _load_json_dict(res_path: String) -> Dictionary:
	if res_path == "":
		return {}
	var target_path: String = res_path
	if not FileAccess.file_exists(target_path):
		target_path = ProjectSettings.globalize_path(res_path)
	if not FileAccess.file_exists(target_path):
		return {}
	var f: FileAccess = FileAccess.open(target_path, FileAccess.READ)
	if f == null:
		return {}
	var parsed = JSON.parse_string(f.get_as_text())
	if typeof(parsed) == TYPE_DICTIONARY:
		return parsed
	return {}

func load_manifest(path: String = MANIFEST_PATH) -> void:
	specs.clear()
	sheets.clear()
	if not FileAccess.file_exists(path):
		return
	var f: FileAccess = FileAccess.open(path, FileAccess.READ)
	if f == null:
		return
	var parsed = JSON.parse_string(f.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var root: Dictionary = parsed
	for key in root:
		var entry: Dictionary = root[key]
		var spec: Dictionary = {
			"path": str(entry.get("path", "")),
			"cel_path": str(entry.get("cel_path", "")),
			"aseprite_json": str(entry.get("aseprite_json", "")),
			"size": int(entry.get("size", 64)),
			"fps": float(entry.get("fps", 8.0)),
			"scale": float(entry.get("scale", 1.0)),
			"offset_y": float(entry.get("offset_y", -16.0)),
		}
		specs[str(key)] = spec
		var cel_path: String = str(spec.get("cel_path", ""))
		var ase_path: String = str(spec.get("aseprite_json", ""))
		if cel_path != "" and ase_path != "":
			var cel_tex: Texture2D = _load_texture_any(cel_path)
			var ase_doc: Dictionary = _load_json_dict(ase_path)
			if cel_tex != null and not ase_doc.is_empty():
				register_aseprite_json(str(key), cel_tex, ase_doc, spec)
				continue
		var base_path: String = str(spec.get("path", ""))
		var tex: Texture2D = _load_texture_any(base_path)
		if tex != null:
			register_texture(str(key), tex, spec)
	load_cel_manifest(CEL_MANIFEST_PATH)

func load_cel_manifest(cel_manifest_path: String = CEL_MANIFEST_PATH) -> void:
	var doc: Dictionary = _load_json_dict(cel_manifest_path)
	if doc.is_empty():
		return
	var actors_raw: Array = doc.get("actors", [])
	for item in actors_raw:
		if typeof(item) != TYPE_DICTIONARY:
			continue
		var entry: Dictionary = item
		var actor_key: String = str(entry.get("key", ""))
		if actor_key == "":
			continue
		var cel_path: String = str(entry.get("cel_path", ""))
		var ase_path: String = str(entry.get("aseprite_json", ""))
		if cel_path == "" or ase_path == "":
			continue
		var spec: Dictionary = {
			"path": cel_path,
			"cel_path": cel_path,
			"aseprite_json": ase_path,
			"size": int(entry.get("size", 64)),
			"fps": float(entry.get("fps", 9.0)),
			"scale": float(entry.get("scale", 1.0)),
			"offset_y": float(entry.get("offset_y", -14.0)),
		}
		if not specs.has(actor_key):
			specs[actor_key] = spec
		var cel_tex: Texture2D = _load_texture_any(cel_path)
		var ase_doc: Dictionary = _load_json_dict(ase_path)
		if cel_tex != null and not ase_doc.is_empty():
			register_aseprite_json(actor_key, cel_tex, ase_doc, spec)

func register_texture(key: String, tex: Texture2D, spec_override: Dictionary = {}) -> Dictionary:
	var base_spec: Dictionary = specs.get(key, {"size": 64, "fps": 8.0, "scale": 1.0, "offset_y": -16.0})
	var spec: Dictionary = base_spec.duplicate(true)
	for k in spec_override:
		spec[k] = spec_override[k]
	var tex_w: int = int(tex.get_width())
	var tex_h: int = int(tex.get_height())
	var frame_size: int = maxi(1, tex_h)
	var hframes: int = maxi(1, int(tex_w / frame_size))
	# Protocol: hframes >= 8 => walk(W) + hit(1) + death(3); hf < 8 => single/walk placeholder
	var has_full_protocol: bool = hframes >= 8
	var walk_count: int = (hframes - 4) if has_full_protocol else hframes
	var hit_frame: int = (hframes - 4) if has_full_protocol else 0
	var death_start: int = (hframes - 3) if has_full_protocol else 0
	var death_count: int = 3 if has_full_protocol else 1
	var sheet: Dictionary = {
		"texture": tex,
		"frame_size": frame_size,
		"expected_size": int(spec.get("size", 64)),
		"hframes": hframes,
		"has_full_protocol": has_full_protocol,
		"has_aseprite_tags": false,
		"tags": {},
		"frame_rects": [],
		"frame_durations": [],
		"walk_count": walk_count,
		"hit_frame": hit_frame,
		"death_start": death_start,
		"death_count": death_count,
		"fps": float(spec.get("fps", 8.0)),
		"scale": float(spec.get("scale", 1.0)),
		"offset_y": float(spec.get("offset_y", -16.0)),
		"anchor_x": float(frame_size) * 0.5,
		"anchor_y": float(frame_size) - 6.0,
	}
	sheets[key] = sheet
	return sheet

func register_aseprite_json(key: String, tex: Texture2D, ase_doc: Dictionary, spec_override: Dictionary = {}) -> Dictionary:
	var sheet: Dictionary = register_texture(key, tex, spec_override)
	var frames_raw: Array = ase_doc.get("frames", [])
	var frame_rects: Array = []
	var frame_durations: Array = []
	for item in frames_raw:
		if typeof(item) != TYPE_DICTIONARY:
			continue
		var fr_dict: Dictionary = item
		var rect_d: Dictionary = fr_dict.get("frame", {})
		var rx: float = float(rect_d.get("x", 0.0))
		var ry: float = float(rect_d.get("y", 0.0))
		var rw: float = float(rect_d.get("w", float(sheet.get("frame_size", 96))))
		var rh: float = float(rect_d.get("h", float(sheet.get("frame_size", 96))))
		frame_rects.append(Rect2(rx, ry, rw, rh))
		var dur_ms: float = float(fr_dict.get("duration", 100.0))
		frame_durations.append(maxf(0.02, dur_ms / 1000.0))

	var meta: Dictionary = ase_doc.get("meta", {})
	var tags_raw: Array = meta.get("frameTags", [])
	var tags_map: Dictionary = {}
	for t_item in tags_raw:
		if typeof(t_item) != TYPE_DICTIONARY:
			continue
		var td: Dictionary = t_item
		var t_name: String = str(td.get("name", ""))
		if t_name == "":
			continue
		var from_i: int = int(td.get("from", 0))
		var to_i: int = int(td.get("to", from_i))
		var looping: bool = (t_name == "idle" or t_name == "move" or t_name == "walk")
		var total_dur: float = 0.0
		for fi in range(from_i, mini(to_i + 1, frame_durations.size())):
			total_dur += float(frame_durations[fi])
		tags_map[t_name] = {
			"from": from_i,
			"to": to_i,
			"loop": looping,
			"duration": maxf(0.05, total_dur),
			"direction": str(td.get("direction", "forward")),
		}

	var anchor: Dictionary = meta.get("anchor", {})
	if not anchor.is_empty():
		sheet["anchor_x"] = float(anchor.get("x", 48.0))
		sheet["anchor_y"] = float(anchor.get("y", 90.0))

	if not frame_rects.is_empty() and not tags_map.is_empty():
		sheet["has_aseprite_tags"] = true
		sheet["frame_rects"] = frame_rects
		sheet["frame_durations"] = frame_durations
		sheet["tags"] = tags_map
		sheet["hframes"] = frame_rects.size()
		if tags_map.has("move"):
			var mt: Dictionary = tags_map["move"]
			sheet["walk_count"] = int(mt.get("to", 0)) - int(mt.get("from", 0)) + 1
		if tags_map.has("hit"):
			var ht: Dictionary = tags_map["hit"]
			sheet["hit_frame"] = int(ht.get("from", 0))
		if tags_map.has("death"):
			var dt_tag: Dictionary = tags_map["death"]
			sheet["death_start"] = int(dt_tag.get("from", 0))
			sheet["death_count"] = int(dt_tag.get("to", 0)) - int(dt_tag.get("from", 0)) + 1
	sheets[key] = sheet
	return sheet

func has_sheet(key: String) -> bool:
	return sheets.has(key)

func has_tag(key: String, tag_name: String) -> bool:
	if not sheets.has(key):
		return false
	var s: Dictionary = sheets[key]
	var tags: Dictionary = s.get("tags", {})
	return tags.has(tag_name)

func get_tag_names(key: String) -> Array:
	if not sheets.has(key):
		return []
	var s: Dictionary = sheets[key]
	var tags: Dictionary = s.get("tags", {})
	return tags.keys()

func get_sheet(key: String) -> Dictionary:
	return sheets.get(key, {})

func get_spec(key: String) -> Dictionary:
	return specs.get(key, {})

func _resolve_tag_name(tags: Dictionary, state: String) -> String:
	if tags.has(state):
		return state
	match state:
		"walk":
			if tags.has("move"):
				return "move"
		"move":
			if tags.has("walk"):
				return "walk"
		"hurt":
			if tags.has("hit"):
				return "hit"
		"idle":
			if tags.has("move"):
				return "move"
	if tags.has("idle"):
		return "idle"
	if tags.has("move"):
		return "move"
	var keys: Array = tags.keys()
	return str(keys[0]) if not keys.is_empty() else ""

func get_frame_region(key: String, state: String, anim_time: float) -> Rect2:
	if not sheets.has(key):
		return Rect2()
	var s: Dictionary = sheets[key]
	if bool(s.get("has_aseprite_tags", false)):
		var tags: Dictionary = s.get("tags", {})
		var frame_rects: Array = s.get("frame_rects", [])
		var frame_durations: Array = s.get("frame_durations", [])
		var resolved: String = _resolve_tag_name(tags, state)
		if resolved != "" and tags.has(resolved) and not frame_rects.is_empty():
			var td: Dictionary = tags[resolved]
			var from_i: int = int(td.get("from", 0))
			var to_i: int = mini(int(td.get("to", from_i)), frame_rects.size() - 1)
			var looping: bool = bool(td.get("loop", true))
			var total_dur: float = maxf(0.05, float(td.get("duration", 0.5)))
			var t: float = maxf(0.0, anim_time)
			if looping:
				t = fmod(t, total_dur)
			else:
				t = minf(t, total_dur - 0.0001)
			var accum: float = 0.0
			var chosen: int = to_i
			for fi in range(from_i, to_i + 1):
				var fd: float = float(frame_durations[fi]) if fi < frame_durations.size() else 0.1
				accum += fd
				if t < accum:
					chosen = fi
					break
			return frame_rects[clampi(chosen, 0, frame_rects.size() - 1)]

	var fsize: int = int(s.get("frame_size", 64))
	var fps: float = float(s.get("fps", 8.0))
	var idx: int = 0
	match state:
		"hit", "hurt":
			idx = int(s.get("hit_frame", 0))
		"death":
			var d_count: int = int(s.get("death_count", 1))
			var step_i: int = clampi(int(anim_time * fps), 0, d_count - 1)
			idx = int(s.get("death_start", 0)) + step_i
		_:
			var w_count: int = maxi(1, int(s.get("walk_count", 1)))
			idx = int(floor(maxf(0.0, anim_time) * fps)) % w_count
	idx = clampi(idx, 0, int(s.get("hframes", 1)) - 1)
	return Rect2(float(idx * fsize), 0.0, float(fsize), float(fsize))
