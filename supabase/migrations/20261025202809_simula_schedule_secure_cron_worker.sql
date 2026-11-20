-- Schedule the worker only after its authenticated Edge Function is deployed.
select cron.schedule(
  'simula-workflow-cron-worker-every-minute',
  '* * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'simula_project_url')
             || '/functions/v1/simula-workflow-cron-worker',
      body := jsonb_build_object('limit', 3, 'source', 'pg_cron'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-simula-worker-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'simula_worker_secret')
      ),
      timeout_milliseconds := 10000
    );
  $job$
);