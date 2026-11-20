DO $assert$
DECLARE v_tables integer; v_columns integer; v_constraints integer; v_indexes integer; v_policies integer; v_rls_disabled integer; v_scheduled_for integer;
BEGIN
  SELECT count(*) INTO v_tables FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('workflows','workflow_steps','workflow_runs','workflow_step_runs','workflow_logs') AND c.relkind='r';
  IF v_tables <> 5 THEN RAISE EXCEPTION 'phase_52_1d_expected_5_workflow_tables_found_%',v_tables; END IF;
  SELECT count(*) INTO v_columns FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('workflows','workflow_steps','workflow_runs','workflow_step_runs','workflow_logs') AND a.attnum>0 AND NOT a.attisdropped;
  IF v_columns <> 51 THEN RAISE EXCEPTION 'phase_52_1d_expected_51_columns_found_%',v_columns; END IF;
  SELECT count(*) INTO v_constraints FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class c ON c.oid=con.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('workflows','workflow_steps','workflow_runs','workflow_step_runs','workflow_logs');
  IF v_constraints <> 27 THEN RAISE EXCEPTION 'phase_52_1d_expected_27_constraints_found_%',v_constraints; END IF;
  SELECT count(*) INTO v_indexes FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('workflows','workflow_steps','workflow_runs','workflow_step_runs','workflow_logs');
  IF v_indexes <> 14 THEN RAISE EXCEPTION 'phase_52_1d_expected_14_baseline_indexes_found_%',v_indexes; END IF;
  SELECT count(*) INTO v_policies FROM pg_catalog.pg_policies
  WHERE schemaname='public' AND tablename IN ('workflows','workflow_steps','workflow_runs','workflow_step_runs','workflow_logs');
  IF v_policies <> 6 THEN RAISE EXCEPTION 'phase_52_1d_expected_6_policies_found_%',v_policies; END IF;
  SELECT count(*) INTO v_rls_disabled FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('workflows','workflow_steps','workflow_runs','workflow_step_runs','workflow_logs') AND NOT c.relrowsecurity;
  IF v_rls_disabled <> 0 THEN RAISE EXCEPTION 'phase_52_1d_rls_disabled_on_%_tables',v_rls_disabled; END IF;
  SELECT count(*) INTO v_scheduled_for FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='workflow_runs' AND a.attname='scheduled_for' AND a.attnum>0 AND NOT a.attisdropped;
  IF v_scheduled_for <> 0 THEN RAISE EXCEPTION 'phase_52_1d_baseline_must_precede_scheduled_for_migration'; END IF;
END
$assert$;
