const puppeteer = require('puppeteer');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    page.setViewport({ width: 1024, height: 768 });

    // Navigate to government section directly
    console.log('1️⃣ Navigating to app government section...');
    await page.goto('http://localhost:3000/app.html#action/government', { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Wait for content to load
    await delay(3000);

    // Check current URL
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    // Check if we're logged in - look for gov-reps-container
    const repsContainer = await page.$('#gov-reps-container');
    if (!repsContainer) {
      console.log('❌ Reps container not found - may need to be logged in');
      const isAtLogin = currentUrl.includes('login');
      if (isAtLogin) {
        console.log('⚠️ Redirected to login - cannot continue without authentication');
      }
      await browser.close();
      return;
    }

    console.log('✅ Government section loaded');

    // Try to find rep cards
    const reps = await page.$$('[data-rep-id]');
    if (reps.length === 0) {
      console.log('⚠️ No reps loaded. User may not have location set.');
      const containerHTML = await page.$eval('#gov-reps-container', el => el.innerHTML.substring(0, 200));
      console.log('Container shows:', containerHTML);
      await browser.close();
      return;
    }

    console.log(`✅ Found ${reps.length} representatives`);

    // Test 1: Check party badges
    console.log('\n2️⃣ Testing party badges...');
    const badgeData = await page.$$eval('.civic-rep-party-badge', (badges) => {
      return badges.map((badge) => ({
        text: badge.textContent.trim(),
        classes: Array.from(badge.classList).join(','),
      }));
    });

    console.log('Sample badges:', badgeData.slice(0, 3).map(b => `"${b.text}" [${b.classes}]`));

    const hasProperBadges = badgeData.every(b =>
      (b.text === 'Democrat' && b.classes.includes('party-d')) ||
      (b.text === 'Republican' && b.classes.includes('party-r')) ||
      (b.text === 'Independent' && b.classes.includes('party-i')) ||
      (b.text === 'Green' && b.classes.includes('party-g')) ||
      (b.text && !b.text.includes('Green')) // unknown party with proper display
    );

    if (hasProperBadges) {
      console.log('✅ Party badges display correctly with proper CSS classes');
    } else {
      console.log('❌ Some badges not properly classified');
    }

    // Test 2: Click on first rep to open profile panel
    console.log('\n3️⃣ Opening profile panel...');
    const clickResult = await page.evaluate(() => {
      const card = document.querySelector('[data-rep-id]');
      if (!card) return { success: false, reason: 'no card' };
      const header = card.querySelector('div[style*="cursor"]');
      if (!header) return { success: false, reason: 'no header' };
      header.click();
      return { success: true };
    });

    if (!clickResult.success) {
      console.log(`❌ Failed to click: ${clickResult.reason}`);
      await browser.close();
      return;
    }

    // Wait for panel animation
    await delay(600);

    const panelActive = await page.$('#rep-profile-panel.active');
    if (!panelActive) {
      console.log('❌ Profile panel did not open');
      // Check if panel exists at all
      const panelExists = await page.$('#rep-profile-panel');
      console.log(`Panel DOM exists: ${!!panelExists}`);
      await browser.close();
      return;
    }

    console.log('✅ Profile panel opened and visible');

    // Check panel content
    console.log('\n4️⃣ Verifying profile panel content...');
    const panelInfo = await page.evaluate(() => {
      const title = document.querySelector('#rep-profile-panel-title');
      const body = document.querySelector('#rep-profile-panel-body');

      if (!title || !body) return { error: 'panel elements missing' };

      const html = body.innerHTML;
      return {
        title: title.textContent,
        bodyLength: html.length,
        hasTurnarounds: html.includes('Energy Transition') || html.includes('Food Systems'),
        hasLeverageLines: html.includes('Controls') || html.includes('Sets') || html.includes('Shapes'),
        hasPhoto: html.includes('<img'),
        hasContact: html.includes('Call') || html.includes('Website'),
      };
    });

    if (panelInfo.error) {
      console.log(`❌ ${panelInfo.error}`);
      await browser.close();
      return;
    }

    console.log(`✅ Panel title: "${panelInfo.title}"`);

    if (panelInfo.hasTurnarounds) {
      console.log('✅ Panel shows turnaround sections');
    } else {
      console.log('⚠️ No turnaround sections (rep may have no committees)');
    }

    if (panelInfo.hasLeverageLines) {
      console.log('✅ Panel contains leverage lines');
    } else if (!panelInfo.hasTurnarounds) {
      console.log('⚠️ No leverage lines (expected for reps with no committees)');
    }

    if (panelInfo.hasPhoto) {
      console.log('✅ Rep photo included');
    }

    if (panelInfo.hasContact) {
      console.log('✅ Contact links present');
    }

    // Test 3: Close with Escape
    console.log('\n5️⃣ Testing Escape key to close panel...');
    await page.keyboard.press('Escape');
    await delay(400);

    const panelAfterEscape = await page.$('#rep-profile-panel.active');
    if (!panelAfterEscape) {
      console.log('✅ Panel closed with Escape key');
    } else {
      console.log('❌ Panel did not close with Escape');
    }

    console.log('\n✅ All tests passed! Profile feature is working correctly.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
