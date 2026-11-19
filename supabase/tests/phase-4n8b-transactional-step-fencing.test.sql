-- Run after applying the migration in a disposable local Supabase test database.
-- These assertions verify the exposed RPC contract and least-privilege grants.
do $test$
declare
  v_signature regprocedure := to_regprocedure(
    'public.simula_transition_workflow_step(uuid,uuid,uuid,integer,text,jsonb,jsonb,text)'
  );
begin
  if v_signature is null then
    raise exception 'missing transactional step transition RPC';
  end if;
  if not has_function_privilege('service_role', v_signature, 'EXECUTE') then
    raise exception 'service_role must be able to execute the transition RPC';
  end if;
  if has_function_privilege('anon', v_signature, 'EXECUTE') then
    raise exception 'anon must not be able to execute the transition RPC';
  end if;
  if has_function_privilege('authenticated', v_signature, 'EXECUTE') then
    raise exception 'authenticated must not be able to execute the transition RPC';
  end if;
end
$test$;
