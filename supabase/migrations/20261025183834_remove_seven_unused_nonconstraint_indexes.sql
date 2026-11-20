begin;

-- Verified before migration: these seven indexes exist and do not back
-- primary-key, unique, exclusion, or other constraints.
drop index if exists public.user_projects_owner_updated_idx;
drop index if exists public.usage_logs_owner_created_idx;
drop index if exists public.subscriptions_owner_created_idx;
drop index if exists public.payments_owner_created_idx;
drop index if exists public.payments_subscription_id_idx;
drop index if exists public.usage_logs_tool_id_idx;
drop index if exists public.user_projects_tool_id_idx;

commit;