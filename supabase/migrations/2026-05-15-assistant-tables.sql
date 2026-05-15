-- AI Concept Assistant — new tables
-- These are isolated from the main app's tables.

create table if not exists assistant_prompts (
  id                  uuid primary key default gen_random_uuid(),
  test_user_id        text not null,
  brand               text not null,
  task                text,
  description         text,
  provider            text,
  model               text,
  all_concepts        jsonb,
  picked_concept      jsonb,
  generated_fields    jsonb,
  image_drive_ids     text[],
  liked               boolean default false,
  input_tokens        integer,
  cached_input_tokens integer,
  output_tokens       integer,
  created_at          timestamptz default now()
);

create index if not exists idx_assistant_prompts_user
  on assistant_prompts(test_user_id, created_at desc);

create table if not exists assistant_image_gens (
  id              uuid primary key default gen_random_uuid(),
  prompt_id       uuid references assistant_prompts(id) on delete cascade,
  test_user_id    text not null,
  provider        text not null,
  model           text,
  size            text,
  quality         text,
  image_count     integer default 1,
  drive_file_id   text,
  cost_usd        numeric(10,6),
  created_at      timestamptz default now()
);

create index if not exists idx_assistant_image_gens_user
  on assistant_image_gens(test_user_id, created_at desc);
