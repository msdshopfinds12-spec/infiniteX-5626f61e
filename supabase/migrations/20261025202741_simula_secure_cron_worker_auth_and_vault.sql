-- Keep the internal cross-owner queue claim callable only by service_role.
create or replace function public.simula_claim_workflow_runs_internal(p_limit integer default 3)
returns table (
  id uuid,
  workflow_id uuid,
  owner_id uuid,
  input jsonb,
  attempt integer
)
language sql
set search_path = ''
as $function$
  select *
  from private.simula_claim_workflow_runs_internal(p_limit);
$function$;

revoke all on function public.simula_claim_workflow_runs_internal(integer) from public, anon, authenticated;
grant execute on function public.simula_claim_workflow_runs_internal(integer) to service_role;

-- Secret verification RPC: only the server-side service_role can call it.
create or replace function public.simula_verify_worker_secret(p_secret text)
returns boolean
language sql
security definer
set search_path = ''
as $function$
  select p_secret is not null
     and exists (
       select 1
       from vault.decrypted_secrets s
       where s.name = 'simula_worker_secret'
         and s.decrypted_secret = p_secret
     );
$function$;

revoke all on function public.simula_verify_worker_secret(text) from public, anon, authenticated;
grant execute on function public.simula_verify_worker_secret(text) to service_role;

-- Create secrets in Vault without returning their values to the SQL client.
-- Idempotent: preserve existing secrets on subsequent deployments.
do $block$
begin
  if not exists (select 1 from vault.secrets where name = 'simula_worker_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'simula_worker_secret',
      'Internal authentication token for the Simula scheduled workflow worker'
    );
  end if;

  if not exists (select 1 from vault.secrets where name = 'simula_project_url') then
    perform vault.create_secret(
      'https://vepacoemkhudamfaccah.supabase.co',
      'simula_project_url',
      'Supabase project URL used by the Simula scheduled workflow worker'
    );
  end if;
end;
$block$;