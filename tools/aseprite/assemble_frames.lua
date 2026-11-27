-- Ink Night: The Lamp Bearer (Godot 4.7.2)
-- Aseprite Lua API multi-action assembly script (96x96 Cel-Ink Lamp Bearer)
-- Usage:
--   ASEPRITE="/Applications/Aseprite.app/Contents/MacOS/aseprite"
--   "$ASEPRITE" -b --script tools/aseprite/assemble_frames.lua

local function resolve_dir()
  local env_dir = os.getenv("INK_ART_ROOT")
  if env_dir and #env_dir > 0 then
    return env_dir
  end
  return "art_pipeline"
end

local root = resolve_dir()
local frames_dir = root .. "/frames_96"
local out_ase = root .. "/aseprite/player_mortal_cel.aseprite"

local tags = {
  { name = "idle",   count = 4, duration = 0.16, direction = AniDir.FORWARD },
  { name = "move",   count = 8, duration = 0.09, direction = AniDir.FORWARD },
  { name = "attack", count = 6, duration = 0.08, direction = AniDir.FORWARD },
  { name = "flip",   count = 6, duration = 0.10, direction = AniDir.FORWARD },
  { name = "hit",    count = 2, duration = 0.10, direction = AniDir.FORWARD },
  { name = "death",  count = 3, duration = 0.14, direction = AniDir.FORWARD },
}

local sprite = Sprite(96, 96, ColorMode.RGB)
local char_layer = sprite.layers[1]
char_layer.name = "Character"
local glow_layer = sprite:newLayer()
glow_layer.name = "LanternGlow"

local frame_idx = 0
for _, tag_def in ipairs(tags) do
  local start_frame = frame_idx + 1
  for i = 1, tag_def.count do
    frame_idx = frame_idx + 1
    local frame_file = string.format("%s/%s_%02d.png", frames_dir, tag_def.name, i)
    local img = Image{ fromFile = frame_file }
    assert(img ~= nil, "Missing frame PNG: " .. frame_file)
    assert(img.width == 96 and img.height == 96, "Frame must be 96x96: " .. frame_file)

    local frame
    if frame_idx == 1 then
      frame = sprite.frames[1]
    else
      frame = sprite:newEmptyFrame(frame_idx)
    end
    frame.duration = tag_def.duration
    sprite:newCel(char_layer, frame, img, Point(0, 0))
  end
  local end_frame = frame_idx
  local tag = sprite:newTag(start_frame, end_frame)
  tag.name = tag_def.name
  tag.aniDir = tag_def.direction
end

sprite:saveAs(out_ase)
print(string.format("[InkAseprite] Assembled %d frames into %s", frame_idx, out_ase))
