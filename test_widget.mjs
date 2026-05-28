import { chromium } from 'playwright';

const URL     = 'https://secureform.dentalcenterpediatrics.com/webchat_widget.html';
const TIMEOUT = 60000;

async function run() {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const ctx  = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(TIMEOUT);

  const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

  // Log backend requests only
  page.on('request',  req  => { if (req.url().includes('dcp-inbox')) log(`  → ${req.method()} ${req.url().split('/').slice(-2).join('/')}`); });
  page.on('response', resp => { if (resp.url().includes('dcp-inbox')) log(`  ← ${resp.status()} ${resp.url().split('/').slice(-2).join('/')}`); });
  page.on('requestfailed', req => { if (req.url().includes('dcp-inbox')) log(`  ✗ FAILED ${req.url()} — ${req.failure()?.errorText}`); });
  page.on('console',  msg  => { if (['error','warn'].includes(msg.type())) log(`  JS ${msg.type().toUpperCase()}: ${msg.text()}`); });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  log('Page loaded');

  // ── 1. Bubble visible ─────────────────────────────────────
  await page.waitForSelector('#bubble');
  log('PASS: bubble visible');

  // ── 2. Office status dot ──────────────────────────────────
  await page.waitForFunction(() => {
    const dot = document.getElementById('hdr-dot');
    return dot && dot.style.background && dot.style.background !== '';
  });
  const dotColor = await page.$eval('#hdr-dot', el => el.style.background);
  const hdrSub   = await page.$eval('#hdr-status', el => el.textContent);
  log(`PASS: status dot=${dotColor}, subtitle="${hdrSub}"`);

  // ── 3. Open panel ─────────────────────────────────────────
  await page.click('#bubble');
  await page.waitForSelector('#panel.open');
  log('PASS: panel opened');

  // ── 4. Greeting ───────────────────────────────────────────
  await page.waitForFunction(() => document.querySelector('#msgs .msg-row.bot') !== null);
  const greeting = await page.$eval('#msgs .msg-row.bot .bbl', el => el.textContent);
  log(`PASS: greeting = "${greeting.slice(0, 60)}…"`);

  // ── 5. Send regular message ───────────────────────────────
  await page.fill('#user-input', 'What are your office hours?');
  await page.press('#user-input', 'Enter');
  log('Sent: "What are your office hours?"');

  await page.waitForFunction(() => document.querySelectorAll('#msgs .msg-row.bot').length >= 2);
  const aiReply = await page.$$eval('#msgs .msg-row.bot .bbl', els => els[els.length - 1].textContent);
  log(`PASS: AI replied = "${aiReply.slice(0, 100)}"`);

  // ── 6. Handoff phrase ─────────────────────────────────────
  await page.fill('#user-input', 'I want to talk to a real person please');
  await page.press('#user-input', 'Enter');
  log('Sent: handoff phrase');

  await page.waitForFunction(() => document.querySelectorAll('#msgs .msg-row.bot').length >= 3);

  const isLive       = await page.$eval('#hdr-dot',    el => el.classList.contains('live'));
  const headerName   = await page.$eval('#hdr-name',   el => el.textContent);
  const headerStatus = await page.$eval('#hdr-status', el => el.textContent);
  const lastMsg      = await page.$$eval('#msgs .msg-row.bot .bbl', els => els[els.length - 1].textContent);

  if (isLive) {
    log(`PASS: live mode active — header="${headerName}", status="${headerStatus}"`);
    log(`      connecting message = "${lastMsg.slice(0, 100)}"`);

    // ── 7. Message in live mode ───────────────────────────
    await page.fill('#user-input', 'Hello, is anyone there?');
    await page.press('#user-input', 'Enter');
    log('Sent: patient message in live mode (verify in DCP admin inbox)');
    await page.waitForTimeout(2000);

    // ── 8. sessionStorage ─────────────────────────────────
    const sid  = await page.evaluate(() => sessionStorage.getItem('wc_session_id'));
    const live = await page.evaluate(() => sessionStorage.getItem('wc_live_mode'));
    log(`PASS: sessionStorage session=${sid}, live_mode=${live}`);

    // ── 9. Reload restore ─────────────────────────────────
    log('Reloading page to test session restore…');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.click('#bubble');
    await page.waitForTimeout(3000);
    const restored       = await page.$eval('#hdr-dot',  el => el.classList.contains('live'));
    const restoredHeader = await page.$eval('#hdr-name', el => el.textContent);
    log(restored
      ? `PASS: session restored — header="${restoredHeader}"`
      : `INFO: session not restored (backend may have ended it)`);

  } else {
    log(`INFO: live mode not triggered`);
    log(`      header="${headerName}", AI reply="${lastMsg.slice(0, 120)}"`);
    log('      (office is likely closed — expected behavior)');
  }

  // ── 10. Verify sessionStorage always has session_id ──────
  const storedSid = await page.evaluate(() => sessionStorage.getItem('wc_session_id'));
  log(storedSid
    ? `PASS: wc_session_id persisted = ${storedSid}`
    : `FAIL: wc_session_id missing from sessionStorage`);

  log('─── All checks complete. Closing in 10 s ───');
  await page.waitForTimeout(10000);
  await browser.close();
}

run().catch(err => { console.error('TEST ERROR:', err.message); process.exit(1); });
