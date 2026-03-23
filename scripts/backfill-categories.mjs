/**
 * Backfill script: copies prompt_category from Airtable → Supabase
 *
 * HOW TO RUN:
 *   First run this SQL in your Supabase SQL Editor:
 *     ALTER TABLE web_image_analysis ADD COLUMN IF NOT EXISTS prompt_category text;
 *
 *   Then run this script:
 *     SUPABASE_URL=https://hggcgloqujgqvtswstlf.supabase.co \
 *     SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *     AIRTABLE_PAT=pat... \
 *     node scripts/backfill-categories.mjs
 */

const SUPABASE_URL              = process.env.SUPABASE_URL              || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const AIRTABLE_PAT              = process.env.AIRTABLE_PAT              || '';
const AIRTABLE_BASE_ID          = 'appp9iLlSQTlnfytA';

const missing = [
  !SUPABASE_URL              && 'SUPABASE_URL',
  !SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
  !AIRTABLE_PAT              && 'AIRTABLE_PAT',
].filter(Boolean);
if (missing.length) {
  console.error(`\n❌  Missing env vars: ${missing.join(', ')}\n`);
  process.exit(1);
}

/** Fetch ALL records from Airtable (handles pagination) */
async function fetchAllAirtableRecords() {
  const records = [];
  let offset = null;

  console.log('Fetching from Airtable "Web Image Analysis"...');

  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Web%20Image%20Analysis`);
    // Only fetch the fields we need
    url.searchParams.set('fields[]', 'prompt_category');
    url.searchParams.set('fields[]', 'prompt_name');
    if (offset) url.searchParams.set('offset', offset);

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Airtable fetch failed (${res.status}): ${err}`);
    }

    const json = await res.json();
    records.push(...json.records);
    offset = json.offset || null;
    console.log(`  Fetched ${records.length} records so far...`);
  } while (offset);

  console.log(`  Total: ${records.length} records from Airtable`);
  return records;
}

async function main() {
  const records = await fetchAllAirtableRecords();

  // Show what categories exist
  const cats = new Set(records.map(r => r.fields.prompt_category).filter(Boolean));
  console.log('\nCategories found in Airtable:', [...cats]);

  let updated = 0;
  let skipped = 0;

  console.log('\nUpdating Supabase...');

  for (const record of records) {
    const airtable_id = record.id;
    const prompt_category = record.fields.prompt_category || null;
    const prompt_name = record.fields.prompt_name || '(no name)';

    if (!prompt_category) {
      skipped++;
      continue; // nothing to copy
    }

    // Update the Supabase row that has this airtable_id
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/web_image_analysis?airtable_id=eq.${encodeURIComponent(airtable_id)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey':        SUPABASE_SERVICE_ROLE_KEY,
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify({ prompt_category }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error(`  ❌ Failed to update "${prompt_name}": ${err}`);
    } else {
      updated++;
      if (updated % 20 === 0) console.log(`  Updated ${updated} records...`);
    }
  }

  console.log(`\n✅  Done!`);
  console.log(`   Updated: ${updated} records`);
  console.log(`   Skipped (no category): ${skipped} records`);
}

main().catch(err => {
  console.error('\n❌  Failed:', err.message);
  process.exit(1);
});
