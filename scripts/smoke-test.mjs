import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
const socialPreview = await readFile(new URL('../assets/social-preview.svg', import.meta.url), 'utf8');
const audioTrackManager = await readFile(new URL('../audio-track-manager.js', import.meta.url), 'utf8');
const videoLibrary = await readFile(new URL('../video-library.js', import.meta.url), 'utf8');

assert.match(html, /<!doctype html>/i, 'HTML document must have a doctype');
assert.match(html, /<html[^>]+lang=/i, 'HTML language must be declared');
assert.match(html, /name=["']viewport["']/i, 'Responsive viewport must be configured');
assert.match(html, /name=["']description["'][^>]+content=/i, 'SEO description must be present');
assert.match(html, /property=["']og:title["']/i, 'Open Graph title must be present');
assert.match(html, /property=["']og:description["']/i, 'Open Graph description must be present');
assert.match(html, /property=["']og:image["'][^>]+social-preview\.svg/i, 'Social preview image must be linked');
assert.match(html, /name=["']twitter:card["'][^>]+summary_large_image/i, 'Large social card metadata must be present');
assert.match(html, /rel=["']manifest["'][^>]+manifest\.webmanifest/i, 'Web app manifest must be linked');
assert.equal(manifest.name, 'IMAX 3D Simulator', 'Manifest app name must be branded');
assert.equal(manifest.start_url, './', 'Manifest must use a relative start URL');
assert.match(socialPreview, /<svg[\s>]/i, 'Social preview must be an SVG document');
assert.match(socialPreview, /IMAX/i, 'Social preview must include the product name');

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
new vm.Script(audioTrackManager, { filename: 'audio-track-manager.js' });
new vm.Script(videoLibrary, { filename: 'video-library.js' });
assert.match(html, /video-library\.js/, 'Custom video library must be loaded');
assert.match(videoLibrary, /data-tab=.?folders/, 'Video library must include folders navigation');
assert.match(videoLibrary, /imaxVideoHistory/, 'Video library must track playback history');
assert.match(html, /data-player-action=["']audio["']/, 'Audio track control must exist');
assert.doesNotMatch(html, /data-player-action=["']subtitles["']/, 'Old subtitle control action must be removed');
assert.match(html, /audio-track-manager\.js/, 'Audio track manager must be loaded');
assert.match(audioTrackManager, /__probeLogs[.]filter/, 'FFmpeg probe logs must be filtered for audio streams');
assert.match(audioTrackManager, /Stream #0:/, 'FFmpeg stream indexes must be parsed');
assert.match(audioTrackManager, /Audio:/, 'FFmpeg audio stream metadata must be detected');
assert.match(audioTrackManager, /-map', '0:'/i, 'Selected audio stream must be extracted');
assert.match(audioTrackManager, /Original \/ default audio/, 'Original audio must remain selectable');
assert.match(audioTrackManager, /video\.addEventListener\(['"]timeupdate['"]/, 'Extracted audio must stay synchronized to video time');

assert.match(html, /video\.addEventListener\(['"]playing['"]/i, 'Playback start handler must exist');
assert.match(html, /video\.addEventListener\(['"]pause['"]/i, 'Playback pause handler must exist');
assert.match(html, /id="btn-fullscreen"/, 'Original main-toolbar fullscreen control must remain');
assert.doesNotMatch(html, /side-fullscreen-toggle/, 'Duplicate side fullscreen control must not exist');
assert.match(html, /side-landscape-toggle[\s\S]*?orientationPlugin\.lock\(\{ orientation: 'landscape' \}\)/, 'Landscape control must use native orientation plugin');
assert.match(html, /screen\.orientation\.lock\(['"]landscape['"]\)/, 'Landscape control must use browser orientation lock');
assert.doesNotMatch(html, /rotate-landscape-fallback|rotate\(90deg\)/, 'Landscape must not use fake CSS rotation');
assert.ok(html.indexOf('id="side-landscape-toggle"') < html.indexOf('id="cinema-right-tools"'), 'Landscape control must be placed in left-side controls');
assert.match(html, /href=["']assets\/icon\.svg["']/, 'Branded web app icon must be linked');
assert.match(html, /ceilingStripLights\.forEach\(strip => \{ strip\.visible = !cinemaPlayingMode; \}\)/, 'Ceiling strips must switch off during playback');
assert.doesNotMatch(html, /ytCinemaLauncher|ytCinemaPanel|youtube-nocookie\.com/i, 'Removed YouTube launcher must stay removed');
assert.doesNotMatch(html, /frontCarpetMesh|carpetEdgeMeshes|Rich crimson carpet runner/i, 'Removed front carpet must stay removed');

console.log('PASS: SEO, social preview, PWA metadata, HTML structure, cinema controls, inline JavaScript syntax, playback handlers, lighting, and regression safeguards.');
