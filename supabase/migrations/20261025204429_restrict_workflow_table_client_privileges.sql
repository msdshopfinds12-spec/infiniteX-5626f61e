REVOKE ALL PRIVILEGES ON TABLE
  public.workflows,
  public.workflow_steps,
  public.workflow_runs,
  public.workflow_step_runs,
  public.workflow_logs
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.workflows, public.workflow_steps
TO authenticated;

GRANT SELECT, INSERT
ON TABLE public.workflow_runs
TO authenticated;

GRANT SELECT
ON TABLE public.workflow_step_runs, public.workflow_logs
TO authenticated;