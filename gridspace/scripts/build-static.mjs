import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'dist');
const files = [
  'index.html', 'app.js', 'auth-config.js', 'manifest.webmanifest',
  'service-worker.js', 'landmask.json.gz',
];
// A deliberate public-file list keeps invite codes, backend code and docs out of hosting output.
const assets = readdirSync(join(root, 'assets')).filter(name => /\.(png|svg|webp)$/i.test(name));
const inputs = [...files, ...assets.map(name => join('assets', name))];
for (const name of inputs) {
  const source = join(root, name);
  if (!existsSync(source) || !lstatSync(source).isFile() || lstatSync(source).isSymbolicLink()) {
    throw new Error(`Expected a regular public file: ${name}`);
  }
}
if (existsSync(output) && lstatSync(output).isSymbolicLink()) throw new Error('dist must not be a symbolic link');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const name of inputs) {
  mkdirSync(dirname(join(output, name)), { recursive: true });
  cpSync(join(root, name), join(output, name));
}
console.log(`Built ${inputs.length} public files in dist/. No backend or invite files included.`);
