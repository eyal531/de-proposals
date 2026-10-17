-- Writing guidelines for AI-generated proposal content (agency voice).
alter table public.app_settings add column if not exists ai_guidelines text not null default '';
