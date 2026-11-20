-- Restrict browser-visible API-key access to non-secret metadata.
-- The owner-scoped RLS policies remain the row-level authorization boundary.
-- The key_hash column is intentionally server-only and must never be selected by clients.

revoke select on table public.platform_api_keys from authenticated;
-- Column-level grants are independent of table-level grants; revoke the secret explicitly too.
revoke select (key_hash) on table public.platform_api_keys from authenticated;

grant select (
  id,
  owner_id,
  label,
  key_prefix,
  scopes,
  expires_at,
  last_used_at,
  revoked_at,
  created_at
)
on table public.platform_api_keys
to authenticated;

-- Keep the existing narrowly scoped revoke operation; do not grant table-wide UPDATE.
revoke update on table public.platform_api_keys from authenticated;
grant update (revoked_at) on table public.platform_api_keys to authenticated;
