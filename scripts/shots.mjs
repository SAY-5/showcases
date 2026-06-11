import { chromium } from 'playwright';

const targets = [
  { name: 'codelens', url: 'http://localhost:4801/' },
  { name: 'agentdesk', url: 'http://localhost:4802/' },
  { name: 'taskboard', url: 'http://localhost:4803/' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

for (const t of targets) {
  await page.goto(t.url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  // Hero
  await page.screenshot({ path: `docs/${t.name}-hero.png` });
  // Demo section
  await page.evaluate(() => {
    document.getElementById('demo')?.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `docs/${t.name}-demo.png` });
  console.log(`shot ${t.name}`);
}

await browser.close();
console.log('done');
