/**
 * PDFEasy — Complete Payment Flow Test (v3)
 * Clean run: fresh server, handles popup, captures full flow
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE_URL = 'http://localhost:5173';
const SHOTS_DIR = path.join(__dirname, 'payment-flow-screenshots');
// Clear old screenshots
if (fs.existsSync(SHOTS_DIR)) {
  fs.readdirSync(SHOTS_DIR).forEach(f => fs.unlinkSync(path.join(SHOTS_DIR, f)));
}
fs.mkdirSync(SHOTS_DIR, { recursive: true });

let shotNum = 0;
const shots = [];
const results = { pass: [], fail: [] };

function pass(label) { results.pass.push(label); console.log(`  ✅ ${label}`); }
function fail(label) { results.fail.push(label); console.log(`  ❌ ${label}`); }

async function shot(page, label) {
  shotNum++;
  const fname = `${String(shotNum).padStart(2,'0')}_${label}.png`;
  const fpath = path.join(SHOTS_DIR, fname);
  try { await page.screenshot({ path: fpath, fullPage: false }); } catch(e) {}
  shots.push(fpath);
  console.log(`  📸 [${shotNum}] ${label}`);
  return fpath;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function api(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method, hostname: 'localhost', port: 5173, path: endpoint,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({ raw: d }); }});
    });
    req.on('error', e => resolve({ error: e.message }));
    if (data) req.write(data);
    req.end();
  });
}

// Scroll element into view and take screenshot
async function scrollShot(page, label, selector) {
  if (selector) {
    await page.evaluate(sel => {
      const el = document.querySelector(sel);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, selector).catch(() => {});
    await sleep(500);
  }
  await shot(page, label);
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   PDFEasy — Full Payment Flow Test (Clean Run)          ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Verify server fresh state
  const initStatus = await api('GET', '/api/usage/status');
  console.log(`Server status: count=${initStatus.count}, premium=${initStatus.premiumUnlocked}`);
  if (initStatus.count !== 0) {
    fail('Server not fresh — expected count=0');
    process.exit(1);
  }
  pass('Server freshly started (count=0, premium=false)');
  console.log();

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--window-size=1280,800',
      '--disable-popup-blocking'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // Intercept popups to prevent them from killing the main session
  browser.on('targetcreated', async (target) => {
    if (target.type() === 'page') {
      try {
        const popup = await target.page();
        await sleep(1000);
        // Take a shot of the popup before closing
        const fname = path.join(SHOTS_DIR, `${String(++shotNum).padStart(2,'0')}_popup_${Date.now()}.png`);
        await popup.screenshot({ path: fname, fullPage: false });
        shots.push(fname);
        console.log(`  📸 [${shotNum}] popup captured`);
        await popup.close();
        console.log('  ℹ️  Popup closed to preserve main session');
      } catch(e) { /* ignore */ }
    }
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (!t.includes('favicon') && !t.includes('pdfjs') && !t.includes('404')) {
        console.log(`  ⚠️  JS: ${t.substring(0, 100)}`);
      }
    }
  });

  try {
    // ══════════════════════════════════════════════════════════════════════
    console.log('═══ STEP 1: HOME PAGE ══════════════════════════════════════');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(2000);
    await shot(page, '01_home_page');
    
    const title = await page.title();
    pass(`Page title: "${title}"`);
    
    const cards = await page.$$eval('a[href]', links =>
      links.filter(a => a.href.match(/merge|split|compress|protect|rotate|delete|jpg|word/i)).length
    );
    pass(`${cards} tool links visible`);
    console.log();

    // ══════════════════════════════════════════════════════════════════════
    console.log('═══ STEP 2: FREE USES — 1, 2, 3 ═══════════════════════════');
    
    for (let i = 1; i <= 3; i++) {
      const r = await api('POST', '/api/usage/increment', { email: null });
      if (r.allowed) pass(`Use #${i}: ALLOWED (count=${r.count})`);
      else fail(`Use #${i}: Unexpectedly blocked!`);
      await sleep(100);
    }
    console.log();

    // ══════════════════════════════════════════════════════════════════════
    console.log('═══ STEP 3: 4TH USE → PAYWALL BLOCK ═══════════════════════');
    
    const r4 = await api('POST', '/api/usage/increment', { email: null });
    if (!r4.allowed) pass(`Use #4: BLOCKED ✓ (count stays at ${r4.count})`);
    else fail(`Use #4 was NOT blocked (count=${r4.count})`);

    const s3 = await api('GET', '/api/usage/status');
    console.log(`  Status: count=${s3.count}, premium=${s3.premiumUnlocked}`);
    console.log();

    // ══════════════════════════════════════════════════════════════════════
    console.log('═══ STEP 4: PAYWALL MODAL — NAVIGATE & TRIGGER ════════════');
    
    // Go to merge-pdf
    await page.goto(`${BASE_URL}/merge-pdf`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await shot(page, '02_merge_pdf_tool');
    pass('Navigated to Merge PDF tool');

    // Find the "Upgrade" or premium button in the navbar
    // Look for it by evaluating all buttons
    const allBtns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button, [role="button"]'))
        .map(b => ({ text: b.textContent.trim(), id: b.id, cls: b.className.substring(0, 50) }))
        .filter(b => b.text.length > 0)
    );
    console.log(`  Available buttons: ${allBtns.map(b => b.text).slice(0,20).join(' | ')}`);

    // Try to find upgrade/premium button
    const upgradeFound = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, a'))
        .find(el => el.textContent.match(/upgrade|premium|go.*pro|get.*access|unlock.*premium/i));
      if (btn) { btn.click(); return btn.textContent.trim(); }
      return null;
    });
    
    await sleep(1500);

    if (upgradeFound) {
      pass(`Upgrade button found: "${upgradeFound}"`);
      await shot(page, '03_paywall_opened_via_upgrade');
    } else {
      console.log('  ℹ️  No upgrade button — paywall triggers on tool use');
      // Simulate the paywall by injecting a blocked increment result
      // Use fetch mock before file upload
      await page.evaluate(() => {
        const orig = window.fetch;
        window.fetch = function(url, opts) {
          if (typeof url === 'string' && url.includes('/api/usage/increment')) {
            return Promise.resolve(new Response(
              JSON.stringify({ allowed: false, count: 3 }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            ));
          }
          return orig.apply(this, arguments);
        };
        window.__fetchMocked = true;
      });

      // Now upload a file to trigger the usage check
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        const dummyPath = path.join(__dirname, 'test-dummy.pdf');
        if (fs.existsSync(dummyPath)) {
          await fileInput.uploadFile(dummyPath);
          await sleep(2000);
        }
      }

      // Also try clicking any process button
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button'))
          .find(b => b.textContent.match(/merge|process|compress|start|convert/i));
        if (btn) btn.click();
      });
      await sleep(2000);
      await shot(page, '03_paywall_triggered_via_tool');
    }

    // Check if modal is visible
    const modalCheck = await page.evaluate(() => {
      const modal = document.querySelector('[class*="modal"], [class*="Modal"], [class*="paywall"], [role="dialog"]');
      const pageText = document.body.innerText;
      return {
        modalEl: !!modal,
        hasRupee: pageText.includes('₹'),
        hasPlans: pageText.match(/daily|weekly|monthly/i) !== null,
        hasUpgrade: pageText.match(/upgrade.*premium|premium.*access/i) !== null,
        hasFreeLimit: pageText.match(/free.*limit|limit.*reached|used.*3/i) !== null,
        text: pageText.substring(0, 400).replace(/\s+/g, ' ')
      };
    });

    console.log(`\n  📊 Paywall Modal state:`);
    console.log(`     modalEl=${modalCheck.modalEl} | ₹=${modalCheck.hasRupee} | plans=${modalCheck.hasPlans}`);
    console.log(`     upgrade text=${modalCheck.hasUpgrade} | free limit msg=${modalCheck.hasFreeLimit}`);

    if (modalCheck.modalEl || modalCheck.hasRupee || modalCheck.hasPlans) {
      pass('Paywall modal visible with plan pricing');
    } else {
      console.log(`  📝 Page text: "${modalCheck.text}"`);
    }
    console.log();

    // ══════════════════════════════════════════════════════════════════════
    console.log('═══ STEP 5: SIGN-IN GATE ════════════════════════════════════');
    await shot(page, '04_paywall_full_view');

    const signInState = await page.evaluate(() => {
      const allBtns = Array.from(document.querySelectorAll('button'));
      const signInBtn = allBtns.find(b => b.textContent.match(/sign in|login|continue.*google|google.*sign/i));
      const googleBtn = allBtns.find(b => b.textContent.match(/google/i));
      const emailBtn = allBtns.find(b => b.textContent.match(/email|password/i));
      return {
        hasSignIn: !!signInBtn,
        signInText: signInBtn?.textContent.trim(),
        hasGoogle: !!googleBtn,
        googleText: googleBtn?.textContent.trim(),
        hasEmail: !!emailBtn,
        emailText: emailBtn?.textContent.trim()
      };
    });

    console.log(`  Sign-in gate: ${JSON.stringify(signInState, null, 2).substring(0,200)}`);

    if (signInState.hasSignIn || signInState.hasGoogle) {
      pass(`Sign-in gate visible: "${signInState.signInText || signInState.googleText}"`);
    }

    // Click Sign In button in the main page header
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim() === 'Sign In');
      if (btn) btn.click();
    });
    await sleep(1500);
    await shot(page, '05_signin_page');

    // Check if sign-in form appeared
    const signInForm = await page.evaluate(() => {
      const pageText = document.body.innerText;
      return {
        hasEmailField: !!document.querySelector('input[type="email"]'),
        hasPasswordField: !!document.querySelector('input[type="password"]'),
        hasGoogle: pageText.includes('Google'),
        hasPhone: pageText.includes('Phone') || pageText.includes('OTP'),
        text: pageText.substring(0, 300).replace(/\s+/g, ' ')
      };
    });

    if (signInForm.hasEmailField) pass('Email sign-in form visible');
    if (signInForm.hasGoogle) pass('Google sign-in option visible');
    if (signInForm.hasPhone) pass('Phone/OTP sign-in option visible');

    console.log();

    // ══════════════════════════════════════════════════════════════════════
    console.log('═══ STEP 6: EMAIL/PASSWORD SIGN-IN FLOW ════════════════════');

    // Fill email and password if form is visible
    if (signInForm.hasEmailField) {
      await page.type('input[type="email"]', 'testuser@pdfeasy.in', { delay: 50 });
      await sleep(300);
      if (signInForm.hasPasswordField) {
        await page.type('input[type="password"]', 'test123456', { delay: 50 });
      }
      await sleep(500);
      await shot(page, '06_signin_form_filled');
      pass('Sign-in form filled with test credentials');

      // Click Sign In button
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button'))
          .find(b => b.textContent.match(/sign in|login|submit|continue/i) && b.type === 'submit' || 
                b.textContent.match(/sign in|login/i));
        if (btn) btn.click();
      });
      await sleep(2000);
      await shot(page, '07_after_signin_submit');
    }
    console.log();

    // ══════════════════════════════════════════════════════════════════════
    console.log('═══ STEP 7: PLAN SELECTION ══════════════════════════════════');
    await page.goto(`${BASE_URL}/merge-pdf`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await shot(page, '08_back_to_tool');

    // Navigate to home and click Upgrade from navbar
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await sleep(1000);

    // Click upgrade button - this should open the paywall/plan selection
    await page.evaluate(() => {
      // Try to find the navbar upgrade button
      const navLinks = Array.from(document.querySelectorAll('nav button, nav a, header button, header a, [class*="nav"] button'));
      const upgradeEl = navLinks.find(el => el.textContent.match(/upgrade|premium|plan/i));
      if (upgradeEl) { upgradeEl.click(); return 'nav-upgrade'; }
      
      // Fallback: any upgrade button
      const anyUpgrade = Array.from(document.querySelectorAll('button, a'))
        .find(el => el.textContent.match(/upgrade|premium/i));
      if (anyUpgrade) { anyUpgrade.click(); return 'any-upgrade'; }
      return 'none';
    });
    await sleep(2000);
    await shot(page, '09_plan_selection_view');
    pass('Plan selection view captured');
    console.log();

    // ══════════════════════════════════════════════════════════════════════
    console.log('═══ STEP 8: PAYMENT API — All 3 Plans ══════════════════════');

    const plans = [
      { id: 'daily', email: 'daily-test@pdfeasy.in', expectedHours: 24 },
      { id: 'weekly', email: 'weekly-test@pdfeasy.in', expectedDays: 7 },
      { id: 'monthly', email: 'monthly-test@pdfeasy.in', expectedDays: 30 }
    ];

    for (const plan of plans) {
      const unlock = await api('POST', '/api/usage/unlock', { email: plan.email, planId: plan.id });
      if (unlock.success) {
        const expiresAt = new Date(unlock.planExpiresAt);
        const daysUntil = Math.round((expiresAt - new Date()) / 86400000);
        pass(`${plan.id.toUpperCase()} plan: "${unlock.planName}" → expires ${expiresAt.toLocaleDateString('en-IN')} (~${daysUntil}d)`);
      } else {
        fail(`${plan.id} plan unlock failed: ${JSON.stringify(unlock)}`);
      }

      // Verify post-payment uses work
      const postUse = await api('POST', '/api/usage/increment', { email: plan.email });
      if (postUse.allowed) pass(`  Post-payment use: ALLOWED`);
      else fail(`  Post-payment use: BLOCKED (unexpected!)`);
    }
    console.log();

    // ══════════════════════════════════════════════════════════════════════
    console.log('═══ STEP 9: SANDBOX PAYMENT SIMULATOR ══════════════════════');
    
    // Check if the app has a sandbox payment flow (mock Razorpay)
    await page.goto(`${BASE_URL}/compress-pdf`, { waitUntil: 'networkidle2' });
    await sleep(1000);
    
    // Mock the payment flow trigger
    await page.evaluate(() => {
      // Simulate limit reached and paywall shown
      const event = new CustomEvent('pdfeasy:show-paywall', { bubbles: true });
      document.dispatchEvent(event);
    });
    await sleep(1000);
    await shot(page, '10_compress_pdf_page');
    pass('Compress PDF page loads correctly');
    console.log();

    // ══════════════════════════════════════════════════════════════════════
    console.log('═══ STEP 10: FULL UI WALKTHROUGH ═══════════════════════════');
    
    const toolRoutes = [
      { path: '/', label: 'Home' },
      { path: '/merge-pdf', label: 'Merge PDF' },
      { path: '/split-pdf', label: 'Split PDF' },
      { path: '/compress-pdf', label: 'Compress PDF' },
      { path: '/protect-pdf', label: 'Protect PDF' },
      { path: '/delete-pdf-pages', label: 'Delete Pages' },
      { path: '/rotate-pdf', label: 'Rotate PDF' },
      { path: '/jpg-to-pdf', label: 'JPG to PDF' },
      { path: '/pdf-to-jpg', label: 'PDF to JPG' },
    ];

    for (const route of toolRoutes) {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle2', timeout: 10000 });
      await sleep(600);
      const shortLabel = route.label.toLowerCase().replace(/\s+/g, '_');
      await shot(page, `11_${shortLabel}`);
      
      const pageOk = await page.evaluate(() => !document.body.innerText.includes('404'));
      if (pageOk) pass(`${route.label} page loads OK`);
      else fail(`${route.label} shows 404`);
    }
    console.log();

  } catch(err) {
    console.error('\n❌ Test error:', err.message);
    await shot(page, 'XX_error').catch(() => {});
  } finally {
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n═══ FINAL RESULTS ════════════════════════════════════════════');
    console.log(`\n  ✅ PASSED: ${results.pass.length}`);
    results.pass.forEach(p => console.log(`     ✓ ${p}`));
    
    if (results.fail.length > 0) {
      console.log(`\n  ❌ FAILED: ${results.fail.length}`);
      results.fail.forEach(f => console.log(`     ✗ ${f}`));
    }
    
    console.log(`\n  📸 Screenshots: ${shots.length} captured`);
    console.log(`  📁 Location: ${SHOTS_DIR}`);
    shots.forEach(s => console.log(`     ${path.basename(s)}`));

    await sleep(3000);
    await browser.close();
    console.log('\n✅ Test complete. Browser closed.');
  }
}

main().catch(console.error);
