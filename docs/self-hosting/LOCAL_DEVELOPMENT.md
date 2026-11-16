# InfiniteX Local Development and Android-First Workflow

Goal: author and review from Android while running the backend on compatible Linux/Docker infrastructure.

## Android role
Use Android for GitHub review, editing source and Markdown, reviewing diffs and CI output, and approved Git operations. Do not assume Android can run standard Docker Engine or production PostgreSQL. Android terminal environments have compatibility and isolation limits; validate before choosing a local runtime.

## Runtime role
A compatible Linux computer or independently controlled Linux server can run Docker Engine, Compose, API and worker containers, PostgreSQL on a private network, and Caddy only for an approved hosted profile.

## Development safety
Use synthetic data. Bind development ports to loopback. Do not expose PostgreSQL publicly. Use local placeholder credentials. Never commit env files, keys, provider credentials, session secrets or database dumps. Never test with production customer data.

## Portability
Keep configuration environment-driven, persist state outside container images, define health checks and document backup/restore. Rebuild from versioned source plus locally supplied secrets.

## Before public hosting
Approve host ownership, firewall, domain, TLS, updates, monitoring, encrypted backups, restore testing, incident response and data-protection obligations. This document does not configure a public server.
