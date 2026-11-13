# Company Brain API

All endpoints require the configured bearer token and a UUID X-Tenant-ID header.

## Store a memory
POST /api/v1/memory

JSON body: `{"content":"Project decision ...","source":"user","metadata":{"project":"infiniteGX.7"}}`

The response includes memory_id, content, source, metadata, and created_at.

## Search memories
GET /api/v1/memory/search?q=project%20decision&limit=10

Limit must be 1–100. Results include score and metadata. When no embedding provider is configured,
score is lexical overlap; it is not semantic similarity.
