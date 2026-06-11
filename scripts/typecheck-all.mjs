// Typechecks every site under sites/* with its own tsconfig. Used by CI.
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sitesDir = join(root, 'sites');

if (!existsSync(sitesDir)) {
  console.log('no sites/ directory; nothing to typecheck');
  process.exit(0);
}

const sites = readdirSync(sitesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

for (const name of sites) {
  console.log(`=== typecheck ${name} ===`);
  execFileSync(
    'npx',
    ['tsc', '--noEmit', '-p', `sites/${name}/tsconfig.json`],
    { cwd: root, stdio: 'inherit' }
  );
}

console.log(`typechecked ${sites.length} site(s)`);
