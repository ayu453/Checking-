import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

assert.match(html, /<!doctype html>/i, 'HTML document must have a doctype');
assert.match(html, /<html[^>]+lang=/i, 'HTML language must be declared');
assert.match(html, /name=["']viewport["']/i, 'Responsive viewport must be configured');

for (const id of [
  'canvas-container',
  'imax-video',
  'analysis-canvas',
  'depth-canvas',
  'video-file-input',
  'header-upload-video',
  'controls-panel',
  'player-bar',
  'seat-grid',
  'side-fullscreen-toggle',
  'side-landscape-toggle',
  'side-fit-toggle'
]) {
  assert.ok(html.includes('id="' + id + '"') || html.includes("id='" + id + "'"), 'Required app element missing: ' + id);
}

const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
let inlineScriptCount = 0;
for (const [, attrs, body] of scripts) {
  if (/\bsrc\s*=/.test(attrs) || !body.trim()) continue;
  inlineScriptCount++;
  new vm.Script(body, { filename: 'index.html:inline-script-' + inlineScriptCount });
}
assert.ok(inlineScriptCount >= 1, 'Expected inline application scripts to be present');

assert.match(html, /video\.addEventListener\(['"]playing['"]/i, 'Playback start handler must exist');
assert.match(html, /video\.addEventListener\(['"]pause['"]/i, 'Playback pause handler must exist');
assert.match(html, /side-fullscreen-toggle[\\s\\S]*?btn-fullscreen/, 'Dedicated app fullscreen control must be wired');
assert.match(html, /side-landscape-toggle[\\s\\S]*?orientation\.lock\(['"]landscape['"]\)/, 'Landscape control must request landscape orientation');
assert.match(html, /href=["']assets\\/icon\\.svg["']/, 'Branded web app icon must be linked');
assert.match(html, /ceilingStripLights\.forEach\(strip => \{ strip\.visible = !cinemaPlayingMode; \}\)/, 'Ceiling strips must switch off during playback');
assert.doesNotMatch(html, /ytCinemaLauncher|ytCinemaPanel|youtube-nocookie\.com/i, 'Removed YouTube launcher must stay removed');
assert.doesNotMatch(html, /frontCarpetMesh|carpetEdgeMeshes|Rich crimson carpet runner/i, 'Removed front carpet must stay removed');

console.log('PASS: HTML structure, cinema controls, branded icon, inline JavaScript syntax, playback handlers, ceiling lighting, and requested removals.');
