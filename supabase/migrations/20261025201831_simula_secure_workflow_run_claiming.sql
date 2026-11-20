
create or replace function public.simula_claim_workflow_runs(p_limit integer default 3)
returns table (
  id uuid,
  workflow_id uuid,
  owner_id uuid,
  input jsonb,
  attempt integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_owner uuid;
begin
  v_owner := auth.uid();
  if v_owner is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 3), 5));

  return query
  with picked as (
    select wr.id
    from public.workflow_runs as wr
    where wr.owner_id = v_owner
      and wr.status = 'queued'
    order by wr.created_at asc, wr.id asc
    for update skip locked
    limit v_limit
  ),
  claimed as (
    update public.workflow_runs as wr
    set status = 'running',
        started_at = now(),
        finished_at = null,
        error_message = null,
        attempt = wr.attempt + 1
    from picked
    where wr.id = picked.id
      and wr.owner_id = v_owner
      and wr.status = 'queued'
    returning wr.id, wr.workflow_id, wr.owner_id, wr.input, wr.attempt
  )
  select claimed.id, claimed.workflow_id, claimed.owner_id, claimed.input, claimed.attempt
  from claimed;
end;
$$;

revoke all on function public.simula_claim_workflow_runs(integer) from public;
revoke all on function public.simula_claim_workflow_runs(integer) from anon;
grant execute on function public.simula_claim_workflow_runs(integer) to authenticated;
