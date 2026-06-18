/**
 * Live Browser Test v2 — Tests all PDF tools in a real Chrome browser
 * with screenshots at each step.
 *
 * Usage:  node test-browser.cjs
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:5173';
const SCREENSHOT_DIR = path.join(__dirname, 'test-screenshots');
const TEST_INVOICE = '/tmp/test_invoice.pdf';
const TEST_REPORT = '/tmp/test_report.pdf';

// Clean and recreate screenshot directory
if (fs.existsSync(SCREENSHOT_DIR)) fs.rmSync(SCREENSHOT_DIR, { recursive: true });
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let stepNum = 0;
async function screenshot(page, label) {
  stepNum++;
  const filename = `${String(stepNum).padStart(2, '0')}_${label}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`  📸 Screenshot: ${filename}`);
  return filepath;
}

async function testTool(page, toolSlug, toolName, testFiles, extraSteps) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  🧪 TESTING: ${toolName}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Navigate to the tool
  await page.goto(`${BASE}/${toolSlug}`, { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1000));
  await screenshot(page, `${toolSlug}_1_landing`);

  // Upload file(s)
  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) {
    console.log('  ⚠️  No file input found — skipping');
    return false;
  }

  await fileInput.uploadFile(...testFiles);
  await new Promise(r => setTimeout(r, 2500)); // Wait for preview generation
  await screenshot(page, `${toolSlug}_2_uploaded`);

  // Run any extra steps (select pages, enter password, etc.)
  if (extraSteps) {
    await extraSteps(page);
    await new Promise(r => setTimeout(r, 800));
    await screenshot(page, `${toolSlug}_3_configured`);
  }

  // Click Compile & Export button
  const compileBtn = await page.$('#compile_pdf_btn_id');
  if (compileBtn) {
    // Check if button is disabled
    const isDisabled = await page.evaluate(el => el.disabled, compileBtn);
    if (isDisabled) {
      console.log('  ⚠️  Button is disabled — checking why...');
      await screenshot(page, `${toolSlug}_err_disabled`);
      return false;
    }
    await compileBtn.click();
    console.log('  ▶ Clicked Compile & Export');
  } else {
    console.log('  ⚠️  No compile button found');
    return false;
  }

  // Wait for processing (stage 2) to appear
  await new Promise(r => setTimeout(r, 500));
  await screenshot(page, `${toolSlug}_4_processing`);

  // Wait for success stage (stage 3) — give it up to 30 seconds for heavy tools
  try {
    await page.waitForSelector('#success_stage_wrapper', { timeout: 30000 });
  } catch {
    console.log('  ⚠️  Timed out waiting for success...');
    await screenshot(page, `${toolSlug}_err_timeout`);
  }
  await new Promise(r => setTimeout(r, 500));
  await screenshot(page, `${toolSlug}_5_result`);

  // Check if we reached success
  const successEl = await page.$('#success_stage_wrapper');
  if (successEl) {
    console.log('  ✅ SUCCESS — Download screen reached!');

    // Click download button
    const dlBtn = await page.$('#final_download_btn_id');
    if (dlBtn) {
      await dlBtn.click();
      console.log('  ⬇️  Download triggered');
      await new Promise(r => setTimeout(r, 1000));
    }
    return true;
  } else {
    // Check for error message
    const errorMsg = await page.evaluate(() => {
      const el = document.querySelector('.text-red-500');
      return el ? el.textContent : null;
    });
    if (errorMsg) console.log(`  ⚠️  Error shown: "${errorMsg}"`);
    console.log('  ❌ FAILED — Did not reach success screen');
    return false;
  }
}

(async () => {
  console.log('🚀 Launching Chrome browser...\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--window-size=1280,900'],
  });

  const page = await browser.newPage();

  // Set download behavior to our test directory
  const client = await page.createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: SCREENSHOT_DIR,
  });

  // Listen for browser console errors
  page.on('pageerror', err => console.log('  ⚠️  PAGE ERROR:', err.message));

  const results = [];

  // ═══════════════════════════════════════════════════════
  // HOME PAGE
  // ═══════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🏠 HOME PAGE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  await screenshot(page, 'home_page');
  console.log('  ✅ Home page loaded');

  // ═══════════════════════════════════════════════════════
  // TEST 1: MERGE PDF (2 files → 1 merged)
  // ═══════════════════════════════════════════════════════
  const r1 = await testTool(page, 'merge-pdf', 'MERGE PDF (2 files → 1)',
    [TEST_INVOICE, TEST_REPORT], null);
  results.push(['Merge PDF', r1]);

  // ═══════════════════════════════════════════════════════
  // TEST 2: SPLIT PDF (3 pages → ZIP)
  // ═══════════════════════════════════════════════════════
  const r2 = await testTool(page, 'split-pdf', 'SPLIT PDF (3 pages → ZIP)',
    [TEST_INVOICE], null);
  results.push(['Split PDF', r2]);

  // ═══════════════════════════════════════════════════════
  // TEST 3: PDF TO JPG
  // ═══════════════════════════════════════════════════════
  const r3 = await testTool(page, 'pdf-to-jpg', 'PDF TO JPG',
    [TEST_INVOICE], null);
  results.push(['PDF to JPG', r3]);

  // ═══════════════════════════════════════════════════════
  // TEST 4: DELETE PDF PAGES
  // ═══════════════════════════════════════════════════════
  const r4 = await testTool(page, 'delete-pdf-pages', 'DELETE PDF PAGES',
    [TEST_INVOICE], null);
  results.push(['Delete Pages', r4]);

  // ═══════════════════════════════════════════════════════
  // TEST 5: ROTATE PDF
  // ═══════════════════════════════════════════════════════
  const r5 = await testTool(page, 'rotate-pdf', 'ROTATE PDF PAGES',
    [TEST_INVOICE],
    async (pg) => {
      // Click the first page rotate button if visible
      const rotBtn = await pg.$('[data-rotate-btn]');
      if (rotBtn) {
        await rotBtn.click();
        console.log('  🔄 Rotated first page');
      }
    }
  );
  results.push(['Rotate PDF', r5]);

  // ═══════════════════════════════════════════════════════
  // TEST 6: COMPRESS PDF
  // ═══════════════════════════════════════════════════════
  const r6 = await testTool(page, 'compress-pdf', 'COMPRESS PDF',
    [TEST_INVOICE], null);
  results.push(['Compress PDF', r6]);

  // ═══════════════════════════════════════════════════════
  // TEST 7: PROTECT PDF
  // ═══════════════════════════════════════════════════════
  const r7 = await testTool(page, 'protect-pdf', 'PROTECT PDF',
    [TEST_INVOICE],
    async (pg) => {
      // Type password into the correct input fields
      const pwInput = await pg.$('#password_input_protect');
      if (pwInput) {
        await pwInput.click({ clickCount: 3 }); // select all
        await pwInput.type('SecurePass123', { delay: 20 });
        console.log('  🔑 Password entered');
      }
      await new Promise(r => setTimeout(r, 300));
      const confirmInput = await pg.$('#confirm_password_input_protect');
      if (confirmInput) {
        await confirmInput.click({ clickCount: 3 }); // select all
        await confirmInput.type('SecurePass123', { delay: 20 });
        console.log('  🔑 Confirm password entered');
      }
      await new Promise(r => setTimeout(r, 500));
    }
  );
  results.push(['Protect PDF', r7]);

  // ═══════════════════════════════════════════════════════
  // FINAL RESULTS
  // ═══════════════════════════════════════════════════════
  console.log('\n\n══════════════════════════════════════════');
  console.log('  📊 LIVE BROWSER TEST RESULTS');
  console.log('══════════════════════════════════════════');
  let passCount = 0, failCount = 0;
  for (const [name, passed] of results) {
    if (passed) { passCount++; console.log(`  ✅ ${name}`); }
    else { failCount++; console.log(`  ❌ ${name}`); }
  }
  console.log(`\n  Total: ${passCount} passed, ${failCount} failed`);
  console.log(`  Screenshots: ${SCREENSHOT_DIR}`);
  console.log('══════════════════════════════════════════\n');

  // Take final screenshot and wait
  await screenshot(page, 'final_state');
  await new Promise(r => setTimeout(r, 3000));
  await browser.close();
})();
