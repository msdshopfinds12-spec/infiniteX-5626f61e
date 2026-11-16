# Security baseline

- JWTs verified against remote JWKS with issuer and audience checks.
- AI endpoint requires authentication.
- Input schema is strict and bounds prompt and output sizes.
- Provider keys are read only by the API process.
- Provider response bodies and prompts are not logged.
- Security headers and CORS allowlist are enabled.
- Production requires auth issuer, audience, and JWKS URL.
- Production AI base URL must use HTTPS.

## Known limitations
- No tenant database authorization exists.
- Rate limiting is process-local, not distributed.
- No persistent quota ledger or spend ceiling exists.
- Identity provider and claim mapping require review.
- CORS is not authentication.
- Add shared rate limiting and durable metering before multi-replica production.