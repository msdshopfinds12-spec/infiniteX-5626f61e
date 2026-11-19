-- PHASE 6G.16 — disposable deny-by-default role boundary.
-- These NOLOGIN roles model untrusted runtime identities only. They are not
-- application identities and do not authenticate users or tenants.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='infinitex_api_runtime') THEN
    CREATE ROLE infinitex_api_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='infinitex_worker_runtime') THEN
    CREATE ROLE infinitex_worker_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='infinitex_browser_runtime') THEN
    CREATE ROLE infinitex_browser_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
END;
$$;

-- No PUBLIC execution or object access. Explicit per-role revokes make the
-- intended posture obvious and resilient to accidental grants in this harness.
REVOKE ALL ON SCHEMA infinitex_harness FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA infinitex_harness FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA infinitex_harness FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA infinitex_harness FROM PUBLIC;

REVOKE ALL ON SCHEMA infinitex_harness FROM infinitex_api_runtime, infinitex_worker_runtime, infinitex_browser_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA infinitex_harness FROM infinitex_api_runtime, infinitex_worker_runtime, infinitex_browser_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA infinitex_harness FROM infinitex_api_runtime, infinitex_worker_runtime, infinitex_browser_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA infinitex_harness FROM infinitex_api_runtime, infinitex_worker_runtime, infinitex_browser_runtime;

ALTER DEFAULT PRIVILEGES IN SCHEMA infinitex_harness REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA infinitex_harness REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA infinitex_harness REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'infinitex_api_runtime','infinitex_worker_runtime','infinitex_browser_runtime'
  ] LOOP
    IF has_schema_privilege(role_name,'infinitex_harness','USAGE')
       OR has_table_privilege(role_name,'infinitex_harness.tasks','SELECT')
       OR has_table_privilege(role_name,'infinitex_harness.tasks','INSERT')
       OR has_table_privilege(role_name,'infinitex_harness.tasks','UPDATE')
       OR has_table_privilege(role_name,'infinitex_harness.task_events','SELECT')
       OR has_table_privilege(role_name,'infinitex_harness.task_events','INSERT')
       OR has_function_privilege(role_name,
         'infinitex_harness.claim_with_approval(text,text,uuid,text,text,uuid,integer,text,text)',
         'EXECUTE')
       OR has_function_privilege(role_name,
         'infinitex_harness.cancel_task(text,text,bigint)','EXECUTE') THEN
      RAISE EXCEPTION 'deny-by-default privilege invariant failed for role %',role_name;
    END IF;
  END LOOP;
END;
$$;

SET ROLE infinitex_api_runtime;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM infinitex_harness.tasks;
    RAISE EXCEPTION 'API runtime unexpectedly read task rows';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM infinitex_harness.cancel_task('owner-15','cancel-task',2);
    RAISE EXCEPTION 'API runtime unexpectedly executed cancellation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SET ROLE infinitex_worker_runtime;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM infinitex_harness.approval_grants;
    RAISE EXCEPTION 'worker runtime unexpectedly read approval grants';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM infinitex_harness.claim_with_approval(
      'owner-15','lifecycle-task','44444444-4444-4444-8444-444444444444',
      repeat('a',64),'worker-15','33333333-3333-4333-8333-333333333333',
      30000,'role-probe',repeat('b',64));
    RAISE EXCEPTION 'worker runtime unexpectedly executed claim function';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SET ROLE infinitex_browser_runtime;
DO $$
BEGIN
  BEGIN
    INSERT INTO infinitex_harness.task_events
      (owner_subject,task_id,event_seq,task_version,fencing_token,event_type)
    VALUES ('owner-15','lifecycle-task',99,99,0,'approved');
    RAISE EXCEPTION 'browser runtime unexpectedly appended an event';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

\echo 'Phase 6G.16 deny-by-default role boundary assertions passed.'
