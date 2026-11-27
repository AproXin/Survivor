#!/usr/bin/env bash
set -euo pipefail

# 《墨夜点灯人》中文字体子集化裁剪脚本（30MB+ 全量字体 -> 约 2-4MB 精简包）
# 依赖：pip install fonttools brotli
# 用法：bash tools/subset_fonts.sh [原字体目录] [输出目录]

SRC_DIR="${1:-assets/fonts_raw}"
OUT_DIR="${2:-assets/fonts}"
CHARSET_FILE="/tmp/ink_night_glyphs.txt"

if ! command -v pyftsubset >/dev/null 2>&1; then
  echo "[ERROR] 未检测到 pyftsubset，请先执行：pip install fonttools"
  exit 1
fi

mkdir -p "$OUT_DIR"

echo "[1/3] 正在扫描工程全量文案（scripts / assets / docs）提取唯一字形..."
python3 - <<'PY' > "$CHARSET_FILE"
import pathlib, re

roots = [pathlib.Path("scripts"), pathlib.Path("assets/sprites"), pathlib.Path("docs")]
chars = set(chr(c) for c in range(32, 127))
# 补充常用全角标点、数字、中元民俗与评语印章字符
chars.update("，。、；：？！「」『』《》【】（）—…·“”‘’甲乙丙丁壹贰叁肆伍陆柒捌玖拾零一二三四五六七八九十百千万钱生旦净末丑敕令")

for root in roots:
    if not root.exists():
        continue
    for p in root.rglob("*"):
        if p.suffix.lower() not in {".gd", ".json", ".tscn", ".tres", ".md", ".txt"}:
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for ch in text:
            if ord(ch) >= 32:
                chars.add(ch)

# 去掉空白换行以外的控制字符，保持单行输出
ordered = sorted(c for c in chars if c not in ("\n", "\r", "\t"))
print("".join(ordered), end="")
PY

GLYPH_COUNT=$(python3 -c 'print(len(open("/tmp/ink_night_glyphs.txt", encoding="utf-8").read()))')
echo "[2/3] 共提取唯一字符 ${GLYPH_COUNT} 个（含中英双语、37号终审稿全量字幕、九大禁忌与16名物）。"

echo "[3/3] 开始裁剪字体文件..."
FOUND=0
shopt -s nullglob
for font in "$SRC_DIR"/*.ttf "$SRC_DIR"/*.otf; do
  FOUND=1
  base="$(basename "$font")"
  out_file="$OUT_DIR/${base%.*}.ttf"
  before_kb=$(du -k "$font" | awk '{print $1}')

  pyftsubset "$font" \
    --text-file="$CHARSET_FILE" \
    --output-file="$out_file" \
    --layout-features='kern,liga' \
    --no-hinting \
    --desubroutinize

  after_kb=$(du -k "$out_file" | awk '{print $1}')
  echo "  [OK] ${base}: ${before_kb} KB -> ${after_kb} KB (${out_file})"
done

if [ "$FOUND" -eq 0 ]; then
  echo "[WARN] 未在 ${SRC_DIR} 下找到 .ttf / .otf 原字体，请放入 NotoSerifSC / MaShanZheng 后重试。"
  exit 1
fi

rm -f "$CHARSET_FILE"
echo "[DONE] 字体子集化完成，可直接用于 Godot 4.7.2 macOS / Windows 导出。"
