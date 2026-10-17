-- AI engine choice: economy (Claude Haiku) or quality (Claude Sonnet).
alter table public.app_settings add column if not exists ai_model text not null default 'economy' check (ai_model in ('economy', 'quality'));
