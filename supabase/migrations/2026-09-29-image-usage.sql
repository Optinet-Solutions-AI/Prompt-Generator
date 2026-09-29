-- Image cost per person (US dollars): generate / edit / variation, ChatGPT vs Gemini.
-- One row per action. Tokens are what OpenAI/Google reported for that call;
-- cost_usd = tokens × the model's official rate (api/_image-models.ts).
-- cost_exact = false for OpenAI edits/variations, whose source-image input is
-- priced with the text-input rate (the image-input rate isn't in our table).
-- Only the backend (service-role key) reads/writes this via the /api routes.

create table if not exists image_usage (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references profiles(id) on delete set null,
  user_email          text,
  user_name           text,
  action              text not null check (action in ('generate', 'edit', 'variation')),
  provider            text not null check (provider in ('chatgpt', 'gemini')),
  model               text not null,
  images              integer not null default 1,
  brand               text,
  file_id             text,
  text_input_tokens   integer,
  image_input_tokens  integer,
  output_tokens       integer,
  cost_usd            numeric,
  cost_exact          boolean not null default true,
  created_at          timestamptz not null default now()
);
create index if not exists image_usage_user_created on image_usage (user_id, created_at desc);
alter table image_usage enable row level security;
