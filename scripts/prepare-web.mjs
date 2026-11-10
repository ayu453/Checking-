import { cp, mkdir, readdir, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'www');
const excluded = new Set(['.git', '.github', 'node_modules', 'android', 'www', 'scripts', 'package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'capacitor.config.json', 'README.md']);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (excluded.has(entry.name) || entry.name.startsWith('.')) continue;
  await cp(path.join(root, entry.name), path.join(out, entry.name), { recursive: true, force: true });
}
await access(path.join(out, 'index.html'));
console.log('Prepared Capacitor web bundle at www/ without modifying the source website.');
