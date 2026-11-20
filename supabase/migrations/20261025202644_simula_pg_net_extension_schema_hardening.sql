-- pg_net was just enabled and has no Simula worker cron callers yet.
-- Reinstall it into the dedicated extensions schema to address the advisor warning.
drop extension if exists pg_net;
create extension pg_net with schema extensions;