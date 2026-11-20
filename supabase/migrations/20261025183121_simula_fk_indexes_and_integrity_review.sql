begin;

-- Address the three confirmed unindexed foreign-key findings.
create index if not exists payments_subscription_id_idx
  on public.payments (subscription_id);

create index if not exists usage_logs_tool_id_idx
  on public.usage_logs (tool_id);

create index if not exists user_projects_tool_id_idx
  on public.user_projects (tool_id);

commit;