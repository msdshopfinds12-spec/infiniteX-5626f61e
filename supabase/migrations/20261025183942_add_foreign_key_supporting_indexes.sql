begin;

-- Restore index coverage for all seven foreign-key columns.
-- This is additive: no constraints, RLS policies, or data are changed.
create index if not exists user_projects_user_id_fkey_idx
  on public.user_projects (user_id);
create index if not exists user_projects_tool_id_fkey_idx
  on public.user_projects (tool_id);
create index if not exists usage_logs_user_id_fkey_idx
  on public.usage_logs (user_id);
create index if not exists usage_logs_tool_id_fkey_idx
  on public.usage_logs (tool_id);
create index if not exists subscriptions_user_id_fkey_idx
  on public.subscriptions (user_id);
create index if not exists payments_user_id_fkey_idx
  on public.payments (user_id);
create index if not exists payments_subscription_id_fkey_idx
  on public.payments (subscription_id);

commit;