-- ───────────────────────────────────────────────────────────────────
-- 002_brand_email_header.sql
-- Add composite-header + wordmark columns to brand_email_config
-- ───────────────────────────────────────────────────────────────────
-- `header_url` points to the Gemini-cleaned, per-brand-recoloured
-- composite PNG (texture + badge overflow) hosted in Supabase Storage.
-- `wordmark_url` points to the trimmed + optionally invert-white-text
-- wordmark PNG used in the centred row below the hero.
-- `wordmark_dark_bg` = TRUE when the wordmark colours are too light
-- to read on a white email body and must sit in a dark brand-coloured pill.
--
-- Apply once via Supabase SQL editor:
--   Dashboard → SQL editor → New query → paste this whole file → Run
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE brand_email_config
  ADD COLUMN IF NOT EXISTS header_url       TEXT,
  ADD COLUMN IF NOT EXISTS wordmark_url     TEXT,
  ADD COLUMN IF NOT EXISTS wordmark_dark_bg BOOLEAN NOT NULL DEFAULT FALSE;

-- URLs will be filled in by scripts/upload-brand-headers.mjs output.
