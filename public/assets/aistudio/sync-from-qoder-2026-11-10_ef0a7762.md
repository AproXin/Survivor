# Qoder → dsh 同步稿 · 2026-11-10

来源：Qoder 侧在 scnet DCU 容器（cgrp-dejzg8w4）实测。目标会话 session-7cfa7cfc。
本稿只补充实测结论与验收门，不推翻 dsh 已定的美术口径。

## 1. 你当前 VAE 卡点的解法（已实测，直接采用）

不要调 `pipe.upcast_vae()`。它把 VAE 升 fp32 而 latents 仍 fp16，diffusers 不自动对齐，撞
`RuntimeError: Input type (c10::Half) and bias type (float) should be the same`（post_quant_conv）。

实测可用组合：**纯 fp16 + `pipe.vae.enable_slicing()`**，出图正常、无黑块。
基准：1024×1024 / 20 步 / cfg 6.0 = **37.9 秒/张**，显存峰值 **9.76 GB**（16 GB 卡余 6 GB）。
真出黑块再换 `sdxl-vae-fp16-fix` 权重，不要先 upcast。

## 2. 容器环境三坑（都已踩实）

1. `import torch` 报 `librocm_smi64.so.2` 找不到。必须：
   `export LD_LIBRARY_PATH=/opt/dtk-26.04/.hyhal/rocm_smi/lib:$LD_LIBRARY_PATH`
   `source /opt/dtk-26.04/env.sh` 补不上这条（默认 env 指向旧 /opt/dtk）。
2. diffusers 0.42.1 已移除 `pipe.enable_vae_slicing()`，改用 `pipe.vae.enable_slicing()`。
3. Flash / memory-efficient attention 在 gfx906 全不支持，自动回退 math backend；另有
   hipblaslt 缺 gfx906 内核库警告。都只影响速度不影响正确性，可忽略。

## 3. CLIP 77 token

SDXL 第一个 text encoder 硬上限 77 token。**背景指令放 prompt 最前**
（`solid pure black background` 开头），否则尾部被截掉出灰底/纸底，抠图全废。总长控 70 token 内。

## 4. 风格圣经验收门（新增，容器已部署并实测 PASS）

容器 `/root/private_data/ink-night/tools/` 下有两个脚本：

- `pixelize.py --role hero|enemy|elite|scene|gem --size 96|64|32`：抠底→裁→BOX 缩→最近色量化。
  **按角色配给禁色**：非 elite 从候选色板去掉朱红，非 gem 去掉经验绿，从源头杜绝串色。
  硬 alpha 二值化保证真透明。
- `validate.py --role X --size N`：校验尺寸 / 真透明 / 21 色零越界 / 朱红配给 / 经验绿配给 /
  抠图占比。退出码 0=PASS 才放行进 Aseprite；1=逐条打印违规。

实测：少年立绘压 96×96 后 `validate --role hero --size 96` = PASS；
原始 SDXL 1024 高清图 = 3 项 FAIL（尺寸/无透明/5 万色越界），证明门能抓违规。

注意：此 pixelize 与 dsh 本机 `tools/pixelize.py`（1024→box→palette_tool→nearest）是两条独立
管线，容器这条专供 DCU 出图后就地验收，不要互相覆盖。

## 5. 口径对齐（维持 dsh 已定，不作废）

- 视角维持 **45° 等距俯视 + flat lineless + 每材质≤3 色调 + 禁 "pixel art" 字样**。
  Qoder 此前方案里的 `front view / full body` 提示词作废，以 dsh 的 isometric 3/4 top-down 为准。
- 色板 21 = 18 墨色 + 3 经验绿，与 palette-ink21.json 一致；朱红≤5% 整帧上限不变。
- 主角/Boss 96×96、普通怪/精英 64×64、地表 32×32；走路 6-8 帧。

## 6. 容器接入路径（已打通）

SSH `scnvq658wg@wheshell.hpccube.com:65032`（密钥 ~/.ssh/scnet-dcu.key）→ 登录节点 wh-login03
→ `KUBECONFIG=~/.kube/20078-k8s1/*/config kubectl exec cgrp-dejzg8w4-6ff74ff75-zcxxx -- bash`。
模型在 `/root/private_data/sd/sdxl` 与 `sd/sd15`（diffusers 格式）。

## 7. 完整方案文档

本机 `~/Documents/pixel-sprite-plan/ink-night-像素素材生产方案.md`（含审核结论：原方案 5 处偏离
风格圣经已修正）。
