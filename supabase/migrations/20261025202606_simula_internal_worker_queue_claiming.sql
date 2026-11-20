-- Internal cross-owner queue claim for the trusted worker only.
-- Kept in private schema; callable only by service_role.
create or replace function private.simula_claim_workflow_runs_internal(p_limit integer default 3)
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
as $function$
declare
  v_limit integer;
begin
  v_limit := greatest(1, least(coalesce(p_limit, 3), 5));

  return query
  with picked as (
    select wr.id
    from public.workflow_runs as wr
    where wr.status = 'queued'
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
      and wr.status = 'queued'
    returning wr.id, wr.workflow_id, wr.owner_id, wr.input, wr.attempt
  )
  select claimed.id, claimed.workflow_id, claimed.owner_id, claimed.input, claimed.attempt
  from claimed;
end;
$function$;

revoke all on function private.simula_claim_workflow_runs_internal(integer) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.simula_claim_workflow_runs_internal(integer) to service_role;