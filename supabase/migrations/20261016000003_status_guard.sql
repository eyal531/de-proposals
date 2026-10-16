-- Only approvers/admins may move a proposal to "approved" (defense in depth on top of the server actions).
create or replace function public.guard_proposal_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and new.status = 'approved' and old.status is distinct from 'approved'
     and coalesce(public.current_role_name() in ('admin', 'approver'), false) = false then
    raise exception 'only approvers can approve proposals';
  end if;
  if auth.uid() is not null
     and new.status = 'accepted' and old.status is distinct from 'accepted' then
    raise exception 'acceptance is recorded by the client page only';
  end if;
  return new;
end $$;

create trigger proposals_status_guard before update on public.proposals
for each row execute function public.guard_proposal_status();
