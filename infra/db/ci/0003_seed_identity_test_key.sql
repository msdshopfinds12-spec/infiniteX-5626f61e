-- Fixed synthetic key for disposable GitHub Actions PostgreSQL only.
-- Never reuse this value in development, staging, production or any real environment.
INSERT INTO app_private.identity_signing_keys
  (key_id, secret, can_sign, can_verify, not_before, not_after)
VALUES
  ('ci-key-1',
   decode('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'hex'),
   true,
   true,
   now() - interval '1 minute',
   now() + interval '1 day')
ON CONFLICT (key_id) DO UPDATE
SET secret = EXCLUDED.secret,
    can_sign = EXCLUDED.can_sign,
    can_verify = EXCLUDED.can_verify,
    not_before = EXCLUDED.not_before,
    not_after = EXCLUDED.not_after,
    revoked_at = NULL;
