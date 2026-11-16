# Subscription and Feature Entitlements

## Purpose

Provide ChatGPT-style capability tiers: Standard features remain usable by default, while optional advanced capabilities are enabled by a trusted server-side plan. This is an entitlement policy foundation, not a payment system.

## Illustrative tiers

| Plan | Intended access |
| --- | --- |
| Standard | Basic chat, projects, agents, memory, baseline security and privacy |
| Plus | Advanced chat, multi-agent workflows, extended workflow and memory capabilities |
| Pro | Plus capabilities, model routing, advanced evaluations and code-review capabilities |
| Enterprise | Pro capabilities, team workspaces, audit exports and policy administration |

The catalog describes intended product capabilities only. A capability is not operational merely because its entitlement exists. The underlying provider, adapter, UI, tests, quotas and operational controls must also be implemented and verified.

## Trust boundary

1. The backend authenticates the owner using the existing signed-token boundary.
2. A future trusted billing/subscription adapter validates provider-signed events and current subscription state.
3. The backend derives the effective plan from trusted server-side state.
4. The backend resolves an immutable entitlement snapshot and checks each capability at the service boundary.
5. Browser/mobile plan labels are presentation only. Client-supplied plan, tier, is_premium, or capability arrays must never grant access.
6. Missing, malformed, unknown or unverifiable plan state resolves to Standard (least privilege).

## Non-negotiable free baseline

Authentication, privacy boundaries, tenant isolation, security controls, audit integrity, approval requirements, data export/retention rights and safe failure behavior must not be paywalled. Paid tiers may raise usage ceilings or expose optional capabilities; they must never disable safeguards.

## Downgrade and billing behavior

- Subscription state changes must be idempotent and verified from the billing provider.
- A downgrade restricts new premium operations; it must not silently delete user data.
- Existing data remains governed by retention and export policy.
- Grace periods, refunds, cancellations, taxes and payment methods require a separately reviewed billing integration and clear product policy.
- Do not store card data. Use a compliant hosted checkout/provider when a billing integration is approved.

## Usage limits

Plan capabilities and usage quotas are separate controls. A future quota service must enforce server-side limits atomically, use a defined time window, handle concurrency, and record usage without logging secrets or message contents unnecessarily. Do not label a tier as unlimited unless infrastructure and provider contracts genuinely support it.

## Current implementation status

- Implemented: typed plan and capability catalog; immutable entitlement snapshot; backend capability guard; fail-closed Standard fallback; tests for baseline safeguards and tier access.
- Not implemented: billing provider, signed webhook verification, subscription persistence, usage metering, quota enforcement, customer portal, plan UI, team tenancy, production model routing or premium execution adapters.
- Not authorized: database migration, payment activation, public registration, deployment or production plan changes.

## Release gates

PLAN → BUILD → TEST → AUDIT → RELEASE. Before billing is enabled, add provider-specific webhook signature verification, replay protection, idempotent event handling, subscription state persistence, reconciliation jobs, quota concurrency tests, access-control tests, audit events and a security/privacy review. Obtain explicit approval before migrations, payment activation or deployment.
