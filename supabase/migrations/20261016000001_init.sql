-- Digital Effective proposals system: initial schema.
-- Access model: employees sign in (Supabase Auth). Clients never touch the database directly;
-- the public proposal page goes through server routes that use the service role key.

create extension if not exists pgcrypto;

-- ---------- enums ----------
create type public.user_role as enum ('admin', 'approver', 'sales', 'viewer');
create type public.pricing_model as enum (
  'fixed_monthly', 'one_time', 'hourly', 'hour_bank', 'media_percent',
  'hybrid_max', 'base_plus_percent', 'media_tiers', 'per_unit'
);
create type public.item_kind as enum ('required', 'optional', 'alternative');
create type public.proposal_status as enum (
  'draft', 'pending_approval', 'changes_requested', 'approved', 'sent', 'viewed',
  'negotiation', 'accepted', 'rejected', 'expired', 'cancelled'
);
create type public.address_form as enum ('plural', 'male', 'female');
create type public.approval_level as enum ('none', 'manager', 'ceo');
create type public.approval_decision as enum ('pending', 'approved', 'rejected', 'changes_requested');

-- ---------- settings (single row) ----------
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  company_name text not null default 'דיגיטל אפקטיב',
  vat_rate numeric not null default 18,
  rounding int not null default 1,
  default_validity_days int not null default 14,
  default_commitment_months int not null default 6,
  allowed_email_domains text[] not null default '{}',
  free_email_domains text[] not null default '{}',
  approval_rules jsonb not null default '{
    "discountFreeMaxPercent": 10,
    "discountManagerMaxPercent": 20,
    "contractValueCeoThreshold": 150000,
    "customItemLevel": "manager",
    "belowFloorLevel": "ceo",
    "hybridBelowCatalogLevel": "manager",
    "shortCommitmentLevel": "manager"
  }'::jsonb,
  default_terms text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1);

-- ---------- users ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  phone text,
  role public.user_role not null default 'sales',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- helpers used by RLS (security definer so they can read profiles regardless of RLS)
create or replace function public.current_role_name() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() = 'admin', false)
$$;

create or replace function public.sees_all_proposals() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() in ('admin', 'approver', 'viewer'), false)
$$;

-- New sign-ins get a profile only if their email domain is allowed. The very first user becomes admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  domains text[];
  first_user boolean;
begin
  select allowed_email_domains into domains from public.app_settings where id = 1;
  select not exists (select 1 from public.profiles) into first_user;
  if first_user or split_part(lower(new.email), '@', 2) = any (domains) then
    insert into public.profiles (id, email, full_name, role)
    values (
      new.id,
      lower(new.email),
      coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
      case when first_user then 'admin'::public.user_role else 'sales'::public.user_role end
    )
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- catalog ----------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null, -- internal name
  client_name text not null, -- name shown to the client
  description text not null default '',
  deliverables text[] not null default '{}',
  exclusions text[] not null default '{}',
  pricing_model public.pricing_model not null,
  params jsonb not null default '{}'::jsonb,
  floor_price numeric,
  min_commitment_months int,
  unit_label text,
  ai_profile text, -- which AI sections this service triggers (spec 9.3): 'media_google','media_social','seo','website',...
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create table public.service_price_history (
  id bigint generated always as identity primary key,
  service_id uuid not null references public.services (id) on delete cascade,
  pricing_model public.pricing_model not null,
  params jsonb not null,
  floor_price numeric,
  changed_by uuid references public.profiles (id),
  changed_at timestamptz not null default now()
);

create or replace function public.log_service_price() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.params is distinct from old.params or new.pricing_model is distinct from old.pricing_model
     or new.floor_price is distinct from old.floor_price then
    insert into public.service_price_history (service_id, pricing_model, params, floor_price, changed_by)
    values (new.id, new.pricing_model, new.params, new.floor_price, auth.uid());
  end if;
  return null;
end $$;

create trigger services_price_log after insert or update on public.services
for each row execute function public.log_service_price();

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger services_touch before update on public.services for each row execute function public.touch_updated_at();

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  discount_percent numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.package_services (
  package_id uuid not null references public.packages (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  sort int not null default 0,
  primary key (package_id, service_id)
);

create table public.content_blocks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  -- show automatically when one of these services is in the proposal (empty = manual only)
  service_ids uuid[] not null default '{}',
  locked boolean not null default false, -- e.g. legal terms that sales cannot edit
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- clients ----------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_number text,
  website text,
  industry text,
  logo_url text,
  airtable_id text unique,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete cascade,
  full_name text not null,
  role text,
  email text,
  phone text,
  address_form public.address_form not null default 'plural',
  airtable_id text unique,
  created_at timestamptz not null default now()
);

-- ---------- proposals ----------
create sequence public.proposal_number_seq;

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default (to_char(now(), 'YYYY') || '-' || lpad(nextval('public.proposal_number_seq')::text, 4, '0')),
  title text not null default 'הצעת מחיר',
  status public.proposal_status not null default 'draft',
  client_id uuid references public.clients (id) on delete set null,
  company_name text,
  recipients jsonb not null default '[]'::jsonb, -- [{name, role, email}]
  address_form public.address_form not null default 'plural',
  website text,
  call_notes text not null default '',
  intro text not null default '',
  sections jsonb not null default '[]'::jsonb, -- [{id,title,body,visible,source,status}]
  terms text not null default '',
  media_budget numeric,
  commitment_months int not null default 6,
  global_discount_percent numeric not null default 0,
  show_list_prices boolean not null default true,
  valid_until date,
  totals jsonb, -- last computed totals (for lists and reports)
  approval_level public.approval_level not null default 'none',
  approval_reasons jsonb not null default '[]'::jsonb,
  approved_at timestamptz,
  approved_by uuid references public.profiles (id),
  public_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  current_version int not null default 0,
  sent_at timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count int not null default 0,
  accepted_at timestamptz,
  signer jsonb, -- {name, role, signature, ip, user_agent}
  rejected_at timestamptz,
  rejection_reason text,
  internal_notes text not null default '',
  created_by uuid not null default auth.uid() references public.profiles (id),
  airtable_deal_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index proposals_status_idx on public.proposals (status);
create index proposals_created_by_idx on public.proposals (created_by);

create table public.proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  service_id uuid references public.services (id) on delete set null,
  name text not null,
  description text not null default '',
  deliverables text[] not null default '{}',
  pricing_model public.pricing_model not null,
  params jsonb not null default '{}'::jsonb,
  quantity numeric not null default 1,
  discount jsonb, -- {type: 'percent'|'amount', value}
  kind public.item_kind not null default 'required',
  group_key text,
  selected boolean not null default true,
  is_custom boolean not null default false,
  sort int not null default 0
);
create index proposal_items_proposal_idx on public.proposal_items (proposal_id);

create table public.proposal_versions (
  id bigint generated always as identity primary key,
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (proposal_id, version)
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  level public.approval_level not null,
  reasons jsonb not null default '[]'::jsonb,
  request_note text not null default '',
  requested_by uuid references public.profiles (id),
  decision public.approval_decision not null default 'pending',
  decision_note text not null default '',
  decided_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table public.proposal_events (
  id bigint generated always as identity primary key,
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  type text not null, -- created, saved, approval_requested, approved, sent, viewed, selection, question, accepted, rejected
  meta jsonb not null default '{}'::jsonb,
  actor uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index proposal_events_proposal_idx on public.proposal_events (proposal_id, created_at desc);

create trigger proposals_touch before update on public.proposals for each row execute function public.touch_updated_at();

-- ---------- row level security ----------
alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.service_price_history enable row level security;
alter table public.packages enable row level security;
alter table public.package_services enable row level security;
alter table public.content_blocks enable row level security;
alter table public.clients enable row level security;
alter table public.contacts enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_items enable row level security;
alter table public.proposal_versions enable row level security;
alter table public.approvals enable row level security;
alter table public.proposal_events enable row level security;

-- settings: everyone in the team reads, admin writes
create policy settings_read on public.app_settings for select to authenticated using (public.is_member());
create policy settings_write on public.app_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles: team sees team; admin manages roles; users can update their own name/phone
create policy profiles_read on public.profiles for select to authenticated using (public.is_member());
create policy profiles_admin on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- catalog: team reads, admin writes
create policy services_read on public.services for select to authenticated using (public.is_member());
create policy services_write on public.services for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy price_history_read on public.service_price_history for select to authenticated using (public.is_member());
create policy packages_read on public.packages for select to authenticated using (public.is_member());
create policy packages_write on public.packages for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy package_services_read on public.package_services for select to authenticated using (public.is_member());
create policy package_services_write on public.package_services for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy blocks_read on public.content_blocks for select to authenticated using (public.is_member());
create policy blocks_write on public.content_blocks for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- clients & contacts: shared across the team
create policy clients_rw on public.clients for all to authenticated using (public.is_member()) with check (public.is_member());
create policy contacts_rw on public.contacts for all to authenticated using (public.is_member()) with check (public.is_member());

-- proposals: sales see their own, admin/approver/viewer see all
create policy proposals_read on public.proposals for select to authenticated
  using (public.is_member() and (created_by = auth.uid() or public.sees_all_proposals()));
create policy proposals_insert on public.proposals for insert to authenticated
  with check (public.is_member() and created_by = auth.uid() and public.current_role_name() <> 'viewer');
create policy proposals_update on public.proposals for update to authenticated
  using (public.is_member() and (created_by = auth.uid() or public.current_role_name() in ('admin', 'approver')))
  with check (public.is_member());
create policy proposals_delete on public.proposals for delete to authenticated
  using (status = 'draft' and (created_by = auth.uid() or public.is_admin()));

create or replace function public.can_edit_proposal(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.proposals p
    where p.id = pid and public.is_member()
      and (p.created_by = auth.uid() or public.current_role_name() in ('admin', 'approver'))
  )
$$;
create or replace function public.can_read_proposal(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.proposals p
    where p.id = pid and public.is_member() and (p.created_by = auth.uid() or public.sees_all_proposals())
  )
$$;

create policy items_read on public.proposal_items for select to authenticated using (public.can_read_proposal(proposal_id));
create policy items_write on public.proposal_items for all to authenticated
  using (public.can_edit_proposal(proposal_id)) with check (public.can_edit_proposal(proposal_id));
create policy versions_read on public.proposal_versions for select to authenticated using (public.can_read_proposal(proposal_id));
create policy versions_insert on public.proposal_versions for insert to authenticated with check (public.can_edit_proposal(proposal_id));
create policy approvals_read on public.approvals for select to authenticated using (public.can_read_proposal(proposal_id));
create policy approvals_insert on public.approvals for insert to authenticated with check (public.can_edit_proposal(proposal_id));
create policy approvals_decide on public.approvals for update to authenticated
  using (public.current_role_name() in ('admin', 'approver')) with check (public.current_role_name() in ('admin', 'approver'));
create policy events_read on public.proposal_events for select to authenticated using (public.can_read_proposal(proposal_id));
create policy events_insert on public.proposal_events for insert to authenticated with check (public.can_read_proposal(proposal_id));
