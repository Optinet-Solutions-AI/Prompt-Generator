import { chromium } from 'playwright';

const SCREENSHOTS_DIR = 'C:/Users/User/Prompt-Generator/screenshots';

async function capture(page, name) {
  const path = `${SCREENSHOTS_DIR}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log(`Saved: ${path}`);
  return path;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function findButton(page, selectors, timeoutMs = 3000) {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      await el.waitFor({ state: 'visible', timeout: timeoutMs });
      console.log(`  Found with selector: ${sel}`);
      return el;
    } catch {
      // try next
    }
  }
  return null;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  // Capture console messages from the page
  page.on('console', msg => console.log(`  [PAGE CONSOLE] ${msg.type()}: ${msg.text()}`));

  // ---------- Step 1: Navigate ----------
  console.log('\n=== Step 1: Navigating to http://localhost:3001 ===');
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
  await capture(page, 'step1_initial_page');

  // ---------- Step 2: Inject images into localStorage ----------
  console.log('\n=== Step 2: Injecting 10 test images into localStorage ===');
  const injectResult = await page.evaluate(() => {
    const images = Array.from({ length: 10 }, (_, i) => ({
      id: `img-test-${i}-${Date.now()}`,
      created_at: new Date(Date.now() - i * 60000).toISOString(),
      filename: `chatgpt-image-${i}.png`,
      provider: i % 3 === 0 ? 'gemini' : i % 3 === 1 ? 'chatgpt' : 'edit',
      aspect_ratio: '16:9',
      resolution: '1K',
      storage_path: '',
      public_url: `https://picsum.photos/seed/${i + 50}/800/450`
    }));
    localStorage.setItem('pg_generated_images', JSON.stringify(images));
    const stored = JSON.parse(localStorage.getItem('pg_generated_images'));
    return { count: stored.length, first_id: stored[0].id, last_id: stored[stored.length - 1].id };
  });
  console.log(`  Stored ${injectResult.count} images. First ID: ${injectResult.first_id}, Last ID: ${injectResult.last_id}`);

  // ---------- Step 3: Screenshot after injection ----------
  console.log('\n=== Step 3: Screenshot confirming localStorage injection ===');
  await capture(page, 'step3_after_injection');

  // ---------- Step 4: Click Image Library (NO page refresh) ----------
  console.log('\n=== Step 4: Clicking "Image Library" button (no refresh) ===');
  const libSelectors = [
    'button:has-text("Image Library")',
    'text=Image Library',
    'a:has-text("Image Library")',
    '[aria-label="Image Library"]',
    '[title="Image Library"]',
  ];
  const libButton = await findButton(page, libSelectors);

  if (!libButton) {
    console.log('  ERROR: Could not find Image Library button. Capturing page for inspection.');
    // Dump all button texts
    const buttons = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button, a')).map(el => el.innerText?.trim() || el.getAttribute('aria-label') || el.id).filter(Boolean)
    );
    console.log('  All clickable elements:', buttons.join(' | '));
    await capture(page, 'step4_no_button_found');
    await browser.close();
    return;
  }

  await libButton.click();

  // ---------- Step 5: Immediate screenshot (< 0.3s) — skeleton boxes? ----------
  console.log('\n=== Step 5: Immediate screenshot (~0.2s after click) — checking for skeletons ===');
  await sleep(200);
  await capture(page, 'step5_immediate_0_2s');

  // ---------- Step 6: Wait 4s, screenshot — images loaded? ----------
  console.log('\n=== Step 6: Waiting 4 seconds then screenshot ===');
  await sleep(4000);
  await capture(page, 'step6_after_4_seconds');

  // Check what's visible in the library
  const libraryState = await page.evaluate(() => {
    const imgs = document.querySelectorAll('img');
    const skeletons = document.querySelectorAll('[class*="skeleton"], [class*="Skeleton"], [class*="loading"], [class*="shimmer"], [class*="animate-pulse"]');
    return {
      image_count: imgs.length,
      skeleton_count: skeletons.length,
      img_srcs: Array.from(imgs).slice(0, 5).map(i => i.src),
    };
  });
  console.log(`  Images on page: ${libraryState.image_count}`);
  console.log(`  Skeleton elements: ${libraryState.skeleton_count}`);
  console.log(`  First few img srcs: ${libraryState.img_srcs.join(', ')}`);

  // ---------- Step 7: Click Back ----------
  console.log('\n=== Step 7: Clicking "Back" button ===');
  const backSelectors = [
    'button:has-text("Back")',
    'text=Back',
    'a:has-text("Back")',
    '[aria-label="Back"]',
    '[aria-label="back"]',
    'button:has-text("← Back")',
    'button:has-text("‹")',
  ];
  const backButton = await findButton(page, backSelectors);

  if (!backButton) {
    console.log('  ERROR: Could not find Back button. Dumping clickables...');
    const buttons = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button, a')).map(el => el.innerText?.trim() || el.getAttribute('aria-label')).filter(Boolean)
    );
    console.log('  Clickable elements in library view:', buttons.join(' | '));
    await capture(page, 'step7_no_back_button');
  } else {
    await backButton.click();
    await sleep(800);
    await capture(page, 'step7_after_back');
    console.log('  Back clicked, screenshot taken.');

    // ---------- Step 8: Click Image Library again ----------
    console.log('\n=== Step 8: Second visit — clicking Image Library again ===');
    const libButton2 = await findButton(page, libSelectors);

    if (!libButton2) {
      console.log('  ERROR: Could not find Image Library button on second visit.');
      await capture(page, 'step8_no_button');
    } else {
      await libButton2.click();

      // ---------- Step 9: Immediate screenshot on second visit ----------
      console.log('\n=== Step 9: Immediate screenshot on second visit (~0.2s) ===');
      await sleep(200);
      await capture(page, 'step9_second_visit_immediate');

      const secondVisitState = await page.evaluate(() => {
        const imgs = document.querySelectorAll('img');
        const skeletons = document.querySelectorAll('[class*="skeleton"], [class*="Skeleton"], [class*="loading"], [class*="shimmer"], [class*="animate-pulse"]');
        return {
          image_count: imgs.length,
          skeleton_count: skeletons.length,
        };
      });
      console.log(`  Second visit — Images: ${secondVisitState.image_count}, Skeletons: ${secondVisitState.skeleton_count}`);

      await sleep(3000);
      await capture(page, 'step9b_second_visit_3s');
      console.log('  Second visit 3s screenshot taken.');
    }
  }

  await browser.close();
  console.log('\n=== All steps complete ===');
}

run().catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
