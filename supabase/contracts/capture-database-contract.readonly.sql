-- Phase 51.6L. One metadata-only SELECT; no DDL/DML, app rows, secrets, function bodies, or network calls.
WITH
scope_schemas AS (
 SELECT n.oid,n.nspname,pg_catalog.pg_get_userbyid(n.nspowner) AS owner
 FROM pg_catalog.pg_namespace n WHERE n.nspname IN ('public','private')
),
relations AS (
 SELECT c.oid,n.nspname AS schema_name,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
        pg_catalog.pg_get_userbyid(c.relowner) AS owner
 FROM pg_catalog.pg_class c JOIN scope_schemas n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','p','v','m','f','S')
),
table_contract AS (
 SELECT t.*,
 COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'ordinal',a.attnum,'name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),
  'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid),'notNull',a.attnotnull,
  'identity',a.attidentity,'generated',a.attgenerated,
  'collation',(SELECT co.collname FROM pg_catalog.pg_collation co WHERE co.oid=a.attcollation)
 ) ORDER BY a.attnum) FROM pg_catalog.pg_attribute a
 LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb) AS columns,
 COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'name',c.conname,'type',c.contype,'definition',pg_catalog.pg_get_constraintdef(c.oid,true),
  'validated',c.convalidated,'deferrable',c.condeferrable,'initiallyDeferred',c.condeferred
 ) ORDER BY c.conname) FROM pg_catalog.pg_constraint c WHERE c.conrelid=t.oid),'[]'::jsonb) AS constraints,
 COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'name',ic.relname,'definition',pg_catalog.pg_get_indexdef(i.indexrelid),'unique',i.indisunique,
  'primary',i.indisprimary,'valid',i.indisvalid,'ready',i.indisready
 ) ORDER BY ic.relname) FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid
 WHERE i.indrelid=t.oid),'[]'::jsonb) AS indexes,
 COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'name',p.policyname,'command',p.cmd,'roles',to_jsonb(p.roles),'using',p.qual,'check',p.with_check
 ) ORDER BY p.policyname) FROM pg_catalog.pg_policies p
 WHERE p.schemaname=t.schema_name AND p.tablename=t.relname),'[]'::jsonb) AS policies,
 COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE r.rolname END,
  'privilege',a.privilege_type,'grantable',a.is_grantable
 ) ORDER BY a.grantee,a.privilege_type,a.is_grantable) FROM pg_catalog.aclexplode(COALESCE(
  (SELECT c.relacl FROM pg_catalog.pg_class c WHERE c.oid=t.oid),
  pg_catalog.acldefault(CASE WHEN t.relkind='S' THEN 'S' ELSE 'r' END,
    (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid=t.oid))
 )) a LEFT JOIN pg_catalog.pg_roles r ON r.oid=a.grantee),'[]'::jsonb) AS grants,
 COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'column',a.attname,'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE r.rolname END,
  'privilege',x.privilege_type,'grantable',x.is_grantable
 ) ORDER BY a.attnum,x.grantee,x.privilege_type,x.is_grantable) FROM pg_catalog.pg_attribute a
 CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) x LEFT JOIN pg_catalog.pg_roles r ON r.oid=x.grantee
 WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL),'[]'::jsonb) AS column_grants,
 COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'name',tr.tgname,'enabled',tr.tgenabled,'definition',pg_catalog.pg_get_triggerdef(tr.oid,true)
 ) ORDER BY tr.tgname) FROM pg_catalog.pg_trigger tr
 WHERE tr.tgrelid=t.oid AND NOT tr.tgisinternal),'[]'::jsonb) AS triggers
 FROM relations t
),
function_contract AS (
 SELECT n.nspname AS schema_name,p.proname AS function_name,pg_catalog.pg_get_userbyid(p.proowner) AS owner,
  l.lanname AS language,pg_catalog.pg_get_function_result(p.oid) AS result_type,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,p.prosecdef AS security_definer,
  COALESCE((SELECT x FROM unnest(COALESCE(p.proconfig,ARRAY[]::text[])) x
    WHERE x LIKE 'search_path=%' ORDER BY x LIMIT 1),'') AS search_path,
  CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END AS volatility,
  CASE p.proparallel WHEN 's' THEN 'SAFE' WHEN 'r' THEN 'RESTRICTED' ELSE 'UNSAFE' END AS parallel_safety,
  p.proisstrict AS strict,p.proleakproof AS leakproof,
  COALESCE((SELECT jsonb_agg(role_name ORDER BY role_name) FROM (
   SELECT DISTINCT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE r.rolname END AS role_name
   FROM pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
   LEFT JOIN pg_catalog.pg_roles r ON r.oid=a.grantee WHERE a.privilege_type='EXECUTE'
  ) q WHERE role_name IS NOT NULL),'[]'::jsonb) AS execute_roles,
  pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) AS definition_md5
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 JOIN pg_catalog.pg_language l ON l.oid=p.prolang
 WHERE n.nspname IN ('public','private') AND p.prokind IN ('f','p')
),
schema_contract AS (
 SELECT s.nspname AS name,s.owner,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE r.rolname END,
   'privilege',a.privilege_type,'grantable',a.is_grantable
  ) ORDER BY a.grantee,a.privilege_type,a.is_grantable) FROM pg_catalog.aclexplode(COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
  LEFT JOIN pg_catalog.pg_roles r ON r.oid=a.grantee),'[]'::jsonb) AS grants
 FROM scope_schemas s JOIN pg_catalog.pg_namespace n ON n.oid=s.oid
),
extension_contract AS (
 SELECT e.extname AS name,n.nspname AS schema,e.extversion AS version
 FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
),
type_contract AS (
 SELECT n.nspname AS schema_name,t.typname AS name,
  CASE t.typtype WHEN 'e' THEN 'enum' WHEN 'd' THEN 'domain'
   WHEN 'r' THEN 'range' WHEN 'm' THEN 'multirange' ELSE t.typtype::text END AS kind,
  pg_catalog.format_type(t.oid,NULL) AS formatted_type,
  COALESCE((SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
   FROM pg_catalog.pg_enum e WHERE e.enumtypid=t.oid),'[]'::jsonb) AS enum_labels,
  CASE WHEN t.typtype='d' THEN pg_catalog.format_type(t.typbasetype,t.typtypmod) ELSE NULL END AS base_type,
  t.typnotnull AS not_null
 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
 WHERE n.nspname IN ('public','private') AND t.typtype IN ('e','d','r','m')
),
role_contract AS (
 SELECT rolname AS name,rolsuper AS superuser,rolinherit AS inherit,rolcreaterole AS create_role,
  rolcreatedb AS create_db,rolcanlogin AS can_login,rolreplication AS replication,
  rolbypassrls AS bypass_rls,rolconnlimit AS connection_limit
 FROM pg_catalog.pg_roles WHERE rolname !~ '^pg_'
),
membership_contract AS (
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'member',m.rolname,'role',g.rolname,'adminOption',a.admin_option,
  'inheritOption',a.inherit_option,'setOption',a.set_option
 ) ORDER BY m.rolname,g.rolname),'[]'::jsonb) AS memberships
 FROM pg_catalog.pg_auth_members a JOIN pg_catalog.pg_roles m ON m.oid=a.member JOIN pg_catalog.pg_roles g ON g.oid=a.roleid
 WHERE m.rolname !~ '^pg_' AND g.rolname !~ '^pg_'
)
SELECT jsonb_build_object(
 'schemaVersion',2,
 'capturedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'source','read-only PostgreSQL system catalogs; no application rows or function bodies',
 'projectRef','UNVERIFIED_MANUAL_ENTRY_REQUIRED','databaseName',current_database(),
 'postgresVersion',current_setting('server_version'),'databaseRole',current_user,
 'reviewStatus','PENDING_HUMAN_REVIEW',
 'review',jsonb_build_object('reviewedBy','','reviewedAt','','reviewEvidence',''),
 'capture',jsonb_build_object(
  'scopeSchemas',jsonb_build_array('public','private'),
  'metadataCategories',jsonb_build_array('schemas','tables','columns','constraints','indexes',
   'table_grants','column_grants','rls_policies','triggers','functions','extensions',
   'custom_types','role_attributes','role_memberships'),
  'applicationRowsRead',false,'functionBodiesRead',false,'secretsRead',false,'writeStatementsExecuted',false
 ),
 'schemas',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.name) FROM schema_contract s),'[]'::jsonb),
 'tables',COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'schema',schema_name,'name',relname,'relationKind',relkind::text,'owner',owner,
  'rlsEnabled',relrowsecurity,'forceRls',relforcerowsecurity,'columns',columns,
  'constraints',constraints,'indexes',indexes,'policies',policies,'grants',grants,
  'columnGrants',column_grants,'triggers',triggers
 ) ORDER BY schema_name,relname) FROM table_contract),'[]'::jsonb),
 'functions',COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'schema',schema_name,'name',function_name,'owner',owner,'language',language,
  'resultType',result_type,'identityArguments',identity_arguments,'securityDefiner',security_definer,
  'searchPath',search_path,'volatility',volatility,'parallelSafety',parallel_safety,
  'strict',strict,'leakproof',leakproof,'executeRoles',execute_roles,'definitionMd5',definition_md5
 ) ORDER BY schema_name,function_name,identity_arguments) FROM function_contract),'[]'::jsonb),
 'extensions',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.name) FROM extension_contract e),'[]'::jsonb),
 'types',COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.schema_name,t.name) FROM type_contract t),'[]'::jsonb),
 'roles',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name) FROM role_contract r),'[]'::jsonb),
 'roleMemberships',(SELECT memberships FROM membership_contract)
) AS database_contract_snapshot;
