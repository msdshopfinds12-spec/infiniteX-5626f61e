# Local PostgreSQL development service

This Compose profile starts PostgreSQL only. It does not start or deploy the API, and it is not a production configuration.

## Safe local setup

1. Copy `.env.example` to `.env` in this directory.
2. Replace the placeholder password with a unique local development password.
3. From this directory, run `docker compose --env-file .env config` to validate the rendered configuration.
4. Start only when ready with `docker compose --env-file .env up -d`.
5. Stop with `docker compose --env-file .env down`. This preserves the named data volume.
6. Removing data requires an explicit local decision; do not use `down -v` unless you intentionally want to delete the development database.

The host port is bound to `127.0.0.1` only. The container network is marked internal. No database port is bound to a public interface. The password is supplied locally and is not stored in Git.

This is a development convenience, not a hardened production database. Do not put real customer data or payment data in it.
