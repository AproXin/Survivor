# AGENTS.md — ink-night-survivor 工作区（美术素材线）

> 工作区级指令，优先于 `~/.dsh/AGENTS.md` 的通用条款，冲突时以本文件为准。

## 0. 工程坐标

- 项目：ink-night-survivor（Godot 4.7.2，水墨赛璐璐风 2.5D 割草生存）。
- 本机工作区 `/Users/yuanxxx/Documents/deepseek-harness/survivor`：**不是 git 仓库，没有 `project/`**；生成器与草稿在此，不入远端库。 — src: cmd:git rev-parse @2026-11-11
- ~~唯一真源：远端 `ssh win:/e/Agents/workspace/deepseek-harness/ink-night-survivor`（分支 main）。~~ **【2026-11-16 主人定：win 旧库作废，标废弃——不再当真源、不 commit、不 push 到 win；其 12 个未推提交＋56 个未提交改动随旧库一并废弃】**
- 现行真源：仅本机与 hermes 服务器（主人 2026-11-16 定；hermes 落地路径待定）。 — src: pachat 群 #297/#298 @2026-11-16
- 风格唯一标准图：`ink-night-design-pack/00-风格圣经-demo图.png`；色板唯一真值：`rt/iso-work/project/assets/sprites/palette-ink-night.json`（18 色 + 经验绿 3 色 = 21 项，第 19 色不存在）。 — src: file:ink-night-design-pack/00-设计稿与方案汇总.md @2026-11-11

## 1. 素材出图落地：到本地，不直接入项目（最高优先级）

**AI 生成 / 容器回传的任何草稿，只准落 `asset-drafts/<角色>/<YYYY-MM-DD>/`。** — src: file:asset-drafts/README.md @2026-11-11

硬规则（违反即事故）：

1. **落盘位置唯一** `asset-drafts/<角色>/<日期>/`。禁止写 `rt/iso-work/project/assets/**`，更禁止写远端真源库的 `project/assets/**`。
2. **草稿不接游戏**：不写 `data/enemies.json` 的 `texture` 字段、不改 `.tscn`、不跑 `--import`、不重跑 `tools/export_exclude.sh`。草稿唯一消费方式是「人看图拍板」。
3. **每轮三件套**：帧图 + `validate.txt` + `本轮记录.md`（参考图、模型、提示词版本、耗时、显存）。
4. **同角色多轮按日期分目录，不覆盖旧轮**，便于横向比对。
5. **晋级唯一出口**：用户拍板造型 → `spritegen` 按草稿重制 `.pxo`（同出 `.png`）→ `tools/spritegen/validate_sprite.py` 六道门禁 → 才进 `project/assets/sprites/`。跳过拍板直接进项目 = 事故。
6. **草稿合格 ≠ 可上线**；「五道门过完」只是草稿合格，不等于入库。

适用范围：Boss / 惩罚者等未定造型的概念草稿、视频拆帧参考、缩放与 18 色量化、抠图与锚点对齐、自动校验与打包。
禁区：逐张 AI 直出动画帧（帧间对不上，已实测翻车）；骨骼动画工具直入项目；用容器搭代理；把容器当长期服务器。 — src: file:ink-night-survivor-asset-pipeline-deploy-plan.pdf:1 @2026-11-11

## 2. 档位（设计包锁死，不许现编）

| 对象 | 档位 |
|---|---|
| 主角、Boss | 96 × 96 |
| 普通敌人、精英、**惩罚者** | 64 × 64 |
| 地表瓦片 | 32 × 32（只作拼接单元，禁止放大当角色） |

— src: file:docs/kai-gong-bao.md:174 @2026-11-11

## 3. 出图尺寸陷阱（必读）

在役素材是 HD 大图（`hd_v5/player_256_iso8` 1536×2048、`hd_v7/*_anim8` 2048×256），但门禁要求逐帧 96/64 像素格 + 18 色逐像素比对。**按 HD 尺寸出的草稿永远过不了 `validate.py`**——出图目标必须锁 96 或 64 档。 — src: file:HANDOVER-ink-night-art-2026-11-11.md:26 @2026-11-11

## 4. 落盘后立刻离线校验（本机可跑，不联网）

```bash
# 单帧门禁：尺寸 / 真透明 / 色板越界 / 朱红占比；退出码 0 = 过
/opt/homebrew/bin/python3 ~/Documents/pixel-sprite-plan/validate.py <图.png> --role hero|enemy|elite|scene|gem --size 96|64|32
# 像素化预处理：18 色限色 + 硬 alpha
/opt/homebrew/bin/python3 ~/Documents/pixel-sprite-plan/pixelize.py <src> <dst> --size 64 --role elite
```

报告一律重定向到同轮目录的 `validate.txt`。 — src: cmd:ls ~/Documents/pixel-sprite-plan @2026-11-11

## 5. 容器链路

- 定位锁死：容器只当草稿车间（出草稿/拆帧/像素化/自动校验/打包回传五件事），**不出成品**，成品管线不动。
- 开工顺序只有一条：先过 DCU 闸门验证 → 惩罚者单角色试点 → 用户拍板后才谈批量。闸门不过，整条链不启动，不在容器里反复折腾安装。
- 四项待用户拍板（未拍板前不得启动容器装环境）：试点角色 / 闸门不过时生成段改稳定环境还是搁置 / 视频生成通道与账号额度 / 五道门是否照此执行。 — src: file:ink-night-survivor-asset-pipeline-deploy-plan.pdf:6 @2026-11-11

## 6. 不要碰（其他 agent 产物或硬约束）

- 远端库：`.gitignore`、`docs/art-pipeline.md`、`project/tools/fx_roundtrip.gd`、`project/tools/pack_fx.gd`、`tools/launch_tmp.py`。 — src: file:HANDOVER-ink-night-art-2026-11-11.md:58 @2026-11-11
- `review/` 系列不入库；截图 PNG 不入库；`*_capture.gd` 可入库。
- 提交前必须：`--import` → `--headless --quit-after 240` 且 ERRCOUNT=0 → 实机截图审图 → 导出 EXE 冒烟（RUN_EXIT=0 且日志 0 error）。新增素材后必须重跑 `bash tools/export_exclude.sh`，否则新图不会被打包。
- 帧协议硬约束：`enemy.gd` 里 `hframes = 纹理宽/高`，表布局 = 走路 W + 受击 1 + 死亡 3，`hf<8` 视为单帧占位；换表必须同尺寸同帧数。 — src: file:HANDOVER-ink-night-art-2026-11-11.md:42 @2026-11-11
