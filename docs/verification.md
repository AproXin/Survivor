# Godot 技术样片验收报告

日期：2026-11-25

工程：`/Users/yuanxxx/Agents/qoder/tasks/ink/godot-prototype`

引擎：Godot `4.7.2.stable.official.ed1daf0bf`

设备：MacBook M1，OpenGL 4.1 Metal Compatibility

计划完成度：11 / 11 个任务

## 结论

**PASS WITH LIMITATIONS — 技术迁移可行，建议进入全量迁移前先做一轮视觉细化。**

- 功能、操作、战斗、翻界、禁忌、升级、暂停、结算、音效链路全部跑通。
- 100 敌人平均 `59.9 FPS`，超过 `55 FPS` 验收门。
- 真实时间连续运行 `59.9` 秒后成功结束，`89.0 FPS`，无脚本错误。
- 标题、HUD、双世界、灯笼暖光和核心元素与当前网页版同一路数。
- 视觉仍比网页版更暗、更简；升级卡牌、标题徽记和角色细节需要细化。最终“像不像”由用户看截图确认。

## 功能验收

| 项目 | 结果 | 证据 |
|---|---|---|
| 标题开始、静音、操作提示 | 通过 | `screenshots/title.png` |
| WASD/方向键、斜向归一化、边界 | 通过 | `tests/smoke.gd` |
| 自动灯笼攻击、生/旦攻击、受击、击退 | 通过 | `tests/smoke.gd`、`screenshots/mortal.png` |
| Space 翻界、冷却、冲击、Q 切形态 | 通过 | `tests/smoke.gd`、`screenshots/spectral.png` |
| 游魂/行尸追踪、死亡、经验掉落 | 通过 | `tests/smoke.gd` |
| 三条禁忌实际触发 | 通过 | `tests/smoke.gd`、`docs/screenshots` 之外的 taboo 预览 |
| 升级三选一、三项升级生效 | 通过 | `tests/smoke.gd`、`screenshots/levelup.png` |
| 暂停、60 秒成功、死亡、重开、回标题 | 通过 | `tests/smoke.gd`、`screenshots/pause.png`、`screenshots/result.png` |
| 七类合成音效、主总线静音 | 通过 | `tests/smoke.gd`、窗口音频冒烟 |
| 100 敌人性能 | 通过 | `BENCHMARK fps=59.9 enemies=100 seconds=5.0` |
| 60 秒加速模拟 | 通过 | `FULL_RUN time=60.0 kills=50 level=4 violations=0 enemies=61 phase=4 victory=true` |
| 60 秒真实时间运行 | 通过 | `SOAK seconds=59.9 phase=4 victory=true kills=86 level=5 fps=89.0` |

## 六张验收截图

- [标题页](screenshots/title.png)
- [人间战斗](screenshots/mortal.png)
- [诡界生剑](screenshots/spectral.png)
- [升级三选一](screenshots/levelup.png)
- [暂停](screenshots/pause.png)
- [结算](screenshots/result.png)

## 视觉对照

### 已还原

- 左侧三分之一标题构图、英文副标题、朱红印章、主/次按钮。
- 羊皮纸 HP/灯油/等级/时间、顶部禁忌、右侧铜钱/经验/暂停/静音。
- 18 色主色板＋3 色经验绿；灯笼是唯一稳定暖色光源。
- 墓碑、竹子、草丛、土路、满月、雾、绿色经验宝石。
- 人间/诡界亮度差异、灯笼半径差异、翻界光圈与闪白。
- 生剑、旦水袖、幽灵、行尸、差役、白衣人和阴影/熄灯警示。

### 未达到当前网页版

- 世界整体更暗，墓碑和植被纹理比网页版简单。
- 标题徽记比网页版 SVG  Brush 图形简略。
- 升级卡牌颜色偏暗，没有网页版羊皮纸的明亮层次。
- 生/旦面具和水袖是几何原型，不是完整笔触细节。
- 角色、幽灵、白衣人的细节较少，尚未达到概念图密度。

这些不阻塞技术结论，但全量迁移应增加一个独立美术细化阶段。

## 性能数据

### 100 敌人基准

```text
BENCHMARK fps=59.9 enemies=100 seconds=5.0
```

测试设置：100 个游魂/行尸同时活动，玩家高生命以避免中途结束，关闭自动攻击以保持敌人数，窗口渲染五秒。

### 60 秒真实运行

```text
SOAK seconds=59.9 phase=4 victory=true kills=86 level=5 fps=89.0
```

测试设置：正常自动战斗、自动选择升级、高生命以避免测试提前死亡，真实时间运行至胜利结算。

## 失败与修正记录

1. **子助手无法启动**：本机 Agent 提供方缺少 `magpie`，独立子助手审查不可用。改为顺序执行，保留每任务测试、提交和控制器自审。
2. **Godot 全局类未注册**：新 `class_name` 脚本后直接跑 `--script` 会找不到 `InkData`/`InkMain`。测试流程改为先跑一次无窗口 editor import。
3. **斜向移动测试写错**：原断言要求 X/Y 都为 175，实际归一化后应为 `(123.7437, 123.7437)`，总长 175。改正测试，不改生产移动。
4. **GDScript 类型推断错误**：字典返回值不能直接用 `:=` 推断 Vector2/float/Color。显式标注类型后通过。
5. **音频测试资源泄漏**：无窗口播放造成 `AudioStreamPlaybackWAV` 残留。无窗口跳过播放，窗口仍正常播放；退出时停止所有播放器。
6. **60 秒加速测试边界**：1200 次 `0.05` 步进因浮点误差略低于 60，测试过早断言。改为最多 1400 步并检测 `ENDED`。
7. **概念验证范围**：Boss、精英、局外成长、Steam、网页导出按设计排除，不计入缺失。

## 已知限制

- 灯笼伤害是即时命中＋短寿命弹道视觉，不是完整飞行碰撞。
- 100 敌人会重叠；当前性能足够，但全量版可加轻量分离。
- 阴影禁忌站满一秒后可重复触发；全量版可加单条规则冷却。
- 音效是合成占位，不是最终混音。
- 字体包约 30 MB；桌面样片可接受，发布时可做中文子集化。

## 迁移建议

**建议继续全量迁移，但把迁移拆成两段：**

1. **逻辑迁移**：按现有 TypeScript 规则、数值、敌人、禁忌、升级逐项转成 GDScript，保留网页版作为对照。
2. **视觉细化**：提高环境可读性，重做标题徽记、升级卡牌、角色/幽灵细节，再让用户按六张截图验收。

不要在美术细节未确认前一次性重写全部 7400 行。先迁移并验证一整套 60 秒循环，再迁 Boss、精英、局外成长和 Steam 功能。

## 复现命令

```bash
GODOT=/Users/yuanxxx/Applications/Godot.app/Contents/MacOS/Godot
PROJECT=/Users/yuanxxx/Agents/qoder/tasks/ink/godot-prototype

$GODOT --headless --path "$PROJECT" --editor --quit
$GODOT --headless --path "$PROJECT" --script res://tests/smoke.gd
$GODOT --headless --path "$PROJECT" --script res://tests/full_run.gd
$GODOT --path "$PROJECT" --script res://tests/capture.gd
$GODOT --path "$PROJECT" --script res://tests/benchmark.gd
$GODOT --path "$PROJECT" --script res://tests/soak.gd
```
