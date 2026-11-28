import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const GODOT_DIR = path.join(ROOT, 'godot-prototype');

test('complete Godot 4.7.2 project preserves authentic ac9f3c6 codebase plus all new modules', () => {
  const required = [
    'project.godot',
    'scenes/main.tscn',
    'shaders/night_light.gdshader',
    'scripts/data.gd',
    'scripts/main.gd',
    'scripts/renderer.gd',
    'scripts/hud.gd',
    'scripts/sprite_bank.gd',
    'scripts/ambient_soundscape.gd',
    'scripts/gamepad_focus.gd',
    'tests/smoke.gd',
    'tests/full_run.gd',
    'tests/full_features.gd',
    'tests/town_and_sprites.gd',
    'tests/sound_and_gamepad.gd',
    'tests/combat_and_ecology.gd',
    'tools/subset_fonts.sh',
    'tools/aseprite/assemble_frames.lua',
    'tools/aseprite/qa_check.py',
    'tools/aseprite/build_pipeline.sh',
    'export_presets.cfg',
    'assets/sprites/manifest.json',
    'assets/sprites/palette-report.json',
    'assets/sprites/player_mortal_cel.png',
    'assets/sprites/player_mortal_cel.json',
    'assets/sprites/player_mortal_cel.qa.json',
    'assets/fonts/MaShanZheng-Regular.ttf',
    'assets/fonts/NotoSerifSC[wght].ttf',
    'docs/screenshots/town.png',
    'docs/screenshots/boss.png',
  ];
  for (const rel of required) {
    assert.ok(fs.existsSync(path.join(GODOT_DIR, rel)), `Expected file to exist: ${rel}`);
  }

  // Confirm we have the authentic full ac9f3c6 scripts, NOT simplified stubs
  const mainLines = fs.readFileSync(path.join(GODOT_DIR, 'scripts/main.gd'), 'utf8').split('\n').length;
  const rendererLines = fs.readFileSync(path.join(GODOT_DIR, 'scripts/renderer.gd'), 'utf8').split('\n').length;
  const hudLines = fs.readFileSync(path.join(GODOT_DIR, 'scripts/hud.gd'), 'utf8').split('\n').length;
  assert.ok(mainLines > 1800, `main.gd should be real ac9f3c6 codebase (>1800 lines, got ${mainLines})`);
  assert.ok(rendererLines > 1000, `renderer.gd should be real ac9f3c6 codebase (>1000 lines, got ${rendererLines})`);
  assert.ok(hudLines > 850, `hud.gd should be real ac9f3c6 codebase (>850 lines, got ${hudLines})`);

  // Confirm ambient_soundscape, gamepad_focus, 3-form baseline, day/night ecology & dual-realm landmarks are wired
  const mainSrc = fs.readFileSync(path.join(GODOT_DIR, 'scripts/main.gd'), 'utf8');
  const hudSrc = fs.readFileSync(path.join(GODOT_DIR, 'scripts/hud.gd'), 'utf8');
  const dataSrc = fs.readFileSync(path.join(GODOT_DIR, 'scripts/data.gd'), 'utf8');
  assert.match(mainSrc, /InkAmbientSoundscape\.new\(\)/);
  assert.match(mainSrc, /InkGamepadFocus\.register_joypad_actions\(\)/);
  assert.match(hudSrc, /_sync_gamepad_modal_focus\(\)/);
  assert.match(dataSrc, /const RUN_DURATION := 60\.0/);
  assert.match(dataSrc, /const COMBAT_BASELINE := \{/);
  assert.match(dataSrc, /const DUAL_REALM_LANDMARKS := \[/);
  for (const enemyKey of ['"wolf"', '"boar"', '"treant"', '"shanxiao"']) {
    assert.ok(dataSrc.includes(enemyKey), `data.gd must define daytime enemy ${enemyKey}`);
  }
  assert.match(mainSrc, /var day_phase: String = "night"/);
  assert.match(mainSrc, /var daylight_blend: float = 0\.0/);
  assert.match(mainSrc, /var funeral_procession: Dictionary/);
});

test('all new GDScript files obey strict Godot 4.7 explicit typing (zero := on Dictionary reads)', () => {
  const newScripts = [
    path.join(GODOT_DIR, 'scripts/ambient_soundscape.gd'),
    path.join(GODOT_DIR, 'scripts/gamepad_focus.gd'),
    path.join(GODOT_DIR, 'scripts/sprite_bank.gd'),
    path.join(GODOT_DIR, 'tests/sound_and_gamepad.gd'),
    path.join(GODOT_DIR, 'tests/combat_and_ecology.gd'),
  ];
  const forbidden = /:=(?:[^\n]*\.(?:get\()|[^\n]*\[)/;
  for (const full of newScripts) {
    const lines = fs.readFileSync(full, 'utf8').split('\n');
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) return;
      assert.equal(forbidden.test(line), false, `Forbidden ':=' Dictionary read in ${path.basename(full)}:${idx + 1}`);
    });
  }
});

test('all 11 PNG spritesheets match upstream flat manifest.json exact 96/64 dimensions and 18-color gate', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(GODOT_DIR, 'assets/sprites/manifest.json'), 'utf8'));
  const report = JSON.parse(fs.readFileSync(path.join(GODOT_DIR, 'assets/sprites/palette-report.json'), 'utf8'));

  const keys = Object.keys(manifest);
  assert.equal(keys.length, 11, 'Upstream flat manifest.json must define 11 sprite keys');

  for (const key of keys) {
    const spec = manifest[key];
    assert.equal(typeof spec.size, 'number', `${key} must retain upstream flat manifest schema`);
    const filename = path.basename(spec.path);
    const pngPath = path.join(GODOT_DIR, 'assets/sprites', filename);
    assert.ok(fs.existsSync(pngPath), `Missing PNG for ${key}: ${filename}`);
    const buf = fs.readFileSync(pngPath);
    assert.equal(buf.readUInt32BE(0), 0x89504e47, `${key} must be valid PNG`);
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    assert.equal(height, spec.size, `${key} height (${height}) must match manifest.json size (${spec.size})`);
    assert.equal(width, spec.size * 8, `${key} width (${width}) must equal size * 8 (${spec.size * 8})`);
    assert.equal(report.sprites[key]?.palette_gate_passed, true, `${key} must pass 18-color palette gate`);
  }
});

test('all 7 Cel-Ink multi-action actors pass Aseprite JSON Tag schema and Python QA gate', () => {
  const celManifest = JSON.parse(fs.readFileSync(path.join(GODOT_DIR, 'assets/sprites/cel_manifest.json'), 'utf8'));
  assert.equal(celManifest.actors.length, 7, 'cel_manifest.json must index all 7 Cel-Ink actors');

  const specs = [
    { base: 'player_mortal_cel', size: 96, frames: 29, tags: ['idle', 'move', 'attack', 'flip', 'hit', 'death'], allowVermilion: false },
    { base: 'player_sheng_cel', size: 96, frames: 29, tags: ['idle', 'move', 'attack', 'flip', 'hit', 'death'], allowVermilion: false },
    { base: 'player_dan_cel', size: 96, frames: 29, tags: ['idle', 'move', 'attack', 'flip', 'hit', 'death'], allowVermilion: false },
    { base: 'enemy_wolf_cel', size: 64, frames: 19, tags: ['idle', 'move', 'attack', 'hit', 'death'], allowVermilion: false },
    { base: 'enemy_boar_cel', size: 64, frames: 19, tags: ['idle', 'move', 'attack', 'hit', 'death'], allowVermilion: false },
    { base: 'enemy_treant_cel', size: 64, frames: 19, tags: ['idle', 'move', 'attack', 'hit', 'death'], allowVermilion: false },
    { base: 'enemy_shanxiao_cel', size: 96, frames: 19, tags: ['idle', 'move', 'attack', 'hit', 'death'], allowVermilion: true },
  ];

  for (const s of specs) {
    const png = fs.readFileSync(path.join(GODOT_DIR, `assets/sprites/${s.base}.png`));
    assert.equal(png.readUInt32BE(0), 0x89504e47, `${s.base}.png must be valid PNG`);
    assert.equal(png.readUInt32BE(16), s.size * s.frames, `${s.base}.png width must equal ${s.size * s.frames}`);
    assert.equal(png.readUInt32BE(20), s.size, `${s.base}.png height must equal ${s.size}`);

    const doc = JSON.parse(fs.readFileSync(path.join(GODOT_DIR, `assets/sprites/${s.base}.json`), 'utf8'));
    assert.equal(doc.frames.length, s.frames, `${s.base}.json must define ${s.frames} frames`);
    assert.deepEqual(doc.meta.frameTags.map((t) => t.name), s.tags, `${s.base} frameTags mismatch`);

    const qa = JSON.parse(fs.readFileSync(path.join(GODOT_DIR, `assets/sprites/${s.base}.qa.json`), 'utf8'));
    assert.equal(qa.passed, true, `${s.base} must pass QA gate`);
    assert.equal(qa.duplicatePairs, 0, `${s.base} must contain zero duplicate consecutive frames`);
    if (!s.allowVermilion) {
      assert.equal(qa.vermilionPixels, 0, `${s.base} must enforce zero vermilion pixels`);
    }
    for (const tag of s.tags) {
      const entry = qa.tags.find((t) => t.name === tag);
      assert.ok(entry, `${s.base} QA report must include tag ${tag}`);
      assert.ok(entry.footDriftPx <= 2, `${s.base}/${tag} foot drift must be <= 2px`);
    }
  }
});

test('complete Godot 4.7.2 ZIP archive contains fonts, core scripts, Aseprite pipeline, all 7 Cel-Ink sprites, and reference sheets', () => {
  const zipPath = path.join(ROOT, 'public/downloads/ink-night-godot-4.7.2-complete.zip');
  assert.ok(fs.existsSync(zipPath), 'Complete ZIP must exist');
  const listing = execFileSync('python3', ['-m', 'zipfile', '-l', zipPath], { encoding: 'utf8' });
  for (const mustContain of [
    'godot-prototype/project.godot',
    'godot-prototype/scripts/main.gd',
    'godot-prototype/scripts/ambient_soundscape.gd',
    'godot-prototype/scripts/gamepad_focus.gd',
    'godot-prototype/tests/combat_and_ecology.gd',
    'godot-prototype/tools/aseprite/assemble_frames.lua',
    'godot-prototype/tools/aseprite/qa_check.py',
    'godot-prototype/tools/aseprite/build_pipeline.sh',
    'godot-prototype/assets/sprites/cel_manifest.json',
    'godot-prototype/assets/sprites/player_mortal_cel.png',
    'godot-prototype/assets/sprites/player_sheng_cel.png',
    'godot-prototype/assets/sprites/player_dan_cel.png',
    'godot-prototype/assets/sprites/enemy_wolf_cel.png',
    'godot-prototype/assets/sprites/enemy_boar_cel.png',
    'godot-prototype/assets/sprites/enemy_treant_cel.png',
    'godot-prototype/assets/sprites/enemy_shanxiao_cel.png',
    'godot-prototype/assets/sprites/boss_magistrate.png',
    'godot-prototype/assets/sprites/reference/boss_judge_sheet.jpg',
    'godot-prototype/assets/fonts/MaShanZheng-Regular.ttf',
    'godot-prototype/export_presets.cfg',
  ]) {
    assert.ok(listing.includes(mustContain), `ZIP must contain ${mustContain}`);
  }
});
