-- "Auto-fill from website" (Video tab → Custom business): keep what the
-- research found with each saved business.
--   website  — the site it was researched from
--   presets  — video formats written for THIS business (JSON array)
--   research — notes: summary, services, selling points, tone, audience,
--              social presence, compliance cautions, sources (JSON)
alter table custom_businesses add column if not exists website  text;
alter table custom_businesses add column if not exists presets  jsonb;
alter table custom_businesses add column if not exists research jsonb;
