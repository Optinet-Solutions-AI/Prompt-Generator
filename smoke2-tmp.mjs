import { chromium } from 'playwright';
import fs from 'fs';
const out = process.argv[2];
const env = fs.readFileSync('.env.local','utf8');
const tok = (env.match(/^VITE_ASSISTANT_TOKENS=(.*)$/m)||[])[1].split(',')[0].trim();
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1100 } });
p.on('console', m => { if (m.type()==='error') console.log('  JS error:', m.text().slice(0,140)); });
p.on('response', r => { if (r.url().includes('/api/assistant')) console.log(`  ${r.status()} ${r.url().split('/api/')[1]}`); });

await p.goto(`https://prompt-generator-virid-delta.vercel.app/assistant/${tok}`, { waitUntil:'networkidle' });
await p.waitForTimeout(1500);

await p.getByPlaceholder(/new year banner/i).fill('Summer slots promo banner');
await p.locator('textarea').first().fill('A hero moment celebrating a big win. Energetic, premium.');
const go = p.getByRole('button', { name: /Draft 3 concepts/i });
console.log('button enabled after filling Task topic:', await go.isEnabled());
await go.click();
console.log('concepts requested…');

try { await p.waitForSelector('text=/Use this|Pick this|Generate/i', { timeout: 200000 }); }
catch { console.log('  (no concept action button appeared within 200s)'); }
await p.waitForTimeout(3000);
await p.screenshot({ path: out+'/sm2-concepts.png', fullPage:true });
const t1 = await p.textContent('body');
console.log('mentions recommend:', /recommend/i.test(t1||''), '| mentions error:', /failed|went wrong/i.test(t1||''));
const cost1 = await p.getByRole('button', { name: /Cost/i }).textContent().catch(()=>'?');
console.log('cost after concepts:', cost1);

// pick the first concept
const pick = p.getByRole('button', { name: /Use this|Pick this|Generate/i }).first();
if (await pick.count()) {
  await pick.click();
  console.log('picked concept 1, waiting for generated prompt…');
  try { await p.waitForSelector('text=/positive_prompt|Positive prompt|Refine/i', { timeout: 200000 }); }
  catch { console.log('  (generated panel did not appear within 200s)'); }
  await p.waitForTimeout(3000);
  await p.screenshot({ path: out+'/sm2-generated.png', fullPage:true });

  // pick a SECOND concept -> version strip should appear
  const picks = p.getByRole('button', { name: /Use this|Pick this|Generate/i });
  if (await picks.count() > 1) {
    await picks.nth(1).click();
    console.log('picked concept 2, waiting…');
    await p.waitForTimeout(25000);
    await p.screenshot({ path: out+'/sm2-versions.png', fullPage:true });
    const t2 = await p.textContent('body');
    console.log('version strip visible (looks for "generated"/"refined" chips):', /1 ·|2 ·/.test(t2||''));
  } else { console.log('only one pick button — cannot test version strip'); }
}
const cost2 = await p.getByRole('button', { name: /Cost/i }).textContent().catch(()=>'?');
console.log('cost at end:', cost2);
console.log('DONE');
await b.close();
