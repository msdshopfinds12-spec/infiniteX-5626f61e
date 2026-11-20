-- Non-destructive foundation for the Simula workflow worker.
-- Add indexes for foreign keys reported by the Performance Advisor.
create index if not exists workflow_logs_run_id_idx
  on public.workflow_logs (run_id);
create index if not exists workflow_logs_workflow_id_idx
  on public.workflow_logs (workflow_id);
create index if not exists workflow_step_runs_owner_id_idx
  on public.workflow_step_runs (owner_id);
create index if not exists workflow_step_runs_step_id_idx
  on public.workflow_step_runs (step_id);

-- Enable asynchronous HTTP support only; do not schedule any HTTP calls yet.
create extension if not exists pg_net;