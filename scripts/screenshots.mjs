import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const base = 'http://localhost:5173';
const out = 'screens';
await fs.mkdir(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
});

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const logs = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') logs.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`));

const pages = process.argv.slice(2);
const targets = pages.length
  ? pages.map((item) => {
      const [path, name] = item.split('::');
      return { path, name: name || path.replace(/\W+/g, '_') || 'home' };
    })
  : [
      { path: '/', name: 'home' },
      { path: '/games', name: 'games' },
      { path: '/games/quiz', name: 'quiz' },
      { path: '/games/word-duel', name: 'duel' },
      { path: '/games/wyr', name: 'wyr' },
      { path: '/games/image', name: 'image' },
      { path: '/social', name: 'social' },
      { path: '/friends', name: 'friends' },
      { path: '/leaderboard', name: 'leaderboard' },
      { path: '/quests', name: 'quests' },
      { path: '/wallet', name: 'wallet' },
      { path: '/achievements', name: 'achievements' },
      { path: '/profile', name: 'profile' },
    ];

await page.goto(`${base}/`, { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2200));

for (const target of targets) {
  if (target.path !== '/') {
    await page.goto(`${base}${target.path}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2200));
  }
  await page.screenshot({ path: `${out}/${target.name}.png`, fullPage: false });
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    bodyScrollWidth: document.body.scrollWidth,
    rootScrollWidth: document.getElementById('root')?.scrollWidth,
    mainWidth: document.querySelector('main')?.getBoundingClientRect().width,
    bodyHeight: document.body.scrollHeight,
  }));
  console.log(target.name, JSON.stringify(metrics));
}

// Admin view
await page.evaluate(() => {
  localStorage.setItem('funbox_demo_telegram_id', '900000000');
  localStorage.removeItem('funbox_token');
});
await page.goto(`${base}/admin`, { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: `${out}/admin.png`, fullPage: false });
console.log('admin', await page.evaluate(() => ({ width: window.innerWidth, scroll: document.body.scrollWidth })));

if (logs.length) {
  console.log('--- console ---');
  console.log([...new Set(logs)].slice(0, 30).join('\n'));
}
await browser.close();
