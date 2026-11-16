# API contract

## GET /api/health
Public process liveness endpoint. Returns service name and timestamp.

## GET /api/ready
Returns process readiness and dependency configuration indicators. A not_configured value is informational, not proof of dependency health.

## POST /api/v1/ai/generate
Requires Authorization: Bearer <JWT>.

Request:
{
  "prompt": "Explain the task",
  "maxOutputTokens": 512
}

Limits:
- prompt: 1 to 20,000 characters
- maxOutputTokens: 1 to 4,096 and additionally capped by AI_MAX_OUTPUT_TOKENS
- unknown JSON keys are rejected

Provider token usage is returned if available. This version does not persist usage.