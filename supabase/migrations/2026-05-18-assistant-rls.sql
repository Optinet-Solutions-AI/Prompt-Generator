-- AI Concept Assistant — security hardening.
--
-- Enables Row Level Security on the three assistant tables and adds policies
-- that restrict access to rows matching an `x-assistant-token` request header.
-- The frontend includes this header (the URL token = the test_user_id) on
-- every Supabase REST call. Backend writes use the service-role key which
-- bypasses RLS — no change needed there.

-- 1) assistant_llm_calls
alter table assistant_llm_calls enable row level security;

drop policy if exists "tester reads own llm calls" on assistant_llm_calls;
create policy "tester reads own llm calls"
  on assistant_llm_calls for select
  using (test_user_id = current_setting('request.headers', true)::json->>'x-assistant-token');

-- 2) assistant_image_gens
alter table assistant_image_gens enable row level security;

drop policy if exists "tester reads own image gens" on assistant_image_gens;
create policy "tester reads own image gens"
  on assistant_image_gens for select
  using (test_user_id = current_setting('request.headers', true)::json->>'x-assistant-token');

-- 3) assistant_prompts (read + insert + update — Save uses anon key from the
--    frontend, so it needs an INSERT policy too)
alter table assistant_prompts enable row level security;

drop policy if exists "tester reads own prompts" on assistant_prompts;
create policy "tester reads own prompts"
  on assistant_prompts for select
  using (test_user_id = current_setting('request.headers', true)::json->>'x-assistant-token');

drop policy if exists "tester inserts own prompts" on assistant_prompts;
create policy "tester inserts own prompts"
  on assistant_prompts for insert
  with check (test_user_id = current_setting('request.headers', true)::json->>'x-assistant-token');

drop policy if exists "tester updates own prompts" on assistant_prompts;
create policy "tester updates own prompts"
  on assistant_prompts for update
  using (test_user_id = current_setting('request.headers', true)::json->>'x-assistant-token');
