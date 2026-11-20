grant usage on schema private to authenticated;
revoke all on function private.simula_claim_workflow_runs(integer) from public, anon;
grant execute on function private.simula_claim_workflow_runs(integer) to authenticated, service_role;