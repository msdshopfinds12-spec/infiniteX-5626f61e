-- Database-verifiable, transaction-bound identity assertions.
-- Apply only after 0001 and 0002, in disposable CI or through a separately approved migration.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_extension AS extension
      INNER JOIN pg_namespace AS namespace ON namespace.oid = extension.extnamespace
     WHERE extension.extname = 'pgcrypto'
       AND namespace.nspname = 'public'
  ) THEN
    RAISE EXCEPTION 'pgcrypto must be installed in schema public for this migration';
  END IF;
END
$$;

DO $
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'infinite_x_identity_verifier_owner') THEN
    CREATE ROLE infinite_x_identity_verifier_owner
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION BYPASSRLS;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS app_private AUTHORIZATION infinite_x_identity_verifier_owner;
ALTER SCHEMA app_private OWNER TO infinite_x_identity_verifier_owner;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO infinite_x_app_runtime_ci;

CREATE TABLE IF NOT EXISTS app_private.identity_signing_keys (
  key_id text PRIMARY KEY CHECK (key_id ~ '^[A-Za-z0-9._-]{1,64}$'),
  secret bytea NOT NULL CHECK (octet_length(secret) >= 32),
  can_sign boolean NOT NULL DEFAULT false,
  can_verify boolean NOT NULL DEFAULT true,
  not_before timestamptz NOT NULL DEFAULT now(),
  not_after timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (not_after IS NULL OR not_after > not_before)
);
ALTER TABLE app_private.identity_signing_keys OWNER TO infinite_x_identity_verifier_owner;
REVOKE ALL ON TABLE app_private.identity_signing_keys FROM PUBLIC;
REVOKE ALL ON TABLE app_private.identity_signing_keys FROM infinite_x_app_runtime_ci;

-- This non-login BYPASSRLS role is used only by the fixed verifier below to
-- confirm the signed subject still has an active membership and account.
GRANT SELECT ON TABLE public.workspace_memberships, public.app_users
  TO infinite_x_identity_verifier_owner;

CREATE OR REPLACE FUNCTION app_private.current_identity()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, app_private
AS $function$
DECLARE
  v_token text;
  v_payload_hex text;
  v_signature_hex text;
  v_payload text;
  v_claims jsonb;
  v_key record;
  v_expected bytea;
  v_provided bytea;
  v_difference integer := 0;
  v_now bigint;
  v_iat bigint;
  v_exp bigint;
  v_txid text;
BEGIN
  v_token := current_setting('app.identity_assertion', true);
  IF v_token IS NULL OR length(v_token) > 20000 THEN
    RETURN NULL;
  END IF;

  IF length(v_token) < 130 OR length(v_token) > 20000
     OR length(v_token) - length(replace(v_token, '.', '')) <> 1 THEN
    RETURN NULL;
  END IF;

  v_payload_hex := split_part(v_token, '.', 1);
  v_signature_hex := split_part(v_token, '.', 2);
  IF v_payload_hex !~ '^(?:[0-9a-f]{2})+$'
     OR v_signature_hex !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  v_payload := convert_from(decode(v_payload_hex, 'hex'), 'UTF8');
  v_claims := v_payload::jsonb;

  IF jsonb_typeof(v_claims) <> 'object'
     OR NOT (v_claims ?& ARRAY['v', 'iss', 'sub', 'workspace_id', 'aud', 'db_role', 'txid', 'iat', 'exp', 'jti', 'kid'])
     OR jsonb_typeof(v_claims->'v') <> 'number'
     OR jsonb_typeof(v_claims->'iat') <> 'number'
     OR jsonb_typeof(v_claims->'exp') <> 'number'
     OR jsonb_typeof(v_claims->'iss') <> 'string'
     OR jsonb_typeof(v_claims->'sub') <> 'string'
     OR jsonb_typeof(v_claims->'workspace_id') <> 'string'
     OR jsonb_typeof(v_claims->'aud') <> 'string'
     OR jsonb_typeof(v_claims->'db_role') <> 'string'
     OR jsonb_typeof(v_claims->'txid') <> 'string'
     OR jsonb_typeof(v_claims->'jti') <> 'string'
     OR jsonb_typeof(v_claims->'kid') <> 'string'
     OR v_claims->>'v' <> '1'
     OR v_claims->>'iss' <> 'https://identity.infinite-x.invalid'
     OR v_claims->>'aud' <> 'infinite-x-api'
     OR v_claims->>'db_role' <> session_user
     OR v_claims->>'kid' !~ '^[A-Za-z0-9._-]{1,64}$'
     OR v_claims->>'sub' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR v_claims->>'workspace_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR v_claims->>'jti' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR v_claims->>'txid' !~ '^[1-9][0-9]{0,19}$'
     OR v_claims->>'iat' !~ '^[0-9]{1,12}$'
     OR v_claims->>'exp' !~ '^[0-9]{1,12}$' THEN
    RETURN NULL;
  END IF;

  SELECT key_id, secret
    INTO v_key
    FROM app_private.identity_signing_keys
   WHERE key_id = v_claims->>'kid'
     AND can_verify
     AND revoked_at IS NULL
     AND not_before <= clock_timestamp()
     AND (not_after IS NULL OR not_after > clock_timestamp());

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Sign the exact ASCII hex payload emitted by Node.js. Compare all 32 MAC bytes.
  v_expected := public.hmac(convert_to(v_payload_hex, 'UTF8'), v_key.secret, 'sha256');
  v_provided := decode(v_signature_hex, 'hex');
  IF octet_length(v_expected) <> 32 OR octet_length(v_provided) <> 32 THEN
    RETURN NULL;
  END IF;
  FOR v_i IN 0..31 LOOP
    v_difference := v_difference | (get_byte(v_expected, v_i) # get_byte(v_provided, v_i));
  END LOOP;
  IF v_difference <> 0 THEN
    RETURN NULL;
  END IF;

  v_now := floor(extract(epoch FROM clock_timestamp()))::bigint;
  v_iat := (v_claims->>'iat')::bigint;
  v_exp := (v_claims->>'exp')::bigint;
  v_txid := txid_current()::text;

  IF v_claims->>'txid' <> v_txid
     OR v_iat > v_now + 5
     OR v_exp <= v_now
     OR v_exp <= v_iat
     OR v_exp - v_iat > 20 THEN
    RETURN NULL;
  END IF;

  -- The signed subject must still be an active account and active member of
  -- the signed workspace. The verifier owner's narrowly scoped BYPASSRLS grant
  -- prevents recursive policy evaluation while checking this invariant.
  IF NOT EXISTS (
    SELECT 1
      FROM public.workspace_memberships AS membership
      INNER JOIN public.app_users AS account ON account.id = membership.user_id
     WHERE membership.workspace_id = (v_claims->>'workspace_id')::uuid
       AND membership.user_id = (v_claims->>'sub')::uuid
       AND membership.status = 'active'
       AND account.status = 'active'
  ) THEN
    RETURN NULL;
  END IF;

  RETURN v_claims;
EXCEPTION
  WHEN OTHERS THEN
    -- Fail closed for malformed claims, bad encodings, casts and verifier errors.
    RETURN NULL;
END
$function$;

ALTER FUNCTION app_private.current_identity() OWNER TO infinite_x_identity_verifier_owner;
REVOKE ALL ON FUNCTION app_private.current_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.current_identity() TO infinite_x_app_runtime_ci;

-- Replace all GUC-only policies. An arbitrary caller-set user/workspace GUC is never trusted.
DROP POLICY IF EXISTS app_users_workspace_read ON public.app_users;
CREATE POLICY app_users_workspace_read ON public.app_users
  FOR SELECT
  USING (
    id = NULLIF(app_private.current_identity()->>'sub', '')::uuid
    OR EXISTS (
      SELECT 1
        FROM public.workspace_memberships AS membership
       WHERE membership.workspace_id =
             NULLIF(app_private.current_identity()->>'workspace_id', '')::uuid
         AND membership.user_id = app_users.id
         AND membership.status = 'active'
    )
  );

DROP POLICY IF EXISTS app_users_workspace_lock ON public.app_users;
CREATE POLICY app_users_workspace_lock ON public.app_users
  FOR UPDATE
  USING (
    id = NULLIF(app_private.current_identity()->>'sub', '')::uuid
    OR EXISTS (
      SELECT 1
        FROM public.workspace_memberships AS membership
       WHERE membership.workspace_id =
             NULLIF(app_private.current_identity()->>'workspace_id', '')::uuid
         AND membership.user_id = app_users.id
         AND membership.status = 'active'
    )
  )
  WITH CHECK (
    id = NULLIF(app_private.current_identity()->>'sub', '')::uuid
    OR EXISTS (
      SELECT 1
        FROM public.workspace_memberships AS membership
       WHERE membership.workspace_id =
             NULLIF(app_private.current_identity()->>'workspace_id', '')::uuid
         AND membership.user_id = app_users.id
         AND membership.status = 'active'
    )
  );

DROP POLICY IF EXISTS workspaces_current_workspace_read ON public.workspaces;
CREATE POLICY workspaces_current_workspace_read ON public.workspaces
  FOR SELECT
  USING (
    id = NULLIF(app_private.current_identity()->>'workspace_id', '')::uuid
  );

DROP POLICY IF EXISTS workspaces_current_workspace_lock ON public.workspaces;
CREATE POLICY workspaces_current_workspace_lock ON public.workspaces
  FOR UPDATE
  USING (
    id = NULLIF(app_private.current_identity()->>'workspace_id', '')::uuid
  )
  WITH CHECK (
    id = NULLIF(app_private.current_identity()->>'workspace_id', '')::uuid
  );

DROP POLICY IF EXISTS memberships_current_workspace_access ON public.workspace_memberships;
CREATE POLICY memberships_current_workspace_access ON public.workspace_memberships
  FOR ALL
  USING (
    workspace_id = NULLIF(app_private.current_identity()->>'workspace_id', '')::uuid
  )
  WITH CHECK (
    workspace_id = NULLIF(app_private.current_identity()->>'workspace_id', '')::uuid
  );

DROP POLICY IF EXISTS audit_events_current_actor_insert ON public.audit_events;
CREATE POLICY audit_events_current_actor_insert ON public.audit_events
  FOR INSERT
  WITH CHECK (
    workspace_id = NULLIF(app_private.current_identity()->>'workspace_id', '')::uuid
    AND actor_user_id = NULLIF(app_private.current_identity()->>'sub', '')::uuid
  );

COMMIT;
