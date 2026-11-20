# Database contract snapshot

This directory holds sanitized, read-only catalog evidence. Do not commit production data, secrets, credentials, connection strings, or raw API-key values.

The CI verifier expects `database-contract.snapshot.json` with this top-level structure:

```json
{
  "schemaVersion": 1,
  "capturedAt": "2026-11-20T00:00:00Z",
  "source": "authorized-read-only-catalog-capture",
  "tables": [
    {
      "schema": "public",
      "name": "example_table",
      "rlsEnabled": true,
      "policies": []
    }
  ],
  "functions": [
    {
      "schema": "public",
      "name": "example_function",
      "identityArguments": "arg_type",
      "securityDefiner": false,
      "searchPath": null,
      "executeRoles": ["authenticated"]
    }
  ]
}
```

The example above is illustrative only and must not be committed as a claim about the live project. Replace it with a reviewed catalog export. Include all relevant policy definitions and function ACL details in the finalized contract format before relying on automated authorization assertions.

The checker currently validates snapshot structure and duplicate identities; it does not connect to Supabase or prove parity.
