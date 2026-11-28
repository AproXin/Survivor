# 像素精灵帧表热插拔说明

本目录用于放置通过 18 色门禁校验的正式像素精灵横向帧表（PNG，真透明）。
游戏启动时会自动读取 `manifest.json`：若对应 PNG 存在则自动启用帧表动画，缺失则无缝回退至程序化水墨绘制。

## 档位与帧协议

| 档位 | 适用角色 | 帧表布局（横向拼接） |
|---|---|---|
| `96 × 96` | `player_mortal.png`、`player_sheng.png`、`player_dan.png`、`boss_magistrate.png` | `hframes = 宽 / 96`；若 `hframes >= 8` 则为 `走路 W 帧 + 受击 1 帧 + 死亡 3 帧` |
| `64 × 64` | `ghost.png`、`jiangshi.png`、`wisp_caster.png`、`elite_ghost.png`、`elite_jiangshi.png`、`punisher.png`、`white_stranger.png` | `hframes = 宽 / 64`；若 `hframes >= 8` 则为 `走路 W 帧 + 受击 1 帧 + 死亡 3 帧` |

`hframes < 8` 时自动按循环占位帧播放，不会报错或截断。
