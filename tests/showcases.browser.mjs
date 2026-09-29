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


for (const width of [1440, 390]) {
  for (const [project, selector] of [
    ['failsafe', '.fs__recent > .fs__empty'],
    ['ledgermesh', '.lm__orders > .lm__empty, .lm__log > .lm__empty'],
  ]) {
    test(project + ' empty-state prose is readable at ' + width + 'px', async () => {
      await withPage(width, async (page) => {
        await page.goto(origin + '/' + project);
        await page.locator(selector).first().waitFor();
        const paragraphs = await page.locator(selector).evaluateAll((elements) => elements.map((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return { text: element.textContent, lines: range.getClientRects().length };
        }));
        assert.equal(paragraphs.length, project === 'failsafe' ? 1 : 2);
        for (const paragraph of paragraphs) {
          assert.ok(paragraph.lines <= 3, paragraph.text + ' must not wrap into a narrow data column (' + paragraph.lines + ' lines)');
        }
      });
    });
  }

  test('FailSafe selected replica and token count retain readable contrast at ' + width + 'px', async () => {
    await withPage(width, async (page) => {
      await page.goto(origin + '/failsafe');
      await page.locator('.fs__bucket-lab').waitFor();
      const samples = await page.evaluate(() => {
        const color = (value) => value.match(/[\d.]+/g).map(Number);
        const label = getComputedStyle(document.querySelector('.fs__bucket-lab'));
        const chip = getComputedStyle(document.querySelector('.fs__chip--on'));
        const ownBackground = color(label.backgroundColor);
        const fill = getComputedStyle(document.querySelector('.fs__bucket-fill'));
        const backgrounds = ownBackground[3] === 0
          ? [getComputedStyle(document.querySelector('.fs__bucket')).backgroundColor,
            ...fill.backgroundImage.match(/rgba?\([^)]+\)/g)].map(color)
          : [ownBackground];
        return [
          { label: 'selected replica', foreground: color(chip.color), backgrounds: [color(chip.backgroundColor)] },
          { label: 'token count across empty/full fill', foreground: color(label.color), backgrounds },
        ];
      });
      const luminance = (rgb) => rgb.slice(0, 3).map(v => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index], 0);
      for (const sample of samples) {
        for (const background of sample.backgrounds) {
          const values = [luminance(sample.foreground), luminance(background)].sort((a, b) => b - a);
          const ratio = (values[0] + 0.05) / (values[1] + 0.05);
          assert.ok(ratio >= 4.5, sample.label + ' contrast must be at least 4.5:1; got ' + ratio.toFixed(2));
        }
      }
    });
  });
}
