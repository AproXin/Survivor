# 《墨夜点灯人》（Ink Night: The Lamp Bearer）— Godot 4.7.2 原生工程

> 本仓库基于 `AproXin/Survivor` 主分支 `ac9f3c6` 的完整 Godot 4.7.2（GL Compatibility）工程构建，已全面升级为 **严格 45° 俯视暗黑民俗水墨像素美术**，并无损整合 7 套 Cel-Ink 多动作图集（163 帧独立源帧 + Aseprite JSON Tag）、11 张 18 色锁盘 8 帧表、6 张 45° 参考原图、三形态战斗基准、昼夜生态与双界同址异化、程序化民俗环境音场、手柄焦点导航与无头测试。

## 推荐使用方式（GitHub Sync）

直接通过 **GitHub Sync** 将本仓库同步至你的 GitHub 仓库后，在本地拉取并用 Godot 4.7.2 打开 `godot-prototype/project.godot` 即可直接运行与导出，无需经过浏览器大文件 ZIP 代理下载。

```bash
git pull
GODOT=/Users/yuanxxx/Applications/Godot.app/Contents/MacOS/Godot
$GODOT --editor --path ./godot-prototype
```

## 目录说明

- `godot-prototype/`：可直接导入 Godot 4.7.2 打开、运行与导出的完整原生工程：
  - `scripts/`：完整 `main.gd`、`data.gd`、`renderer.gd`、`hud.gd`、`sprite_bank.gd`（支持 Aseprite JSON Tag 与旧 8 帧表双兼容）、`ambient_soundscape.gd`、`gamepad_focus.gd`。
  - `assets/sprites/`：全部 18 张严格 45° 俯视精灵表（7 套 Cel-Ink 多动作 PNG/JSON/QA 报告 + 11 张 `<= 16/18` 色锁盘 8 帧表）与 `reference/` 下 6 张 45° 高清源图。
  - `art_pipeline/`：7 套 Cel-Ink 角色的 163 张 45° 俯视单帧 PNG（`frames_96/` 及各角色目录），可直接由本地 Aseprite 批处理脚本装配。
  - `tools/aseprite/`：`assemble_frames.lua`、`qa_check.py` 与支持自动回退的 `build_pipeline.sh`。
  - `assets/fonts/` & `export_presets.cfg`：完整中英字体、裁剪脚本与 macOS/Windows 导出预设。
  - `tests/`：6 套 Godot 无头自动化测试脚本（含新增 `combat_and_ecology.gd`）。
- `public/downloads/ink-night-godot-4.7.2-complete.zip`：由 `node scripts/pack-godot-project.mjs` 自动生成的完整工程归档包。
- `scripts/verify-godot-project.test.mjs` & `scripts/combat-simulation.test.mjs`：验证完整源码、严格显式类型、全部 18 张精灵表规格、三形态战斗数值与 ZIP 完整性的自动化测试。
