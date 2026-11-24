# Ink-Night 高清重绘：提示词规范与生产排期

日期：2026-11-10
适用：E:/Agents/workspace/deepseek-harness/ink-night-survivor（Windows，ssh win）
工具链（唯一允许）：pixel-vfx / agent-sprite-forge / spritegen / Friction / Natron / Pixelorama / Godot
模型直出唯一允许：agy cli（且必须配完整提示词）

## 0. 角色分工（每类素材只有一条合法链路）

| 素材类别 | 主产出方式 | 后处理 | 落库 |
|---|---|---|---|
| 角色/怪物（少年、生、旦、幽魂、僵尸、精英、判官、差役、白衣人） | agy cli 出高清原画（1024x1024 母版）→ sprite-forge 像素化 | pixel_reduce / palette_tool / scale_frames | project/assets/sprites/hd_v3/ |
| 八向行走帧 | spritegen 程序化母版 + agy 参考图风格约束；或 sprite-forge video2dsprite（无视频路由时走 spritegen 差分） | 对位 scale_frames + root-lock | 同上 |
| 场景地面/道具（墓碑、断墙、竹子、草丛、大墓碑、水面、门、灯笼） | agy cli 出等距 2:1 高清原画 → pixel_reduce 收色板 | Pixelorama 手工修 → pxo_writer 出 .pxo | project/assets/sprites/hd_v3/ |
| VFX（灯焰、刀光、符咒、命中火花、烟雾） | pixel-vfx JSON recipe（确定性本地渲染，不生图） | render.mjs 直接出 sheet+json | project/assets/sprites/fx/ |
| 图集打包 | — | Godot pack_fx.gd / spritegen sheet() | — |

硬约束：
1. 任何图生图必须写完整提示词（八段式见 §2），不许"随便生成一张"。
2. 像素感不靠提示词，靠后期：pixel_reduce.py（禁止 nearest 缩图，一律 box/lanczos 预缩 + 多数决收色板）。
3. 成品色板必须落在 palette-ink-night.json（18 色 + 经验绿 3 色）内，朱红 ≤5% 且只给精英红眼/印章。
4. 尺寸协议不因重绘改变：少年/生/旦 192、幽魂/僵尸 128、精英 160、判官 192、差役 128、白衣人 192；场景 64–256。
5. 帧协议不因重绘改变：幽魂 4走+受击1+死亡3=8；其余 6走+受击1+死亡3=10。玩法、碰撞、场景不碰。

## 1. 母版清单（一张原画 = 一个身份）

| # | 身份 | 类 | 尺寸 | 关键识别点 |
|---|---|---|---|---|
| M1 | 提灯少年 | hero | 192 | 灰蓝袍、黑斗笠、手提暖黄六角灯笼 |
| M2 | 生 | hero | 192 | 净面、白衣黑褂、右手快剑、左手圆灯笼 |
| M3 | 旦 | hero | 192 | 骨白长水袖、脸不画妆面纹、符纸、圆灯笼 |
| M4 | 幽魂 | mob | 128 | 灰白雾状、黑色椭圆眼口 |
| M5 | 僵尸 | mob | 128 | 深灰袍、黑帽、黄色额头符、双臂前伸 |
| M6 | 红眼大幽魂 | elite | 160 | M4 + 朱红眼 |
| M7 | 红眼印章僵尸 | elite | 160 | M5 + 胸前朱红圆印 |
| M8 | 纸扎判官 | boss | 192 | 纸扎质、冠冕、朱红官袍、判官笔 |
| M9 | 白纸差役 | boss | 128 | 白纸糊、白纸脸、无眼 |
| M10 | 白衣人 | boss | 192 | 白衣、素面 |
| P1–P22 | 场景道具 22 件 | prop | 64–256 | 墓碑/断墙/竹/草丛/大墓碑/水/门/石灯… |

## 2. 角色母版提示词模板（八段式，缺一段重出）

顺序固定：① 一张方形图 ② 风格行 ③ 文字禁令 ④ 参考图角色 ⑤ 朝向三写法 ⑥ 身份长描述 ⑦ 画布边距百分比 ⑧ 平键色不透明

    Create exactly ONE square image (1024x1024).

    premium HD 2D game art: a clean, high-resolution hand-painted sprite illustration with crisp sharp edges,
    a clean dark outline, rich but controlled colours, cel shading with soft highlights and clear light and
    shadow shapes, fine readable detail, no blur, no photo-realism, no 3D render look.
    [仅当要求像素风时追加] premium 16-bit pixel art (SNES era), crisp visible chunky pixels, limited palette,
    strong dark outline, 3-tone cel shading, no smooth gradients, no blur.

    No text, no letters, no numbers, no logo, no watermark, no signature, no UI, no border, no frame, no grid.

    [有参考图时] The FIRST attached image is the approved master still of this exact character; copy his face,
    hat, costume colours and his lantern exactly. The SECOND attached image is an approved in-game peer sprite;
    match its style, outline weight, shading, figure size and canvas position, but do NOT copy its outfit.

    clearly FACING RIGHT: his face, gaze and chest turn toward the RIGHT edge of the image; forward is RIGHT and
    his back is toward the LEFT edge.

    [身份长描述]
    The same <identity_recap>:
    - 提灯少年：a young lantern bearer in a slate-blue robe, a wide low black conical hat, short dark hair
      visible under the hat rim, bare thin hands; his right hand holds a small six-sided paper lantern that
      glows warm amber, hanging at hip height, the lantern is the ONLY warm light source on him.
      Grey-blue robe, no red, no gold trim, no pipe, no animals.

    the top of the figure about 14 percent below the top edge of the canvas and its lowest point about 14
    percent above the bottom edge, centred, generous empty margin on every side, nothing touching or
    crossing the edges.

    The whole figure (hat, lantern, cloth) is drawn with solid, fully opaque pixels: no transparency, no
    semi-transparent glow, no soft aura, nothing blended with the background.
    Background: solid flat pure magenta #FF00FF everywhere outside the character, no shadow, no ground, no
    glow on the background.

紫/粉/朱红设计换键色：M2 生、M3 旦、判官含朱红 → 键色改 #00FF00（绿）或 #0000FF（蓝），禁洋红。

等距场景道具模板（替换角色段）：

    2:1 dimetric isometric: ground lines rise 1 px for every 2 px across; a floor tile is a diamond twice as
    wide as tall; vertical edges stay vertical; no perspective.
    [道具描述 + 该道具只出现在《夜晚墓园》场景清单内]
    the object stands on the ground plane, footprint centred on the diamond, its base is the lowest pixel
    row and nothing crosses the canvas edge.
    Background: solid flat pure magenta #FF00FF (or green key for red-accented props), no ground shadow.

场景底图模板（generate2dmap 路线）：

    Create ONE 16:9 image (1672x941) of a top-down Chinese ink-wash night graveyard.
    Low-saturation ink-paint night palette, near-black indigo dominant, moonlit cold blue-grey, one small
    warm amber lantern glow as the only warm accent, pale fog pooling in the far half.
    Elements allowed and nothing else: grey tombstones, a broken stone wall, bamboo clumps, grass tufts,
    a dirt path, a full moon, a green experience gem.
    No characters, no monsters, no UI, no text, no HUD, no health bar, no watermark.

## 3. 修补提示词（改图不重摇）

    Reproduce the FIRST image exactly: the same single figure at exactly the same size and same position on
    the canvas (the top of the figure about 13 percent below the top edge, the lowest point about 13 percent
    above the bottom edge), the same pose, three-quarter view facing RIGHT, the same <identity_recap>.
    Same <style> as the FIRST image.

    THE ONLY CHANGE: <一次只改一处：把脸改成 SECOND 图的脸 / 去掉腰间的红绳 / 把灯笼改成六角>
    Everything else (costume, hat, armour, silhouette) stays exactly as in the FIRST image.

## 4. 帧与特效（不生图路径）

### 4.1 八向行走（spritegen 路线）
- 母版：agy 出 8 张同角色不同朝向的静帧（提示词只改 "clearly FACING X" 一句，其余逐字相同）。
- 走姿：程序化在母版基础上做 6 相位（step 0–5），NEAR/FAR 腿用明暗两色区分，禁止左右腿措辞。
- 帧表：少年/生/旦 8 向 × 6 相位；幽魂 4 相位；僵尸/精英/差役/判官/白衣人 6 相位。
- 受击 1 帧 + 死亡 3 帧（抹除消散），死亡帧沿用"擦除"而非缩放。

### 4.2 VFX（pixel-vfx，确定性）

    {
      "name": "Hit Spark", "w": 64, "h": 64, "frames": 10, "fps": 18, "loop": false, "seed": 7,
      "ramps": { "main": "bone", "spark": "bone" },
      "outline": "none", "dither": 0, "pivot": [0.5, 0.5],
      "layers": [
        { "type": "flash", "ramp": "$main", "r": 0.4, "dur": 0.1 },
        { "type": "ring", "ramp": "$main", "r0": 0.1, "r1": 0.96, "th": 0.22, "breakup": 0.6 },
        { "type": "star", "ramp": "$main", "r": 0.3 },
        { "type": "particles", "ramp": "$spark", "mode": "burst", "count": 16, "speed": [2, 3.2],
          "drag": 2.4, "shape": "streak", "size": 2 }
      ]
    }

色感映射到项目色板：主暖黄（灯笼）用 warm 系；冷光（鬼火/月光）用 ice/frost；朱红只用于命中精英。

## 5. 生产排期

### 阶段 0 · 准备（0.5 天）
- 建 art-src/hd_v3/{master,props,fx}/，只放原图，不入库。
- 建 project/assets/sprites/hd_v3/。
- 校验色板文件与 tools/spritegen/pxo_writer.load_palette 一致。

### 阶段 1 · 角色母版（1.5 天）
- M1–M10 各 3 张候选 → 各 1 张核准 → master.json 归档（身份 recap、朝向、键色、路由）。
- 验收：单张方形、无文字、无边缘裁切、正面与背面朝向不混；朱红只出现在 M6/M7/M8。

### 阶段 2 · 角色帧（2 天）
- spritegen 生成八向 × 相位 + 受击 + 死亡；导出 PNG + .pxo。
- 验收：帧协议不变（8/10）、root 对齐、灯笼不换手、NEAR/FAR 明暗交替。

### 阶段 3 · 场景与道具（1.5 天）
- P1–P22 逐个 agy 出等距原画 → pixel_reduce 收色板 → Pixelorama 手工修 → pxo。
- 地面底图一张 16:9 → 切 iso 地砖。
- 验收：2:1 等距成立；色板内；朱红 0。

### 阶段 4 · VFX（0.5 天）
- pixel-vfx recipe × 6（灯焰/刀光/符咒/命中/烟雾/鬼火）→ render.mjs → pack_fx.gd。
- 验收：帧矩形一致、锚点对、循环首尾相接。

### 阶段 5 · 接入与回归（1 天）
- 改 player.tscn / enemy_ghost.tscn / enemy_jiangshi.tscn / game.gd / enemies.json / terrain.json 指到 hd_v3。
- python -m unittest discover -s tools/spritegen 全绿。
- Godot headless --quit-after 240 无脚本错误。
- 实机截图人工过一遍。

### 阶段 6 · 导出（0.5 天）
- Windows EXE 导出 + 启动验证。

## 6. 命令速查

agy cli 出原画（唯一合法生图入口）：

    ~/.local/bin/agy -p "<完整八段式提示词>。生成 1024x1024 PNG，保存到 /path/out.png，然后打印路径。" \
      --output-format json --dangerously-skip-permissions

实测：单图约 50 秒，返回 {"status":"SUCCESS","response":"...out.png"}。

像素化（收色板，禁止 nearest）：

    python "<forge>/skills/generate2dsprite/scripts/pixel_reduce.py" \
      --input raw/hero.png --output-dir out/hero-1x \
      --palette project/assets/palette-ink-night.json --method box --upscale 4

调色板吸附与锁定：

    python "<forge>/skills/generate2dsprite/scripts/palette_tool.py" apply --input frames --palette <pal> --output-dir out
    python "<forge>/skills/generate2dsprite/scripts/palette_tool.py" lock --input frames --output-dir out

帧对位：

    python "<forge>/skills/generate2dsprite/scripts/scale_frames.py" --frames out/walk/*.png \
      --output-dir out/walk --target-body-px 192 --resampler box --anchor feet --root-lock torso-x --emit-clips

VFX 渲染：

    node "<pixel-vfx>/scripts/render.mjs" recipe.json --out vfx --scale 4 --frames
    node "<pixel-vfx>/scripts/render.mjs" recipe.json --backdrop hero.png --at 96,160

Godot 打包 VFX：

    Godot --headless --path . --script res://tools/pack_fx.gd -- \
      --in=E:/.../frames --clip=<clip> --out=res://assets/sprites/fx --fps=14 --loop=true --pivot=0.5,0.62

## 7. 已知坑

1. agy cli --mode auto 在本账号不可用，会提示降级，不要加该参数。
2. 无任何生图 API key：forge 路由只剩本地 codex-cli（未验证）+ codeart2d 兜底；因此统一用 agy cli。
3. agy 生成图为 RGB 无 alpha，需后期 keying；生成时一律要求纯色键背景。
4. 提示词写"像素网格"无效，像素由 pixel_reduce 后期产生。
5. 紫/粉/朱红设计必须换绿色或蓝色键色，否则 keying 会吃掉主体。
6. 远端写脚本必须 ssh win bash -c 'cat > path' + stdin 传字节，heredoc 会把 shell 命令混进 py 文件。
7. 改 terrain.json / enemies.json 后必须跑 spritegen 单测，防止 props 被清空。
8. Friction/Natron/Pixelorama/Godot 属其他 agent 资产，本任务只读不改其文档。
