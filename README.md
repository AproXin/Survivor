# 《墨夜点灯人》（Ink Night: The Lamp Bearer）— Godot 4.7.2 原生工程

> 本仓库基于 `AproXin/Survivor` 主分支 `ac9f3c6` 的完整 Godot 4.7.2（GL Compatibility）工程构建，已全面升级为 **严格 45° 俯视多向流畅水墨像素美术**，并无损整合 **10 套多向 Cel-Ink 图集（3 主角 8 方向 × 29 帧 + 7 昼夜敌怪/Boss 4 方向 × 19 帧，共 1,228 帧躯干锁点流畅序列）**、11 张 18 色锁盘 8 帧表、6 张多向 45° 参考原图、三形态战斗基准、昼夜生态与双界同址异化、程序化民俗环境音场、手柄焦点导航与无头测试。

## 推荐使用方式（GitHub Sync）

直接通过 **GitHub Sync** 将本仓库同步至你的 GitHub 仓库后，在本地拉取并用 Godot 4.7.2 打开根目录 `project.godot` 或 `godot-prototype/project.godot` 即可直接运行与导出（两端脚本与图集均已双向同步）。

```bash
git pull
GODOT=/Users/yuanxxx/Applications/Godot.app/Contents/MacOS/Godot
$GODOT --editor --path .
```

## 目录说明

- 根目录 & `godot-prototype/`（双向同步，均可直接导入 Godot 4.7.2 打开、运行与导出）：
  - `scripts/`：完整 `main.gd`、`data.gd`、`renderer.gd`、`hud.gd`、`sprite_bank.gd`（支持 8 向 / 4 向多行 Aseprite JSON Tag 与旧 8 帧表双兼容）、`ambient_soundscape.gd`、`gamepad_focus.gd`。
  - `assets/sprites/`：全部 21 张严格 45° 俯视精灵表（10 套 8向/4向 Cel-Ink 多动作 PNG/JSON/QA 报告 + 11 张 `<= 16/18` 色锁盘 8 帧表）与 `reference/` 下多向 45° 高清源图。
  - `tools/aseprite/`：`assemble_frames.lua`、支持 2D 多行多向图集的 `qa_check.py` 与一键 `build_pipeline.sh`。
  - `assets/fonts/` & `export_presets.cfg`：完整中英字体、裁剪脚本与 macOS/Windows 导出预设。
  - `tests/`：6 套 Godot 无头自动化测试脚本（含 `combat_and_ecology.gd`）。
- `public/downloads/ink-night-godot-4.7.2-complete.zip`：由 `node scripts/pack-godot-project.mjs` 自动生成的完整工程归档包。
- `scripts/verify-godot-project.test.mjs` & `scripts/combat-simulation.test.mjs`：验证完整源码、严格显式类型、全部 10 套多向图集与 11 张经典精灵表规格、三形态战斗数值与 ZIP 完整性的自动化测试。
