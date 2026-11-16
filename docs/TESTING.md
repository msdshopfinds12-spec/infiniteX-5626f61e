# Testing strategy

Run in apps/api:
- npm install
- npm run typecheck
- npm test
- npm run build

Required before production:
- valid, expired, wrong-issuer, wrong-audience, and missing JWT tests
- CORS allowlist and malformed/oversized body tests
- rate-limit boundary and reset tests
- provider timeout, 4xx, 5xx, malformed JSON, and success tests
- secret redaction tests
- end-to-end tests against a disposable identity provider
- multi-instance rate-limit tests after shared storage is added

CI currently runs typecheck, unit tests, and build. It does not deploy.