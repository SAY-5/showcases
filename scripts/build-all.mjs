// Builds every site under sites/* in sequence. Used by CI.
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sitesDir = join(root, 'sites');

if (!existsSync(sitesDir)) {
  console.log('no sites/ directory; nothing to build');
  process.exit(0);
}

const sites = readdirSync(sitesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

if (sites.length === 0) {
  console.log('no sites to build');
  process.exit(0);
}

for (const name of sites) {
  console.log(`\n=== building ${name} ===`);
  execFileSync('npm', ['--workspace', `sites/${name}`, 'run', 'build'], {
    cwd: root,
    stdio: 'inherit',
  });
}

console.log(`\nbuilt ${sites.length} site(s)`);
