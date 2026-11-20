WITH table_inventory AS (
  SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'private')
    AND c.relkind IN ('r', 'p')
),
table_contract AS (
  SELECT
    t.schema_name,
    t.table_name,
    t.rls_enabled,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', p.policyname,
          'command', p.cmd,
          'roles', to_jsonb(p.roles),
          'using', p.qual,
          'check', p.with_check
        )
        ORDER BY p.policyname
      )
      FROM pg_catalog.pg_policies AS p
      WHERE p.schemaname = t.schema_name
        AND p.tablename = t.table_name
    ), '[]'::jsonb) AS policies
  FROM table_inventory AS t
),
function_contract AS (
  SELECT
    n.nspname AS schema_name,
    p.proname AS function_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    p.prosecdef AS security_definer,
    COALESCE((
      SELECT setting_value
      FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS setting_value
      WHERE setting_value LIKE 'search_path=%'
      LIMIT 1
    ), '') AS search_path,
    COALESCE((
      SELECT jsonb_agg(role_name ORDER BY role_name)
      FROM (
        SELECT DISTINCT
          CASE
            WHEN acl.grantee = 0 THEN 'PUBLIC'
            ELSE grantee_role.rolname
          END AS role_name
        FROM aclexplode(
          COALESCE(p.proacl, acldefault('f', p.proowner))
        ) AS acl
        LEFT JOIN pg_catalog.pg_roles AS grantee_role
          ON grantee_role.oid = acl.grantee
        WHERE acl.privilege_type = 'EXECUTE'
      ) AS execute_role_names
      WHERE role_name IS NOT NULL
    ), '[]'::jsonb) AS execute_roles
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'private')
    AND p.prokind IN ('f', 'p')
)
SELECT jsonb_build_object(
  'schemaVersion', 1,
  'reviewStatus', 'PENDING_REVIEW',
  'review', jsonb_build_object(
    'reviewedBy', '',
    'reviewedAt', '',
    'reviewEvidence', ''
  ),
  'capturedAt', to_char(
    clock_timestamp() AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ),
  'source', 'Read-only PostgreSQL catalog query; schemas public and private; no application rows or secret values',
  'tables', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'schema', schema_name,
        'name', table_name,
        'rlsEnabled', rls_enabled,
        'policies', policies
      )
      ORDER BY schema_name, table_name
    )
    FROM table_contract
  ), '[]'::jsonb),
  'functions', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'schema', schema_name,
        'name', function_name,
        'identityArguments', identity_arguments,
        'securityDefiner', security_definer,
        'searchPath', search_path,
        'executeRoles', execute_roles
      )
      ORDER BY schema_name, function_name, identity_arguments
    )
    FROM function_contract
  ), '[]'::jsonb)
) AS database_contract_snapshot;
