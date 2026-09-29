import puppeteer from 'puppeteer';

const token = process.env.NP_SCREENSHOT_SESSION;
if (!token) {
  console.error('Set NP_SCREENSHOT_SESSION to a valid causal_session cookie value.');
  process.exit(1);
}
const url = process.env.NP_SCREENSHOT_URL || 'http://127.0.0.1:3000/np/o/causal-work';
const out = process.env.NP_SCREENSHOT_OUT || '/root/causal-app/tmp/np-org-grants-dashboard.png';

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
await page.setCookie({
  name: 'causal_session',
  value: token,
  url: 'http://127.0.0.1:3000',
  path: '/',
  httpOnly: true,
});
await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForSelector('#np-org-dashboard', { timeout: 15000 });
await page.click('#np-grant-add');
await page.waitForSelector('#np-grant-modal.np-modal-open', { timeout: 5000 });
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: out, type: 'png' });
await browser.close();
console.log('Wrote', out);
