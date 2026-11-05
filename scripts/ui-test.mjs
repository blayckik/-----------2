import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';

const base = 'http://localhost:5173';
const out = 'screens';
await fs.mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitText(text, timeout = 20000) {
  await page.waitForFunction((needle) => document.body.innerText.includes(needle), { timeout }, text);
}

async function clickText(text, timeout = 15000) {
  await page.waitForFunction(
    (needle) =>
      [...document.querySelectorAll('button, a')].some(
        (element) => element.offsetParent !== null && element.textContent?.trim().includes(needle),
      ),
    { timeout },
    text,
  );
  const clicked = await page.evaluate((needle) => {
    const element = [...document.querySelectorAll('button, a')].find(
      (item) => item.offsetParent !== null && item.textContent?.trim().includes(needle),
    );
    if (!element) return false;
    element.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Cannot click: ${text}`);
}

async function shot(name) {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`shot ${name}`);
}

await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
await waitText('Нова', 30000);
await wait(1500);

// ── Quiz quick match ───────────────────────────────────────
await page.goto(`${base}/games/quiz`, { waitUntil: 'domcontentloaded' });
await waitText('Быстрый матч');
await wait(700);
await shot('quiz-setup');
await clickText('Быстрый матч');
await waitText('Табло', 30000);
await wait(800);
await shot('quiz-question');
const answered = await page.evaluate(() => {
  const option = [...document.querySelectorAll('button')].find(
    (element) =>
      element.offsetParent !== null &&
      element.className.includes('p-3.5') &&
      element.textContent?.trim().startsWith('A'),
  );
  if (!option) return false;
  option.click();
  return true;
});
console.log('quiz option clicked', answered);
await wait(2000);
await shot('quiz-answered');
await wait(3800);
await shot('quiz-reveal');

// ── Would You Rather ───────────────────────────────────────
await page.goto(`${base}/games/wyr`, { waitUntil: 'domcontentloaded' });
await waitText('или', 30000);
await wait(800);
const voted = await page.evaluate(() => {
  const options = [...document.querySelectorAll('button')].filter(
    (element) => element.offsetParent !== null && element.className.includes('px-5') && element.className.includes('py-6'),
  );
  if (!options.length) return false;
  options[0].click();
  return true;
});
console.log('wyr voted', voted);
await wait(1800);
await shot('wyr-voted');

// ── Guess image ────────────────────────────────────────────
await page.goto(`${base}/games/image`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('input[placeholder="Ваш вариант ответа…"]', { timeout: 30000 });
await wait(1000);
await page.type('input[placeholder="Ваш вариант ответа…"]', 'неверный ответ');
await clickText('Ответить');
await wait(1200);
await shot('image-wrong');

// ── Social composer ────────────────────────────────────────
await page.goto(`${base}/social`, { waitUntil: 'domcontentloaded' });
await waitText('Твоя', 30000);
await wait(1000);
await clickText('Поделитесь моментом');
await page.waitForSelector('textarea[placeholder^="Что происходит"]', { timeout: 10000 });
const unique = `UI smoke ${Date.now()}`;
await page.type('textarea[placeholder^="Что происходит"]', `Проверяю ленту FUNBOX. ${unique} ✨`);
await clickText('Опубликовать');
await waitText(unique, 20000);
await wait(700);
await shot('social-posted');

// ── Chat ───────────────────────────────────────────────────
await page.goto(`${base}/chat`, { waitUntil: 'domcontentloaded' });
await waitText('Сообщения', 30000);
await wait(1000);
const opened = await page.evaluate(() => {
  const target = [...document.querySelectorAll('button')].find(
    (element) => element.offsetParent !== null && element.textContent?.includes('Макс'),
  );
  if (!target) return false;
  target.click();
  return true;
});
console.log('chat opened', opened);
await wait(1500);
await page.waitForSelector('textarea[placeholder="Сообщение…"]', { timeout: 10000 });
await page.type('textarea[placeholder="Сообщение…"]', 'UI smoke: привет из теста! 👋');
await page.keyboard.press('Enter');
await wait(1200);
await shot('chat-thread');

// ── Profile edit ───────────────────────────────────────────
await page.goto(`${base}/profile`, { waitUntil: 'domcontentloaded' });
await waitText('Изменить', 30000);
await wait(800);
await clickText('Изменить');
await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
await wait(400);
await shot('profile-edit');
const inputs = await page.$$('[role="dialog"] input');
if (inputs[2]) {
  await inputs[2].click({ clickCount: 3 });
  await page.keyboard.type('Нова ✦');
}
await clickText('Сохранить');
await wait(1800);
await shot('profile-saved');

// ── Admin ──────────────────────────────────────────────────
await page.evaluate(() => {
  localStorage.setItem('funbox_demo_telegram_id', '900000000');
  localStorage.removeItem('funbox_token');
});
await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' });
await page.reload({ waitUntil: 'domcontentloaded' });
await waitText('Обзор платформы', 30000);
await wait(700);
await shot('admin-overview');
await clickText('Пользователи');
await waitText('аккаунтов', 10000);
await wait(700);
await shot('admin-users');
await clickText('Вопросы');
await wait(1200);
await shot('admin-questions');

console.log('errors', errors.length ? [...new Set(errors)].slice(0, 20) : 'none');
await browser.close();
