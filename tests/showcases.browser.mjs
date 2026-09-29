import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const executablePath = process.env.CHROME_PATH || (
  process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : '/usr/bin/google-chrome'
);
let server;
let browser;
let origin;

before(async () => {
  assert.ok(existsSync(executablePath), `Set CHROME_PATH to an installed Chrome binary: ${executablePath}`);
  server = await preview({ configFile: false, preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  // Fresh temporary profile, never a personal browser session.
  browser = await chromium.launch({ executablePath, headless: true });
});

after(async () => {
  try {
    await browser?.close();
  } finally {
    if (server) await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
  }
});

async function withPage(width, run) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await run(page);
    assert.deepEqual(errors, [], 'no page execution errors');
  } finally {
    await context.close();
  }
}

for (const width of [1440, 390]) {
  for (const [name, title] of [
    ['rankfault', 'Collective Fault Injection Harness'],
    ['kernelcheck', 'CUDA Kernel Fuzz Tester'],
  ]) {
    test(`repository-name search finds ${name} at ${width}px and survives reload`, async () => {
      await withPage(width, async (page) => {
        await page.goto(`${origin}/?q=${encodeURIComponent(`  ${name.toUpperCase()}  `)}`);
        const input = page.getByRole('searchbox', { name: 'Search showcases' });
        await input.waitFor();
        const row = page.locator(`.rows a[href="/${name}"]`);
        assert.equal(await row.count(), 1, 'repository name must match independently of display title');
        assert.equal(await page.locator('.rows .row').count(), 1);
        assert.match(await row.innerText(), new RegExp(title));
        await page.reload();
        await input.waitFor();
        assert.equal(await row.count(), 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      });
    });
  }
}

test('repository search preserves AND filters, counts and sort when edited', async () => {
  await withPage(1440, async (page) => {
    const params = new URLSearchParams({ q: 'rankfault', c: 'Infra and Distributed', l: 'Python', sort: 'name' });
    await page.goto(`${origin}/?${params}`);
    const input = page.getByRole('searchbox', { name: 'Search showcases' });
    await input.waitFor();
    assert.equal(await page.locator('.rows a[href="/rankfault"]').count(), 1);
    assert.match(await page.getByRole('group', { name: 'Language', exact: true }).getByRole('button', { name: /^Python/ }).innerText(), /Python\s*1$/);
    await input.fill('kernelcheck');
    await page.getByText('Nothing matches that.', { exact: true }).waitFor();
    assert.equal(await page.locator('.rows .row').count(), 0);
    const actual = new URL(page.url()).searchParams;
    assert.equal(actual.get('c'), 'Infra and Distributed');
    assert.equal(actual.get('l'), 'Python');
    assert.equal(actual.get('sort'), 'name');
    await page.getByRole('button', { name: 'clear the filters', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.rows .row').length > 1);
    assert.equal(new URL(page.url()).search, '');
  });
});

test('DispatchGrid distinguishes modeled counters from the retained measured receipt', async () => {
  await withPage(1440, async (page) => {
    await page.goto(`${origin}/dispatchgrid`);
    const panel = page.getByRole('region', { name: 'Load run', exact: true });
    await panel.waitFor();
    assert.match(await panel.innerText(), /measured 15 \/ 56 ms/);
    const source = panel.getByRole('link', { name: /2026-09-28 measured run/ });
    assert.equal(await source.getAttribute('href'), 'https://github.com/SAY-5/dispatchgrid/blob/519539808b2a5e4f4fd6d2aec00dabbe793d6111/docs/demo-runs/1bc404c/loadgen-summary.json');
    assert.match(await panel.innerText(), /221 ms p99/);
    assert.match(await panel.innerText(), /Browser counters are modeled/);
  });
});
