-- Per-call LLM cost tracking for the AI Concept Assistant.
-- This table is the source of truth for the Cost Tracker LLM rows. Each
-- successful call from /api/assistant/{concepts,generate,refine} writes one
-- row via api/_assistant-log.ts (server-side, service-role key).

create table if not exists assistant_llm_calls (
  id                  uuid primary key default gen_random_uuid(),
  test_user_id        text not null,
  step                text not null,          -- 'concepts' | 'generate' | 'refine'
  provider            text not null,
  model               text not null,
  input_tokens        integer not null default 0,
  cached_input_tokens integer not null default 0,
  output_tokens       integer not null default 0,
  created_at          timestamptz default now()
);

create index if not exists idx_assistant_llm_calls_user
  on assistant_llm_calls(test_user_id, created_at desc);
