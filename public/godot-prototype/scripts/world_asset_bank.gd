extends RefCounted
class_name InkWorldAssetBank

const WORLD_MANIFEST_PATH := "res://assets/world/world_manifest.json"
const ITEMS_MANIFEST_PATH := "res://assets/items/items_manifest.json"

var tiles: Dictionary = {}
var buildings: Dictionary = {}
var props: Dictionary = {}
var landmarks: Dictionary = {}
var items: Dictionary = {}
var world_meta: Dictionary = {}
var items_meta: Dictionary = {}

func load_all() -> void:
	tiles.clear()
	buildings.clear()
	props.clear()
	landmarks.clear()
	items.clear()
	_load_world_manifest()
	_load_items_manifest()

func _load_json_dict(res_path: String) -> Dictionary:
	if not FileAccess.file_exists(res_path):
		return {}
	var file: FileAccess = FileAccess.open(res_path, FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	return parsed

func _load_texture(res_path: String) -> Texture2D:
	if res_path == "":
		return null
	if ResourceLoader.exists(res_path):
		var res: Resource = load(res_path)
		if res is Texture2D:
			return res
	var abs_path: String = ProjectSettings.globalize_path(res_path)
	if FileAccess.file_exists(abs_path):
		var img: Image = Image.new()
		if img.load(abs_path) == OK:
			return ImageTexture.create_from_image(img)
	return null

func _load_category(entries: Array, target: Dictionary) -> void:
	for raw_item in entries:
		if typeof(raw_item) != TYPE_DICTIONARY:
			continue
		var entry: Dictionary = raw_item
		var asset_id: String = str(entry.get("id", ""))
		var res_path: String = str(entry.get("res_path", ""))
		if asset_id == "" or res_path == "":
			continue
		var tex: Texture2D = _load_texture(res_path)
		if tex != null:
			target[asset_id] = tex

func _load_world_manifest() -> void:
	var doc: Dictionary = _load_json_dict(WORLD_MANIFEST_PATH)
	world_meta = doc
	var tile_entries: Array = doc.get("tiles", [])
	var bldg_entries: Array = doc.get("buildings", [])
	var prop_entries: Array = doc.get("props", [])
	var lm_entries: Array = doc.get("landmarks", [])
	_load_category(tile_entries, tiles)
	_load_category(bldg_entries, buildings)
	_load_category(prop_entries, props)
	_load_category(lm_entries, landmarks)

func _load_items_manifest() -> void:
	var doc: Dictionary = _load_json_dict(ITEMS_MANIFEST_PATH)
	items_meta = doc
	var upg_entries: Array = doc.get("upgrades", [])
	var pick_entries: Array = doc.get("pickups", [])
	_load_category(upg_entries, items)
	_load_category(pick_entries, items)

func get_tile(id: String) -> Texture2D:
	var tex: Variant = tiles.get(id, null)
	if tex is Texture2D:
		return tex
	return null

func get_building(id: String) -> Texture2D:
	var tex: Variant = buildings.get(id, null)
	if tex is Texture2D:
		return tex
	return null

func get_prop(id: String) -> Texture2D:
	var tex: Variant = props.get(id, null)
	if tex is Texture2D:
		return tex
	return null

func get_landmark(id: String) -> Texture2D:
	var tex: Variant = landmarks.get(id, null)
	if tex is Texture2D:
		return tex
	return null

func get_item(id: String) -> Texture2D:
	var tex: Variant = items.get(id, null)
	if tex is Texture2D:
		return tex
	return null

func total_loaded_count() -> int:
	return tiles.size() + buildings.size() + props.size() + landmarks.size() + items.size()
