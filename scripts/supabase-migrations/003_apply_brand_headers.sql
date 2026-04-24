-- ───────────────────────────────────────────────────────────────────
-- 003_apply_brand_headers.sql
-- One-shot: add the header/wordmark columns AND populate them for all 9
-- brands with the Supabase Storage URLs returned by
-- scripts/upload-brand-headers.mjs.
--
-- Apply via Supabase dashboard:
--   SQL editor → New query → paste this entire file → Run
-- ───────────────────────────────────────────────────────────────────

-- 1. Schema additions (safe to rerun)
ALTER TABLE brand_email_config
  ADD COLUMN IF NOT EXISTS header_url       TEXT,
  ADD COLUMN IF NOT EXISTS wordmark_url     TEXT,
  ADD COLUMN IF NOT EXISTS wordmark_dark_bg BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Populate URLs per brand
INSERT INTO brand_email_config (brand_name, header_url, wordmark_url, wordmark_dark_bg) VALUES
  ('FortunePlay', 'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/fortuneplay/email-header.png', 'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/fortuneplay/wordmark.png', FALSE),
  ('Roosterbet',  'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/roosterbet/email-header.png',  'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/roosterbet/wordmark.png',  FALSE),
  ('SpinJo',      'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/spinjo/email-header.png',      'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/spinjo/wordmark.png',      FALSE),
  ('LuckyVibe',   'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/luckyvibe/email-header.png',   'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/luckyvibe/wordmark.png',   FALSE),
  ('SpinsUp',     'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/spinsup/email-header.png',     'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/spinsup/wordmark.png',     TRUE),
  ('PlayMojo',    'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/playmojo/email-header.png',    'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/playmojo/wordmark.png',    FALSE),
  ('Lucky7even',  'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/lucky7even/email-header.png',  'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/lucky7even/wordmark.png',  FALSE),
  ('NovaDreams',  'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/novadreams/email-header.png',  'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/novadreams/wordmark.png',  TRUE),
  ('Rollero',     'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/rollero/email-header.png',     'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/rollero/wordmark.png',     TRUE)
ON CONFLICT (brand_name) DO UPDATE SET
  header_url       = EXCLUDED.header_url,
  wordmark_url     = EXCLUDED.wordmark_url,
  wordmark_dark_bg = EXCLUDED.wordmark_dark_bg,
  updated_at       = NOW();

-- 3. Sanity check
SELECT brand_name, header_url IS NOT NULL AS has_header, wordmark_url IS NOT NULL AS has_wordmark, wordmark_dark_bg
FROM brand_email_config
ORDER BY brand_name;
