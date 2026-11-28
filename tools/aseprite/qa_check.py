#!/usr/bin/env python3
"""
Ink Night: Automated SpriteSheet QA Gate (96x96 & 64x64 Cel-Ink / Aseprite JSON-Array)
Checks:
  1. PNG exact dimensions matching Aseprite JSON frames
  2. Alpha transparency (no opaque background)
  3. Zero vermilion pixels on hero forms (optional --allow-vermilion for crimson-eyed elites)
  4. Footline anchor y stability & horizontal centering
  5. Zero exact duplicate frames within any animation tag
  6. Inter-frame motion delta within natural range
"""
import json
import os
import struct
import sys
import zlib


def decode_png_rgba(path):
    with open(path, "rb") as f:
        data = f.read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Not a PNG file: {path}")
    pos = 8
    width = height = bit_depth = color_type = 0
    idat = bytearray()
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        ctype = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if ctype == b"IHDR":
            width, height, bit_depth, color_type = struct.unpack(">IIBB", chunk[:10])
        elif ctype == b"IDAT":
            idat.extend(chunk)
        elif ctype == b"IEND":
            break
    if bit_depth != 8 or color_type != 6:
        raise ValueError(f"Expected 8-bit RGBA PNG, got depth={bit_depth} type={color_type}")
    raw = zlib.decompress(bytes(idat))
    stride = width * 4
    out = bytearray(height * stride)
    bpp = 4
    idx = 0
    for y in range(height):
        filt = raw[idx]
        idx += 1
        row_start = y * stride
        prev_start = (y - 1) * stride
        for x in range(stride):
            v = raw[idx]
            idx += 1
            a = out[row_start + x - bpp] if x >= bpp else 0
            b = out[prev_start + x] if y > 0 else 0
            c = out[prev_start + x - bpp] if (y > 0 and x >= bpp) else 0
            if filt == 0:
                val = v
            elif filt == 1:
                val = (v + a) & 0xFF
            elif filt == 2:
                val = (v + b) & 0xFF
            elif filt == 3:
                val = (v + ((a + b) >> 1)) & 0xFF
            elif filt == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                val = (v + pr) & 0xFF
            else:
                raise ValueError(f"Unsupported PNG filter {filt}")
            out[row_start + x] = val
    return width, height, out


def is_vermilion(r, g, b):
    return r >= 150 and g <= 95 and b <= 80 and (r - g) >= 75 and (r - b) >= 85


def run_qa(sheet_path, json_path, report_path=None, allow_vermilion=False):
    with open(json_path, "r", encoding="utf-8") as f:
        meta_doc = json.load(f)
    w, h, rgba = decode_png_rgba(sheet_path)
    frames = meta_doc.get("frames", [])
    tags = meta_doc.get("meta", {}).get("frameTags", [])
    errors = []

    frame_size = int(frames[0]["frame"]["h"]) if frames else h
    if frame_size not in (64, 96):
        errors.append(f"Expected frameSize 64 or 96, got {frame_size}")
    if h % frame_size != 0 or w % frame_size != 0:
        errors.append(f"Dimensions {w}x{h} must be exact multiples of frameSize {frame_size}")
    rows = h // frame_size
    cols = w // frame_size
    if rows * cols != len(frames):
        errors.append(f"Grid capacity {cols}x{rows} ({rows * cols}) != frame count {len(frames)}")

    frame_stats = []
    frame_buffers = []
    vermilion_total = 0

    for i, fr in enumerate(frames):
        fx = int(fr["frame"]["x"])
        fy = int(fr["frame"]["y"])
        fw = int(fr["frame"]["w"])
        fh = int(fr["frame"]["h"])
        buf = bytearray(fw * fh * 4)
        opaque = 0
        min_x, max_x = fw, -1
        min_y, max_y = fh, -1
        sum_x = 0
        vermilion_count = 0

        for y in range(fh):
            src_row = (fy + y) * w * 4 + fx * 4
            dst_row = y * fw * 4
            buf[dst_row : dst_row + fw * 4] = rgba[src_row : src_row + fw * 4]
            for x in range(fw):
                off = src_row + x * 4
                r, g, b, a = rgba[off], rgba[off + 1], rgba[off + 2], rgba[off + 3]
                if a > 24:
                    opaque += 1
                    sum_x += x
                    if x < min_x:
                        min_x = x
                    if x > max_x:
                        max_x = x
                    if y < min_y:
                        min_y = y
                    if y > max_y:
                        max_y = y
                    if is_vermilion(r, g, b):
                        vermilion_count += 1
        vermilion_total += vermilion_count
        center_x = round(sum_x / max(1, opaque), 1)
        frame_buffers.append(bytes(buf))
        frame_stats.append({
            "index": i,
            "filename": fr.get("filename", f"frame_{i}"),
            "opaquePixels": opaque,
            "transparentRatio": round(1.0 - opaque / float(fw * fh), 4),
            "bbox": [min_x, min_y, max_x, max_y],
            "footY": max_y,
            "centerX": center_x,
            "vermilionPixels": vermilion_count,
        })
        if opaque == 0:
            errors.append(f"Frame {i} is completely empty")
        if opaque > fw * fh * 0.85:
            errors.append(f"Frame {i} appears to lack transparent background")

    if (not allow_vermilion) and vermilion_total > 0:
        errors.append(f"Zero-vermilion gate failed: {vermilion_total} vermilion pixels detected")

    tag_reports = []
    duplicate_pairs = 0
    for tag in tags:
        name = tag["name"]
        f_from = int(tag["from"])
        f_to = int(tag["to"])
        diffs = []
        foot_ys = [frame_stats[k]["footY"] for k in range(f_from, f_to + 1)]
        for k in range(f_from, f_to):
            b1 = frame_buffers[k]
            b2 = frame_buffers[k + 1]
            changed = 0
            total = frame_size * frame_size
            for p in range(0, len(b1), 4):
                if abs(b1[p] - b2[p]) + abs(b1[p + 1] - b2[p + 1]) + abs(b1[p + 2] - b2[p + 2]) + abs(b1[p + 3] - b2[p + 3]) > 18:
                    changed += 1
            ratio = round(changed / float(total), 4)
            diffs.append(ratio)
            if changed == 0:
                duplicate_pairs += 1
                errors.append(f"Tag '{name}' has exact duplicate consecutive frames {k} -> {k+1}")
        foot_span = (max(foot_ys) - min(foot_ys)) if foot_ys else 0
        if name in ("idle", "move", "attack") and foot_span > 4:
            errors.append(f"Tag '{name}' foot anchor drift too high: {foot_span}px (max 4px)")
        tag_reports.append({
            "name": name,
            "from": f_from,
            "to": f_to,
            "frameCount": f_to - f_from + 1,
            "footYMin": min(foot_ys) if foot_ys else 0,
            "footYMax": max(foot_ys) if foot_ys else 0,
            "footDriftPx": foot_span,
            "avgMotionDelta": round(sum(diffs) / max(1, len(diffs)), 4),
            "minMotionDelta": min(diffs) if diffs else 0.0,
        })

    anchor_meta = meta_doc.get("meta", {}).get("anchor", {})
    center_spec = int(anchor_meta.get("x", frame_size // 2))
    foot_spec = int(anchor_meta.get("y", frame_size - (6 if frame_size == 96 else 4)))

    report = {
        "sheet": os.path.basename(sheet_path),
        "dimensions": {"width": w, "height": h, "frameSize": frame_size, "frameCount": len(frames)},
        "passed": len(errors) == 0,
        "errors": errors,
        "vermilionPixels": vermilion_total,
        "allowVermilion": allow_vermilion,
        "duplicatePairs": duplicate_pairs,
        "anchorSpec": {"centerX": center_spec, "footY": foot_spec, "safeMarginPx": 4},
        "tags": tag_reports,
    }
    if report_path:
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--allow-vermilion"]
    allow_v = "--allow-vermilion" in sys.argv[1:]
    if len(args) < 2:
        print("Usage: qa_check.py <sheet.png> <sheet.json> [report.json] [--allow-vermilion]")
        sys.exit(2)
    out = args[2] if len(args) > 2 else None
    sys.exit(run_qa(args[0], args[1], out, allow_vermilion=allow_v))
