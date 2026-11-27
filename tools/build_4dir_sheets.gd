extends SceneTree

## 《墨夜点灯人》四向 4x4 序列帧自动切片、抠白底、去朱红、重心校准与 JSON 打包工具（Godot 4.7.2 无头运行）
## 用法：
## 1. 将四向 4x4 原图保存至：
##      art_pipeline/raw_4dir/sheng_4x4.jpg (或 .png)
##      art_pipeline/raw_4dir/dan_4x4.jpg   (或 .png)
##      art_pipeline/raw_4dir/mortal_4x4.jpg (可选)
## 2. 运行：
##      /Users/yuanxxx/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --script res://tools/build_4dir_sheets.gd

const FRAME_SIZE := 96
const FOOT_Y := 90
const TARGET_H := 82.0

func _initialize() -> void:
	var proj_dir: String = ProjectSettings.globalize_path("res://")
	var raw_dir: String = proj_dir.path_join("art_pipeline/raw_4dir")
	var sprites_dir: String = proj_dir.path_join("assets/sprites")
	DirAccess.make_dir_recursive_absolute(raw_dir)

	var jobs: Array = [
		{"key": "player_sheng_cel", "raw": "sheng_4x4", "zero_vermilion": true},
		{"key": "player_dan_cel", "raw": "dan_4x4", "zero_vermilion": true},
		{"key": "player_mortal_cel", "raw": "mortal_4x4", "zero_vermilion": false},
	]

	var processed: int = 0
	for job_var in jobs:
		var job: Dictionary = job_var
		var raw_base: String = str(job["raw"])
		var src_path: String = _find_raw_file(raw_dir, raw_base)
		if src_path == "":
			continue
		print("[4DirPipeline] Processing ", job["key"], " from ", src_path)
		var ok: bool = _process_actor(proj_dir, sprites_dir, str(job["key"]), src_path, bool(job["zero_vermilion"]))
		if ok:
			processed += 1

	if processed == 0:
		print("[4DirPipeline] 未在 ", raw_dir, " 找到待处理的 *_4x4.(jpg|png) 原图。")
	else:
		print("[4DirPipeline] 全部处理完成，共更新 ", processed, " 套四向序列帧。")
	quit(0)

func _find_raw_file(raw_dir: String, stem: String) -> String:
	for ext in [".png", ".jpg", ".jpeg", ".webp"]:
		var p: String = raw_dir.path_join(stem + ext)
		if FileAccess.file_exists(p):
			return p
	return ""

func _process_actor(proj_dir: String, sprites_dir: String, actor_key: String, src_path: String, zero_vermilion: bool) -> bool:
	var src: Image = Image.load_from_file(src_path)
	if src == null or src.is_empty():
		printerr("[4DirPipeline] Failed to load: ", src_path)
		return false
	src.convert(Image.FORMAT_RGBA8)

	var cell_w: int = src.get_width() / 4
	var cell_h: int = src.get_height() / 4
	var out_frames_dir: String = proj_dir.path_join("art_pipeline/frames_" + actor_key + "_4dir")
	DirAccess.make_dir_recursive_absolute(out_frames_dir)

	var new_frames: Array[Image] = []
	var frame_names: Array[String] = [
		"move_down_01", "move_down_02", "move_down_03", "move_down_04",
		"move_up_01", "move_up_02", "move_up_03", "move_up_04",
		"move_side_01", "move_side_02", "move_side_03", "move_side_04",
		"attack_side_01", "attack_side_02", "attack_side_03", "attack_side_04",
	]

	for row in range(4):
		for col in range(4):
			var cell: Image = Image.create(cell_w, cell_h, false, Image.FORMAT_RGBA8)
			cell.blit_rect(src, Rect2i(col * cell_w, row * cell_h, cell_w, cell_h), Vector2i.ZERO)
			_flood_remove_white_bg(cell)
			if zero_vermilion:
				_sanitize_vermilion(cell)
			var norm: Image = _normalize_to_96(cell)
			new_frames.append(norm)
			var fname: String = frame_names[row * 4 + col]
			norm.save_png(out_frames_dir.path_join(fname + ".png"))

	# Reuse existing flip (6f: 18..23), hit (2f: 24..25), death (3f: 26..28) from current sheet if present
	var existing_png: String = sprites_dir.path_join(actor_key + ".png")
	var tail_frames: Array[Image] = []
	if FileAccess.file_exists(existing_png):
		var old_sheet: Image = Image.load_from_file(existing_png)
		if old_sheet != null and old_sheet.get_width() >= 29 * FRAME_SIZE:
			old_sheet.convert(Image.FORMAT_RGBA8)
			for idx in range(18, 29):
				var fimg: Image = Image.create(FRAME_SIZE, FRAME_SIZE, false, Image.FORMAT_RGBA8)
				fimg.blit_rect(old_sheet, Rect2i(idx * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE), Vector2i.ZERO)
				tail_frames.append(fimg)

	var all_frames: Array[Image] = []
	all_frames.append_array(new_frames)
	all_frames.append_array(tail_frames)

	var total_n: int = all_frames.size()
	var strip: Image = Image.create(total_n * FRAME_SIZE, FRAME_SIZE, false, Image.FORMAT_RGBA8)
	var frames_json: Array = []

	for i in range(total_n):
		var fimg: Image = all_frames[i]
		strip.blit_rect(fimg, Rect2i(0, 0, FRAME_SIZE, FRAME_SIZE), Vector2i(i * FRAME_SIZE, 0))
		var dur_ms: int = 120
		if i < 12:
			dur_ms = 115
		elif i < 16:
			dur_ms = 90
		elif i < 22:
			dur_ms = 100
		elif i < 24:
			dur_ms = 100
		else:
			dur_ms = 140
		var pivot_x: float = _measure_head_pivot_x(fimg)
		frames_json.append({
			"filename": "%s_%02d.png" % [actor_key, i],
			"frame": {"x": i * FRAME_SIZE, "y": 0, "w": FRAME_SIZE, "h": FRAME_SIZE},
			"rotated": false,
			"trimmed": false,
			"spriteSourceSize": {"x": 0, "y": 0, "w": FRAME_SIZE, "h": FRAME_SIZE},
			"sourceSize": {"w": FRAME_SIZE, "h": FRAME_SIZE},
			"duration": dur_ms,
			"pivot_x": pivot_x,
		})

	var out_png: String = sprites_dir.path_join(actor_key + ".png")
	strip.save_png(out_png)

	var tags: Array = [
		{"name": "idle", "from": 0, "to": 0, "frames": [0, 1], "direction": "forward"},
		{"name": "idle_down", "from": 0, "to": 0, "frames": [0, 1], "direction": "forward"},
		{"name": "idle_up", "from": 4, "to": 4, "frames": [4, 5], "direction": "forward"},
		{"name": "idle_side", "from": 8, "to": 8, "frames": [8, 9], "direction": "forward"},
		{"name": "move", "from": 8, "to": 11, "direction": "forward"},
		{"name": "move_down", "from": 0, "to": 3, "direction": "forward"},
		{"name": "move_up", "from": 4, "to": 7, "direction": "forward"},
		{"name": "move_side", "from": 8, "to": 11, "direction": "forward"},
		{"name": "attack", "from": 12, "to": 15, "direction": "forward"},
		{"name": "attack_side", "from": 12, "to": 15, "direction": "forward"},
	]
	if total_n >= 27:
		tags.append({"name": "flip", "from": 16, "to": 21, "direction": "forward"})
		tags.append({"name": "hit", "from": 22, "to": 23, "direction": "forward"})
		tags.append({"name": "death", "from": 24, "to": 26, "direction": "forward"})

	var doc: Dictionary = {
		"frames": frames_json,
		"meta": {
			"app": "InkNight-4DirPipeline",
			"version": "1.0",
			"image": actor_key + ".png",
			"format": "RGBA8888",
			"size": {"w": total_n * FRAME_SIZE, "h": FRAME_SIZE},
			"scale": "1",
			"anchor": {"x": 48, "y": FOOT_Y},
			"frameTags": tags,
		},
	}
	var out_json: String = sprites_dir.path_join(actor_key + ".json")
	var f_out: FileAccess = FileAccess.open(out_json, FileAccess.WRITE)
	f_out.store_string(JSON.stringify(doc, "  "))
	f_out.close()
	print("[4DirPipeline] Exported ", out_png, " (", total_n, " frames, 4-dir tags) -> ", out_json)
	return true

func _flood_remove_white_bg(img: Image) -> void:
	var w: int = img.get_width()
	var h: int = img.get_height()
	var visited: PackedByteArray = PackedByteArray()
	visited.resize(w * h)
	var queue: Array[Vector2i] = []
	for x in range(w):
		queue.append(Vector2i(x, 0))
		queue.append(Vector2i(x, h - 1))
	for y in range(h):
		queue.append(Vector2i(0, y))
		queue.append(Vector2i(w - 1, y))
	var head: int = 0
	while head < queue.size():
		var p: Vector2i = queue[head]
		head += 1
		if p.x < 0 or p.x >= w or p.y < 0 or p.y >= h:
			continue
		var idx: int = p.y * w + p.x
		if visited[idx] != 0:
			continue
		visited[idx] = 1
		var c: Color = img.get_pixel(p.x, p.y)
		var is_bg: bool = (c.r > 0.87 and c.g > 0.87 and c.b > 0.87) or (c.a < 0.05)
		if not is_bg:
			continue
		img.set_pixel(p.x, p.y, Color(0, 0, 0, 0))
		queue.append(Vector2i(p.x + 1, p.y))
		queue.append(Vector2i(p.x - 1, p.y))
		queue.append(Vector2i(p.x, p.y + 1))
		queue.append(Vector2i(p.x, p.y - 1))
	# Soft anti-halo pass on immediate fringe pixels adjacent to transparent bg
	for y in range(1, h - 1):
		for x in range(1, w - 1):
			var c: Color = img.get_pixel(x, y)
			if c.a > 0.1 and c.r > 0.88 and c.g > 0.88 and c.b > 0.88:
				var adj_trans: int = 0
				if img.get_pixel(x - 1, y).a < 0.05: adj_trans += 1
				if img.get_pixel(x + 1, y).a < 0.05: adj_trans += 1
				if img.get_pixel(x, y - 1).a < 0.05: adj_trans += 1
				if img.get_pixel(x, y + 1).a < 0.05: adj_trans += 1
				if adj_trans >= 2:
					img.set_pixel(x, y, Color(0, 0, 0, 0))

func _sanitize_vermilion(img: Image) -> void:
	var w: int = img.get_width()
	var h: int = img.get_height()
	for y in range(h):
		for x in range(w):
			var c: Color = img.get_pixel(x, y)
			if c.a > 0.1 and c.r > c.g + 0.12 and c.r > c.b + 0.12:
				var lum: float = clampf(c.r * 0.25 + c.g * 0.55 + c.b * 0.20, 0.05, 0.25)
				img.set_pixel(x, y, Color(lum * 0.85, lum * 0.95, lum, c.a))

func _normalize_to_96(cell: Image) -> Image:
	var w: int = cell.get_width()
	var h: int = cell.get_height()
	var x0: int = w
	var y0: int = h
	var x1: int = 0
	var y1: int = 0
	for y in range(h):
		for x in range(w):
			if cell.get_pixel(x, y).a > 0.15:
				if x < x0: x0 = x
				if y < y0: y0 = y
				if x > x1: x1 = x
				if y > y1: y1 = y
	var out: Image = Image.create(FRAME_SIZE, FRAME_SIZE, false, Image.FORMAT_RGBA8)
	if x1 < x0 or y1 < y0:
		return out
	var bw: int = x1 - x0 + 1
	var bh: int = y1 - y0 + 1
	var crop: Image = Image.create(bw, bh, false, Image.FORMAT_RGBA8)
	crop.blit_rect(cell, Rect2i(x0, y0, bw, bh), Vector2i.ZERO)
	var scale_f: float = minf(TARGET_H / float(bh), 88.0 / float(bw))
	var nw: int = maxi(1, int(round(float(bw) * scale_f)))
	var nh: int = maxi(1, int(round(float(bh) * scale_f)))
	crop.resize(nw, nh, Image.INTERPOLATE_LANCZOS)
	var dst_x: int = (FRAME_SIZE - nw) / 2
	var dst_y: int = clampi(FOOT_Y - nh, 2, FRAME_SIZE - nh)
	out.blit_rect(crop, Rect2i(0, 0, nw, nh), Vector2i(dst_x, dst_y))
	return out

func _measure_head_pivot_x(img: Image) -> float:
	var y0: int = FRAME_SIZE
	for y in range(FRAME_SIZE):
		for x in range(FRAME_SIZE):
			if img.get_pixel(x, y).a > 0.15:
				if y < y0:
					y0 = y
	var hsum: float = 0.0
	var hcnt: int = 0
	var h_end: int = mini(FRAME_SIZE - 1, y0 + 24)
	for y in range(y0, h_end + 1):
		for x in range(FRAME_SIZE):
			if img.get_pixel(x, y).a > 0.15:
				hsum += float(x)
				hcnt += 1
	return snappedf((hsum / float(hcnt)) if hcnt > 0 else 48.0, 0.1)
