# Agent Guide

This repository contains Tampermonkey userscripts. Agents should treat each
script as browser software: keep behavior testable, preserve site-native
interactions, and validate generated installable output.

## Goals

- Keep userscripts maintainable by moving reusable behavior into TypeScript.
- Add tests around business logic and DOM transformations before changing them.
- Generate installable `.user.js` files from source instead of hand-editing
  bundled output.
- Migrate one script at a time unless the user explicitly asks for a wider
  change.

## Tooling

Use Bun for package management, tests, and builds. The project uses oxlint for linting and oxfmt for formatting.

Common commands:

```sh
bun install
bun test
bun run typecheck
bun run lint
bun run format
bun run build
bun run check
```

`bun run check` is the preferred final validation. It should include type checking, linting, formatting, tests, and userscript generation.

## Recommended Layout

For each migrated userscript, prefer this shape:

```text
src/<script-name>/
  index.user.ts   Userscript metadata and startup entry.
  runtime.ts      Browser/Tampermonkey adapter.
  types.ts        Shared types.
  app.ts          Testable behavior and DOM logic.

test/<script-name>/
  *.test.ts       Bun tests, usually with jsdom for DOM behavior.

dist/
  <script-name>.user.js
```

Keep `index.user.ts` thin. It should contain the userscript metadata block and
call into testable modules. Keep direct access to `window`, `document`, `GM.*`,
`GM_xmlhttpRequest`, `prompt`, and `location` inside a runtime adapter whenever
possible.

## Build Rules

- Source files live under `src/`.
- Generated installable files live under `dist/`.
- Do not hand-edit generated files in `dist/`; rebuild them.
- Preserve the `// ==UserScript==` metadata at the top of generated output.
- Prefer readable, non-minified output while the project is still actively
  migrating and debugging scripts.

## Testing Rules

- Add or update tests for behavior changes before relying on manual browser
  checks.
- Put pure logic in small functions and cover it with unit tests.
- Use jsdom integration tests for DOM transformations.
- Mock Tampermonkey APIs through injected runtime objects.
- Avoid live network requests in tests.
- When a bug depends on real website HTML, fetch the page for investigation,
  then reduce the relevant DOM shape into a small fixture.
- Keep fixtures focused on the behavior being tested; do not paste entire pages
  into tests.

## DOM Safety

Userscripts run inside pages owned by other sites. Be conservative:

- Preserve native site handlers. Use `addEventListener` when augmenting
  behavior; avoid overwriting `onclick`, `onmousedown`, or similar properties
  unless replacing behavior is explicitly intended.
- Avoid duplicating real DOM nodes with the same `id`.
- When showing repeated or secondary content, prefer lightweight references or
  read-only clones that remove `id` attributes and script-owned controls.
- Scope selectors to the intended container. If code moves DOM nodes, parse from
  a stable snapshot or use `:scope` to avoid reading newly nested descendants.
- Insert controls where they remain visible in the relevant collapsed/expanded
  state.
- Keep script-owned classes prefixed or clearly namespaced, for example `gm-*`.

## Site Investigation

Real site DOM often differs from simplified assumptions. If the user asks to
inspect a live page, use the access path they provide. For V2EX in this
environment, the known working proxy pattern is:

```sh
env all_proxy=http://127.0.0.1:7890 curl -L --max-time 30 <url>
```

Use fetched HTML only as evidence for implementation and tests. Do not make the
test suite depend on live network availability.

## Migration Strategy

When migrating an existing `.user.js` script:

1. Keep the original script unchanged unless the user asks to replace it.
2. Create a TypeScript source entry under `src/<script-name>/`.
3. Move environment access behind a runtime adapter.
4. Extract pure helpers and DOM behavior into testable modules.
5. Add unit tests for helpers and jsdom tests for DOM behavior.
6. Add or update the build script to generate `dist/<script-name>.user.js`.
7. Run `bun run check`.
8. Summarize generated output and any behavior that still needs live browser
   verification.

## Git & Commit Rules

- **Do Not Auto-Commit**: Under no circumstances should the agent perform a `git commit` automatically. Always stage changes (`git add`) and present the changes to the user for inspection and manual confirmation first. Only execute `git commit` after the user has explicitly requested/approved it.
- **Commit Message**: Must clearly describe the changes made and their rationale, concise and clear, preferably not exceeding 20 lines.

## Agent Handoff Checklist

Before finishing a task:

1. Run the most complete local validation command, usually `bun run check`.
2. Confirm generated userscripts were rebuilt when source changed.
3. Review `git status --short`.
4. Mention files changed and validation results.
5. Call out any behavior that was not verified in a real browser.
