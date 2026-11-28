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
		"eight_way": false,
		"tags": {},
		"frame_rects": [],
		"frame_durations": [],
		"frame_pivots": [],
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
	var frame_pivots: Array = []
	var default_pivot_x: float = float(sheet.get("frame_size", 96)) * 0.5
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
		frame_pivots.append(float(fr_dict.get("pivot_x", rw * 0.5 if rw > 0.0 else default_pivot_x)))

	var meta: Dictionary = ase_doc.get("meta", {})
	var tags_raw: Array = meta.get("frameTags", [])
	var tags_map: Dictionary = {}
	var has_eight_way: bool = false
	for t_item in tags_raw:
		if typeof(t_item) != TYPE_DICTIONARY:
			continue
		var td: Dictionary = t_item
		var t_name: String = str(td.get("name", ""))
		if t_name == "":
			continue
		if t_name.ends_with("_ne") or t_name.ends_with("_se") or t_name.ends_with("_nw") or t_name.ends_with("_sw"):
			has_eight_way = true
		var from_i: int = int(td.get("from", 0))
		var to_i: int = int(td.get("to", from_i))
		var base_state: String = t_name.split("_")[0]
		var looping: bool = (base_state == "idle" or base_state == "move" or base_state == "walk")
		var seq: Array[int] = []
		var custom_frames: Variant = td.get("frames", null)
		if typeof(custom_frames) == TYPE_ARRAY and not (custom_frames as Array).is_empty():
			for raw_fi in (custom_frames as Array):
				var fi_val: int = clampi(int(raw_fi), 0, maxi(0, frame_rects.size() - 1))
				seq.append(fi_val)
		else:
			for fi in range(from_i, mini(to_i + 1, frame_rects.size())):
				seq.append(fi)
		var total_dur: float = 0.0
		for fi in seq:
			total_dur += float(frame_durations[fi]) if fi < frame_durations.size() else 0.1
		tags_map[t_name] = {
			"from": from_i,
			"to": to_i,
			"frames": seq,
			"loop": looping,
			"duration": maxf(0.05, total_dur),
			"direction": str(td.get("direction", "forward")),
		}

	var anchor: Dictionary = meta.get("anchor", {})
	if not anchor.is_empty():
		sheet["anchor_x"] = float(anchor.get("x", 48.0))
		sheet["anchor_y"] = float(anchor.get("y", 90.0))

	if not frame_rects.is_empty() and not tags_map.is_empty():
		var first_rect: Rect2 = frame_rects[0]
		if first_rect.size.y > 0.0:
			sheet["frame_size"] = maxi(1, int(first_rect.size.y))
		sheet["has_aseprite_tags"] = true
		sheet["eight_way"] = has_eight_way
		sheet["frame_rects"] = frame_rects
		sheet["frame_durations"] = frame_durations
		sheet["frame_pivots"] = frame_pivots
		sheet["tags"] = tags_map
		sheet["hframes"] = frame_rects.size()
		if tags_map.has("move"):
			var mt: Dictionary = tags_map["move"]
			var mseq: Array = mt.get("frames", [])
			sheet["walk_count"] = mseq.size() if not mseq.is_empty() else (int(mt.get("to", 0)) - int(mt.get("from", 0)) + 1)
		if tags_map.has("hit"):
			var ht: Dictionary = tags_map["hit"]
			sheet["hit_frame"] = int(ht.get("from", 0))
		if tags_map.has("death"):
			var dt_tag: Dictionary = tags_map["death"]
			sheet["death_start"] = int(dt_tag.get("from", 0))
			sheet["death_count"] = int(dt_tag.get("to", 0)) - int(dt_tag.get("from", 0)) + 1
	sheets[key] = sheet
	return sheet

static func dir_from_vector(vec: Vector2, eight_way: bool = false) -> Dictionary:
	if vec.length_squared() <= 0.0001:
		return {"dir": "down", "flip_x": false}
	if not eight_way:
		if absf(vec.x) >= absf(vec.y) * 0.85:
			return {"dir": "side", "flip_x": vec.x < 0.0}
		if vec.y < 0.0:
			return {"dir": "up", "flip_x": false}
		return {"dir": "down", "flip_x": false}
	var angle: float = atan2(vec.y, vec.x)
	var oct: int = int(round(angle / (PI * 0.25))) & 7
	# 0:E, 1:SE, 2:S, 3:SW, 4:W, 5:NW, 6:N, 7:NE
	match oct:
		0: return {"dir": "e", "flip_x": false}
		1: return {"dir": "se", "flip_x": false}
		2: return {"dir": "s", "flip_x": false}
		3: return {"dir": "sw", "flip_x": false}
		4: return {"dir": "w", "flip_x": false}
		5: return {"dir": "nw", "flip_x": false}
		6: return {"dir": "n", "flip_x": false}
		_: return {"dir": "ne", "flip_x": false}

func has_sheet(key: String) -> bool:
	return sheets.has(key)

func has_tag(key: String, tag_name: String) -> bool:
	if not sheets.has(key):
		return false
	var s: Dictionary = sheets[key]
	var tags: Dictionary = s.get("tags", {})
	return tags.has(tag_name)

func has_directional_tags(key: String) -> bool:
	if not sheets.has(key):
		return false
	var s: Dictionary = sheets[key]
	var tags: Dictionary = s.get("tags", {})
	for t_name in tags.keys():
		var ts: String = str(t_name)
		if ts.ends_with("_up") or ts.ends_with("_down") or ts.ends_with("_side") or ts.ends_with("_n") or ts.ends_with("_s") or ts.ends_with("_e"):
			return true
	return false

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

func _resolve_tag_name(tags: Dictionary, state: String, dir_name: String = "") -> String:
	var candidates: Array[String] = []
	if dir_name != "":
		candidates.append(state + "_" + dir_name)
		if state == "walk":
			candidates.append("move_" + dir_name)
		elif state == "move":
			candidates.append("walk_" + dir_name)
		elif state == "hurt":
			candidates.append("hit_" + dir_name)
		elif state == "idle":
			candidates.append("move_" + dir_name)
		# 8-way mirror fallback (w/nw/sw -> e/ne/se)
		if dir_name == "w":
			candidates.append(state + "_e")
		elif dir_name == "nw":
			candidates.append(state + "_ne")
		elif dir_name == "sw":
			candidates.append(state + "_se")
	candidates.append(state)
	match state:
		"walk":
			candidates.append("move")
		"move":
			candidates.append("walk")
		"hurt":
			candidates.append("hit")
		"idle":
			candidates.append("move")
	for c in candidates:
		if tags.has(c):
			return c
	if tags.has("idle"):
		return "idle"
	if tags.has("move"):
		return "move"
	var keys: Array = tags.keys()
	return str(keys[0]) if not keys.is_empty() else ""

func get_frame_data(key: String, state: String, anim_time: float, dir_name: String = "") -> Dictionary:
	if not sheets.has(key):
		return {"region": Rect2(), "pivot_x": 0.0, "used_dir": false}
	var s: Dictionary = sheets[key]
	var fsize: int = int(s.get("frame_size", 64))
	if bool(s.get("has_aseprite_tags", false)):
		var tags: Dictionary = s.get("tags", {})
		var frame_rects: Array = s.get("frame_rects", [])
		var frame_durations: Array = s.get("frame_durations", [])
		var frame_pivots: Array = s.get("frame_pivots", [])
		var resolved: String = _resolve_tag_name(tags, state, dir_name)
		if resolved != "" and tags.has(resolved) and not frame_rects.is_empty():
			var td: Dictionary = tags[resolved]
			var seq: Array = td.get("frames", [])
			if seq.is_empty():
				var from_i: int = int(td.get("from", 0))
				var to_i: int = mini(int(td.get("to", from_i)), frame_rects.size() - 1)
				for fi in range(from_i, to_i + 1):
					seq.append(fi)
			var looping: bool = bool(td.get("loop", true))
			var total_dur: float = maxf(0.05, float(td.get("duration", 0.5)))
			var t: float = maxf(0.0, anim_time)
			if looping:
				t = fmod(t, total_dur)
			else:
				t = minf(t, total_dur - 0.0001)
			var accum: float = 0.0
			var chosen: int = int(seq[seq.size() - 1])
			for raw_fi in seq:
				var fi: int = int(raw_fi)
				var fd: float = float(frame_durations[fi]) if fi < frame_durations.size() else 0.1
				accum += fd
				if t < accum:
					chosen = fi
					break
			chosen = clampi(chosen, 0, frame_rects.size() - 1)
			var px: float = float(frame_pivots[chosen]) if chosen < frame_pivots.size() else (float(fsize) * 0.5)
			var used_dir: bool = (dir_name != "" and resolved.contains("_"))
			return {"region": frame_rects[chosen], "pivot_x": px, "used_dir": used_dir}

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
	return {"region": Rect2(float(idx * fsize), 0.0, float(fsize), float(fsize)), "pivot_x": float(fsize) * 0.5, "used_dir": false}

func get_frame_region(key: String, state: String, anim_time: float, dir_name: String = "") -> Rect2:
	return get_frame_data(key, state, anim_time, dir_name).get("region", Rect2())
