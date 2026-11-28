#!/usr/bin/env node
/**
 * Indexes the complete Godot 4.7.2 repository in /godot-prototype (synced from AproXin/Survivor @ ac9f3c6
 * + 11 aligned 18-color pixel spritesheets + 3 reference sheets + InkAmbientSoundscape + InkGamepadFocus
 * + font subsetting & desktop export presets), mirrors browsable files to /public/godot-prototype,
 * and builds the complete ready-to-open archive at /public/downloads/ink-night-godot-4.7.2-complete.zip.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'godot-prototype');
const PUB_GODOT = path.join(ROOT, 'public', 'godot-prototype');
const PUB_DOWNLOADS = path.join(ROOT, 'public', 'downloads');
const ZIP_OUT = path.join(PUB_DOWNLOADS, 'ink-night-godot-4.7.2-complete.zip');

if (!fs.existsSync(path.join(SRC_DIR, 'project.godot'))) {
  console.error('Missing /godot-prototype/project.godot');
  process.exit(1);
}

fs.rmSync(PUB_GODOT, { recursive: true, force: true });
fs.mkdirSync(PUB_GODOT, { recursive: true });
fs.mkdirSync(PUB_DOWNLOADS, { recursive: true });

// Remove legacy zip names so downloads/ stays clean
for (const oldName of ['ink-night-godot-4.7.2.zip', 'ink-night-godot-addon-kit.zip']) {
  const p = path.join(PUB_DOWNLOADS, oldName);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

const TEXT_EXTS = new Set(['.gd', '.gdshader', '.tscn', '.godot', '.cfg', '.json', '.sh', '.lua', '.py', '.md', '.txt', '.svg']);
const MIRROR_BINARY_EXTS = new Set(['.png']);

function categoryFor(relPath) {
  if (relPath.startsWith('scripts/')) return 'GDScript 核心模块';
  if (relPath.startsWith('shaders/') || relPath.startsWith('scenes/')) return '场景与着色器';
  if (relPath.startsWith('tests/')) return '无头自动化测试';
  if (relPath.startsWith('tools/aseprite/')) return 'Aseprite 自动化与 QA 管线';
  if (relPath.startsWith('tools/') || relPath === 'export_presets.cfg') return '字体裁剪与导出打包';
  if (relPath.startsWith('art_pipeline/')) return '高精源帧资产';
  if (relPath.startsWith('assets/sprites/reference/')) return '像素美术参考基准';
  if (relPath.startsWith('assets/sprites/')) return '像素精灵帧表资产';
  if (relPath.startsWith('assets/world/')) return '地图瓦片与安全区建筑';
  if (relPath.startsWith('assets/items/')) return '局内道具与消耗品图标';
  if (relPath.startsWith('assets/fonts/')) return '中英字体与开源协议';
  if (relPath.startsWith('docs/')) return '实机截图与设计文档';
  return '工程配置';
}

const files = [];

function walk(dir, prefix = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === '.godot') continue;
    const abs = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walk(abs, rel);
    } else {
      const stat = fs.statSync(abs);
      const ext = path.extname(entry.name).toLowerCase();
      const isText = TEXT_EXTS.has(ext) && !entry.name.endsWith('.uid') && !entry.name.endsWith('.import');
      let lines = 0;
      if (isText) {
        const content = fs.readFileSync(abs, 'utf8');
        lines = content.split('\n').length;
      }

      // Mirror text files and sprite/world/item PNGs into public/godot-prototype (skip 30MB TTFs in web mirror; full ZIP includes everything)
      const shouldMirror =
        isText ||
        (MIRROR_BINARY_EXTS.has(ext) &&
          (rel.startsWith('assets/sprites/') ||
            rel.startsWith('assets/world/') ||
            rel.startsWith('assets/items/')));
      if (shouldMirror) {
        const dest = path.join(PUB_GODOT, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(abs, dest);
      }

      files.push({
        path: rel,
        url: shouldMirror ? `/godot-prototype/${rel}` : '',
        category: categoryFor(rel),
        ext,
        isText,
        bytes: stat.size,
        lines,
      });
    }
  }
}

walk(SRC_DIR);

// Build COMPLETE ZIP containing every file in /godot-prototype (including fonts, screenshots, .uid, .import, sprites, reference sheets)
if (fs.existsSync(ZIP_OUT)) fs.unlinkSync(ZIP_OUT);
execFileSync('python3', [
  '-c',
  `
import os, sys, zipfile
src = sys.argv[1]
out = sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, filenames in os.walk(src):
        dirs[:] = sorted(d for d in dirs if d not in {'.git', '.godot'})
        for fn in sorted(filenames):
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, os.path.dirname(src))
            zf.write(full, rel)
`,
  SRC_DIR,
  ZIP_OUT,
]);

const zipStat = fs.statSync(ZIP_OUT);

const index = {
  projectName: '墨夜点灯人',
  englishName: 'Ink Night: The Lamp Bearer',
  engineVersion: 'Godot 4.7.2 (GL Compatibility)',
  upstreamCommit: 'ac9f3c6 (AproXin/Survivor main)',
  webVersionStatus: 'deprecated',
  zipUrl: '/downloads/ink-night-godot-4.7.2-complete.zip',
  zipBytes: zipStat.size,
  totalFiles: files.length,
  gdscriptFiles: files.filter((f) => f.ext === '.gd').length,
  testFiles: files.filter((f) => f.path.startsWith('tests/') && f.ext === '.gd').length,
  spriteSheets: files.filter((f) => f.path.startsWith('assets/sprites/') && f.ext === '.png').length,
  worldAssets: files.filter((f) => f.path.startsWith('assets/world/') && f.ext === '.png').length,
  itemIcons: files.filter((f) => f.path.startsWith('assets/items/') && f.ext === '.png').length,
  referenceSheets: files.filter((f) => f.path.startsWith('assets/sprites/reference/') && f.ext === '.jpg').length,
  files,
};

fs.writeFileSync(path.join(PUB_GODOT, 'project-index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');
console.log(
  `Packed COMPLETE Godot 4.7.2 project (ac9f3c6 + upgrades): ${files.length} files, ZIP ${(zipStat.size / (1024 * 1024)).toFixed(2)} MB -> ${ZIP_OUT}`,
);
