-- Video usage: record WHICH accounts were involved, not just the credits.
--   user_email / user_name  — who made the render (copied at render time, so the
--                             record survives even if their app account is deleted)
--   higgsfield_account      — which Higgsfield account paid (the team login's email)
-- Also: deleting an app account no longer deletes its usage history.

alter table video_usage add column if not exists user_email text;
alter table video_usage add column if not exists user_name text;
alter table video_usage add column if not exists higgsfield_account text;

alter table video_usage alter column user_id drop not null;
alter table video_usage drop constraint if exists video_usage_user_id_fkey;
alter table video_usage add constraint video_usage_user_id_fkey
  foreign key (user_id) references profiles(id) on delete set null;

-- Fill in the rows recorded so far.
update video_usage u set user_email = p.email, user_name = p.name
  from profiles p where u.user_id = p.id and u.user_email is null;
update video_usage set higgsfield_account = (select account_email from higgsfield_connection where id = 'team')
  where higgsfield_account is null;
