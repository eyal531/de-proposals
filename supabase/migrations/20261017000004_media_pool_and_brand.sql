-- Media budgets per platform + pooled media-management fee percent, and branding settings.

alter table public.proposals
  add column if not exists media_budgets jsonb not null default '[]'::jsonb,
  add column if not exists media_fee_percent numeric not null default 20;

-- carry an existing single media budget over as one row
update public.proposals
set media_budgets = jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'platform', 'כללי', 'amount', media_budget))
where media_budget is not null and media_budgets = '[]'::jsonb;

alter table public.app_settings
  add column if not exists default_media_fee_percent numeric not null default 20,
  add column if not exists brand jsonb not null default '{}'::jsonb;

update public.app_settings set brand = jsonb_build_object(
  'logo_url', '/brand/logo.png',
  'logo_on_dark', 'invert',
  'accent', '#2340E8',
  'font', 'IBM Plex Sans Hebrew',
  'cover', 'dark',
  'phone', '072-392-3000',
  'email', 'info@digitaleffective.com',
  'website', 'digitaleffective.co.il'
) where id = 1 and brand = '{}'::jsonb;

-- public bucket for logos / brand images; only admins can write
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do update set public = true;

drop policy if exists "branding read" on storage.objects;
create policy "branding read" on storage.objects for select using (bucket_id = 'branding');

drop policy if exists "branding admin insert" on storage.objects;
create policy "branding admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.is_admin());

drop policy if exists "branding admin update" on storage.objects;
create policy "branding admin update" on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.is_admin());

drop policy if exists "branding admin delete" on storage.objects;
create policy "branding admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.is_admin());
