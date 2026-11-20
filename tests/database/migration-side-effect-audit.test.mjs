import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSideEffectPolicy, scanSqlRisk, stripSqlComments } from '../../scripts/audit-migration-side-effects.mjs';

test('strips line and block comments while preserving SQL string and dollar-quoted bodies', () => {
  const sql = `-- cron.schedule('fake')
/* net.http_post('fake') */
select 'vault.fake';
do $body$ begin perform cron.schedule('real', '* * * * *', 'select 1'); end $body$;`;
  const cleaned = stripSqlComments(sql);
  assert.equal(cleaned.includes("cron.schedule('fake')"), false);
  assert.equal(cleaned.includes("net.http_post('fake')"), false);
  assert.equal(cleaned.includes("'vault.fake'"), true);
  assert.equal(cleaned.includes("cron.schedule('real'"), true);
});

test('detects scheduler, outbound HTTP, Vault, extension, and URL constructs', () => {
  const findings = scanSqlRisk(`
    create extension if not exists pg_cron;
    select cron.schedule('job', '* * * * *', 'select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets));');
    select 'https://example.supabase.co';
  `);
  assert.deepEqual(findings, {
    cron_schedule: 1,
    net_http_post: 1,
    vault_reference: 1,
    extension_ddl: 1,
    external_http_url: 1
  });
});

test('accepts exact reviewed version inventory independent of order', () => {
  const observed = { cron_schedule: ['v1', 'v2'], net_http_post: ['v2'] };
  const allowed = { cron_schedule: ['v2', 'v1'], net_http_post: ['v2'] };
  assert.deepEqual(evaluateSideEffectPolicy(observed, allowed), []);
});

test('rejects a new unreviewed side-effect migration and missing expected occurrence', () => {
  const observed = { cron_schedule: ['v1', 'v3'] };
  const allowed = { cron_schedule: ['v1'], vault_reference: ['v2'] };
  const errors = evaluateSideEffectPolicy(observed, allowed);
  assert.equal(errors.length, 2);
  assert.match(errors.join('\n'), /cron_schedule/);
  assert.match(errors.join('\n'), /vault_reference/);
});
