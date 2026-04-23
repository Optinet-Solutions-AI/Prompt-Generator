-- ───────────────────────────────────────────────────────────────────
-- brand_email_config — static per-brand email header/footer config
-- ───────────────────────────────────────────────────────────────────
-- Stores the data that every email campaign for a given brand
-- reuses: logo URL, hero banner URL, website, unsubscribe URL,
-- footer attribution, legal text. All fields are nullable so we
-- can populate incrementally.
--
-- Apply this once via the Supabase SQL editor:
--   1. Supabase dashboard → SQL editor → New query
--   2. Paste this entire file, Run
--   3. Confirm 9 rows exist: SELECT brand_name FROM brand_email_config;
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brand_email_config (
  brand_name          TEXT PRIMARY KEY,
  logo_url            TEXT,
  banner_url          TEXT,
  website_url         TEXT,
  unsubscribe_url     TEXT,
  footer_attribution  TEXT,
  legal_text          TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow anon role to SELECT (read-only) — the modal fetches this
-- through the existing serverless API but a direct anon SELECT keeps
-- options open for future client-side reads.
ALTER TABLE brand_email_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brand_email_config_read ON brand_email_config;
CREATE POLICY brand_email_config_read ON brand_email_config
  FOR SELECT TO anon, authenticated USING (true);

-- ── Seed rows (URLs populated by scripts/upload-brand-assets.mjs) ──
INSERT INTO brand_email_config (brand_name, logo_url, banner_url, website_url) VALUES
  ('FortunePlay', 'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/fortuneplay/logo.svg', 'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/fortuneplay/banner.webp', 'https://www.fortuneplay.com/'),
  ('LuckyVibe',   'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/luckyvibe/logo.svg',   'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/luckyvibe/banner.webp',   'https://www.luckyvibe.com/'),
  ('Lucky7even',  'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/lucky7even/logo.svg', 'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/lucky7even/banner.webp', 'https://www.lucky7even.com/'),
  ('PlayMojo',    'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/playmojo/logo.svg',   'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/playmojo/banner.webp',   'https://www.playmojo.com/'),
  ('Roosterbet',  'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/roosterbet/logo.svg', 'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/roosterbet/banner.webp', 'https://www.rooster.bet/'),
  ('SpinJo',      'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/spinjo/logo.svg',     'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/spinjo/banner.webp',     'https://www.spinjo.com/'),
  ('SpinsUp',     'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/spinsup/logo.svg',    'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/spinsup/banner.jpg',     'https://www.spinsup.com/'),
  ('NovaDreams',  'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/novadreams/logo.svg', 'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/novadreams/banner.jpg',  'https://www.novadreams.com/'),
  ('Rollero',     'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/rollero/logo.svg',    'https://hggcgloqujgqvtswstlf.supabase.co/storage/v1/object/public/brand-assets/rollero/banner.webp',    'https://www.rollero.com/')
ON CONFLICT (brand_name) DO UPDATE SET
  logo_url    = EXCLUDED.logo_url,
  banner_url  = EXCLUDED.banner_url,
  website_url = EXCLUDED.website_url,
  updated_at  = NOW();
