# Frontend Quality and Accessibility Baseline

Status: implementation checklist; automated and manual checks are not yet executed.

## Verified stack

- React 18.3.x, TypeScript 5.6.x, Vite 5.4.x.
- Root npm lockfile exists.
- Root scripts: dev, lint (TypeScript project check), build, preview.
- No root test script is currently defined.

## Current UI state

The repository currently renders an engineering dashboard, not a complete conversational AI application. Dashboard metric values are placeholders and are explicitly marked as disconnected. Agent and log panels are sample data. Pipeline actions without backend handlers are disabled.

## Priority fixes

1. Maintain explicit disconnected/demo states; never label fixtures as live.
2. Add an accessible chat route as a separate feature slice after auth and API contracts are ready.
3. Adopt Lumen React only after a deterministic dependency and lockfile update can be generated and verified.
4. Keep current dashboard navigation and theme behavior intact during the chat implementation.
5. Add keyboard-operable mobile navigation and test at 320 CSS px and 200% zoom.
6. Verify text contrast at 4.5:1 for normal text and 3:1 for large text and meaningful UI boundaries.
7. Ensure visible focus, semantic landmarks, programmatic labels, reduced-motion support and accessible async status announcements.
8. Add browser tests and axe-core checks once a browser-test dependency and runner are configured.

## Required test evidence

- `npm ci`
- `npm run lint`
- `npm run build`
- Browser checks at 320, 375, 768 and 1280 CSS px.
- Keyboard-only navigation.
- Screen-reader smoke test.
- Automated axe scan.
- Authenticated API and conversation ownership tests before chat integration is marked complete.

## API CI blocker

The API package has its own manifest and Vitest scripts, but no nested lockfile was verified. Do not use `npm ci` in `apps/api` until a committed lockfile exists. Generate it in a controlled Node 22 environment, review the dependency diff, then add deterministic API CI.
