'use strict';

const puppeteer = require('puppeteer');

function launchOptions() {
  return {
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  };
}

/**
 * @param {string} html full HTML document
 * @returns {Promise<Buffer>}
 */
async function htmlToPdfBuffer(html) {
  let browser;
  try {
    browser = await puppeteer.launch(launchOptions());
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 90000 });
    const buf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.45in', right: '0.45in', bottom: '0.45in', left: '0.45in' },
    });
    await browser.close();
    return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    throw e;
  }
}

module.exports = { htmlToPdfBuffer, launchOptions };
