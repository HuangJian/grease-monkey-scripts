# Agents Guide

## Operating Principles

- Keep it simple. Simple is better than complex.
- Assume the user is a principal engineer.
- Make the smallest maintainable change that solves the actual request.
- Prefer existing patterns over new abstractions.
- Avoid broad refactors, speculative helpers, and clever architecture unless clearly justified.
- Use judgment. Read enough surrounding code to understand the existing pattern, then avoid unnecessary exploration.
- Optimize for correctness, speed, judgment, and token efficiency.
- Correct the user when appropriate.
- Prefer FAANG-level code quality: clear naming, strong types, simple control flow, minimal mutation, focused functions, pure functions/components where practical, and no unnecessary abstraction.

## Context Discipline

- Protect context aggressively.
- Answer the narrow question first. Inspect the smallest relevant file, symbol, route, component, diff, log, or test output.
- Prefer targeted searches, focused file sections, nearby call sites, capped logs, and scoped validation. Avoid running validation commands like `bun run check` unless absolutely necessary. Use normal scoped commands like `rg`, with a byte cap when needed.
- Avoid dumping full files, full logs, unrelated directories, broad repo searches, large diffs, or generated output after the relevant code is found.
- Do not byte-cap instruction files, skill files, tool docs, or agent policy files. Read the whole relevant file unless it is unexpectedly huge.

## Command Output

Protect context usage. **Any command with unknown or potentially large output must be scoped and byte-capped.**

Byte-cap unknown or potentially large output. Line caps alone are unsafe because a single line can be huge.

```bash
COMMAND 2>&1 | head -c 4000
COMMAND 2>&1 | tail -c 4000
```

### Good Byte Capping Examples

```bash
rg -n -m 20 'functionName|ComponentName|routeName' src 2>&1 | head -c 200
bash -o pipefail -c 'bun run typecheck 2>&1 | tail -c 500'
bash -o pipefail -c 'bun test 2>&1 | tail -c 2000'
bash -o pipefail -c 'bun run build 2>&1 | tail -c 500'
rg -l "SEARCH_TERM" src 2>&1 | head -c 4000
```

Do not rely on `head -n`, `tail -n`, or `sed -n` as the only cap.

Scope before printing content: list files first, search specific paths, count matches when useful, and avoid reading generated, binary, minified, database, or huge JSON/JSONL files unless required.

Preserve exit codes when needed:

```bash
tmp="$(mktemp)"
COMMAND >"$tmp" 2>&1
status=$?
tail -c 5000 "$tmp"
rm -f "$tmp"
exit "$status"
```

Avoid unbounded `cat`, broad `rg`, `find`, `ls -R`, `git diff`, tests, builds, and `select *`.

If capped output is insufficient, narrow the command before increasing the cap.

## Validation

- Match validation to risk.
- Skip validation for low-risk changes and say so plainly.
- Use the cheapest useful check for risky changes.
- Do not run full test suites or full builds unless risk justifies it or the user asks.

When validation is needed, prefer scoped commands:

- `bun run typecheck` for type errors
- `bun run test` for behavior changes
- `bun run test:verbose` when you need full console output from all tests
- `bun run lint` for style issues
- `bun run check` only when comprehensive validation is required

## Code Changes

- Prefer direct edits with the available tools.
- Patch the narrow failing path first.
- Avoid unrelated cleanup.
- Do not add helpers, wrappers, maps, files, abstractions, or validation layers unless they clearly reduce complexity.

## Patterns to Avoid

- Avoid single-use abstractions.
- Prefer inline types and direct logic when a helper, wrapper, map, or named type is used only once.
- Avoid wrapper functions that simply call another function.

---

## Project: Tampermonkey Userscripts

This repository contains Tampermonkey userscripts. Agents should treat each
script as browser software: keep behavior testable, preserve site-native
interactions, and validate generated installable output.

### Goals

- Keep userscripts maintainable by moving reusable behavior into TypeScript.
- Add tests around business logic and DOM transformations before changing them.
- Generate installable `.user.js` files from source instead of hand-editing
  bundled output.

### Tooling

Use Bun for package management, tests, and builds. The project uses oxlint for linting and oxfmt for formatting.

Common commands:

```sh
bun install
bun run test
bun run test:verbose
bun run typecheck
bun run lint
bun run format
bun run build
bun run check
```

`bun run test` uses a two-phase wrapper: runs all tests silently, then re-runs
each failing test individually so only that test's console output is shown.
Use `bun run test:verbose` for full raw output.

`bun run check` is the preferred final validation. It should include type checking, linting, formatting, tests, and userscript generation.

### Recommended Layout

```text
src/
  runtime.ts        Shared Runtime type and browser/Tampermonkey adapter.
  utils.ts          Shared pure helpers (escapeHtml, URL utils, etc.).

test/
  runtime.ts        Shared test mock runtime (createDom, createRuntime).

src/<script-name>/
  index.user.ts     Userscript metadata and startup entry.
  app/              Orchestration: lifecycle, group rendering, refresh, config.
  card/             Card chrome, tabs, render entry points.
  shell/            Overlay shell, mount, editor dialog.
  types.ts          Script-specific types.
  <feature>/        Feature modules (tnews, xit, weather, novels, ...).

test/<script-name>/
  *.test.ts         Bun tests, usually with jsdom for DOM behavior.

dist/
  <script-name>.user.js
```

Keep `index.user.ts` thin. It should contain the userscript metadata block and
call into testable modules. Keep direct access to `window`, `document`, `GM.*`,
`GM_xmlhttpRequest`, `prompt`, and `location` inside the runtime adapter.

Types that are used by a single script live in that script's `types.ts`.
Shared types (`Runtime`, `RequestDetails`) live in `src/runtime.ts`.

Simple scripts that don't need subdirectories can stay flat:

```text
src/<script-name>/
  index.user.ts     Userscript metadata and startup entry.
  index.ts          Orchestration and testable behavior.
  types.ts          Script-specific types.
```

### Build Rules

- Source files live under `src/`.
- Generated installable files live under `dist/`.
- Do not hand-edit generated files in `dist/`; rebuild them.
- Preserve the `// ==UserScript==` metadata at the top of generated output.
- Prefer readable, non-minified output while the project is still actively
  migrating and debugging scripts.

### Testing Rules

- Add or update tests for behavior changes before relying on manual browser
  checks.
- **Every bug fix must include a regression test.** Write a minimal unit test
  that reproduces the bug scenario and verifies the fix. The test should fail
  without the fix and pass with it. Keep it focused on the exact broken behavior.
  Feature changes and refactors do not require tests unless behavior risk justifies it.
- Put pure logic in small functions and cover it with unit tests.
- Use jsdom integration tests for DOM transformations.
- Mock Tampermonkey APIs through injected runtime objects.
- Avoid live network requests in tests.
- When a bug depends on real website HTML, fetch the page for investigation,
  then reduce the relevant DOM shape into a small fixture.
- Keep fixtures focused on the behavior being tested; do not paste entire pages
  into tests.

### DOM Safety

Userscripts run inside pages owned by other sites. Be conservative:

- Preserve native site handlers. Use `addEventListener` when augmenting native
  site elements; avoid overwriting `onclick`, `onmousedown`, or similar properties
  unless replacing behavior is explicitly intended. Within script-owned Preact
  trees, use Preact event props (`onClick`, `onInput`) instead.
- Avoid duplicating real DOM nodes with the same `id`.
- When showing repeated or secondary content, prefer lightweight references or
  read-only clones that remove `id` attributes and script-owned controls.
- Scope selectors to the intended container. If code moves DOM nodes, parse from
  a stable snapshot or use `:scope` to avoid reading newly nested descendants.
- Insert controls where they remain visible in the relevant collapsed/expanded
  state.
- Keep script-owned classes prefixed or clearly namespaced, for example `gm-*`.
- When creating or modifying HTML controls, reuse existing CSS classes instead of duplicating styles. Don't invent functionality-coupled class names that imply event behavior (e.g. `gm-sp-xit-error` for a styled error display — the class should describe the element, not the feature).

### Site Investigation

Real site DOM often differs from simplified assumptions. If the user asks to
inspect a live page, use the access path they provide. For V2EX in this
environment, the known working proxy pattern is:

```sh
env all_proxy=http://127.0.0.1:7890 curl -L --max-time 30 <url>
```

Use fetched HTML only as evidence for implementation and tests. Do not make the
test suite depend on live network availability.

### Code Quality Guidelines

#### Split Files

- **When a file exceeds ~300 lines or mixes unrelated concerns, turn it into a
  folder.** Keep the original public API in an `index.ts` that re-exports from
  internal files. Extract each behavior cluster into its own file (e.g.
  `tokenize.ts`, `parse.ts`, `match.ts` instead of one `query.ts`). Internal
  helpers stay as private imports within the folder — only the public surface
  goes through `index.ts`.

#### No Circular Dependencies

#### Code Style

- **Preact event props within Preact trees.** Use `onClick`, `onInput`, `onKeyDown`,
  `onScroll` instead of `addEventListener`. Only use native `addEventListener` for
  document-level events (escape key, pointer tracking) or when augmenting native
  site handlers.
- **`addEventListener` over `onclick`/`onmousedown`** to preserve native site
  handlers.
- **`textContent` over `innerHTML`** when matching visible text.
- **`NodeList.forEach()` directly.** Only wrap with `Array.from` when chaining
  `.filter()`, `.map()`, `.sort()`, etc.
- **Use modern array methods.** `.every()` over `.reduce()` for boolean checks.
  Combine chained `.filter()` into one.
- **Replace deprecated HTML** (e.g., `<font>` → `<span style="...">`).
- **`insertAdjacentHTML` over `htmlToElement`.** Prefer `insertAdjacentHTML` for
  all DOM construction. Query elements from the container after insertion via
  `querySelector`/`querySelectorAll` for event listeners and conditional
  modifications.
- **Loop DOM creation → `map().join()`.** Replace `for` + `createElement`/`htmlToElement`
  - `appendChild` loops with `entries.map(it => toHtml(it)).join('')` +
    `insertAdjacentHTML`, then wire event listeners via `querySelectorAll().forEach()`.
- **Extract long expressions into variables.** When an inline element exceeds
  ~100 chars, extract the dynamic content into a named variable before the
  template: `const content = longExpression(); html = \`<span>${content}</span>\``.

#### CSS

- **Use primitive classes first.** Reach for `gm-sp-btn`, `gm-sp-btn-icon`, `gm-sp-btn-primary`, `gm-sp-input`, and `gm-sp-error-box` from `primitives.css` when creating controls. Only add a thin feature-specific class for extras (padding, layout) that the primitive doesn't set.
- **Primitives omit feature-specific values.** A primitive like `gm-sp-btn` sets border, background, and color but not padding or font-size. The feature class supplies those. Don't add speculative properties to primitives; keep them minimal.
- **Keep old classes when adopting primitives.** Add `gm-sp-btn` alongside an existing button class rather than replacing it. Remove the old class only when every property it provides is confirmed present in the primitive cascade.
- **Put new CSS in the right file.** Tokens → `tokens.css`. Primitives → `primitives.css`. Overlay shell and grid → `layout.css`. Card chrome, lists, tabs → `card.css`. Editor dialogs and forms → `editor.css`. Feature-specific → `weather.css`, `novels.css`, `reddit.css`, `tnews.css`, `xit.css`.

#### Logging

- **Use `console.debug` for ad-hoc troubleshooting.** Stripped from the prod
  build (`dist/<script>.user.js`), kept in the debug build
  (`dist/<script>.debug.js`). To verify a fix in a real browser, install the
  `.debug.js` variant — not the `.user.js` one.
- **Do not use `console.log` in committed code.** Same stripping rules apply
  (it's a general-purpose log, not a debug hook). If something is worth saying
  in prod, use `console.warn` or `console.error`.
- **`console.warn` / `console.error` ship in both variants.** Reserve them for
  actual user-visible problems (failed fetch, validation error, etc.), not for
  step-by-step tracing. They are not stripped.
- **Prefix debug output** with a stable tag like `[gm-dashboard]` (or
  `[gm-<script>]`) so it can be filtered in DevTools and so a leftover line is
  easy to attribute.

#### Preact-native Pattern

All UI code uses Preact components and hooks. Avoid imperative DOM construction
(`createContextualFragment`, `createElement`, `innerHTML`, `querySelector` after
render) in favor of JSX, `useRef`, `useState`, and Preact event props.

**Principles:**

- **JSX for DOM construction.** Use JSX templates instead of `createContextualFragment`
  or `createElement` chains. Only fall back to `insertAdjacentHTML` outside Preact
  trees (e.g. when augmenting native site DOM).
- **`useRef` for DOM refs.** Attach `ref={ref}` to elements instead of `querySelector`
  after render.
- **`useState` for mutable data.** Lists, fields, errors live in `useState`. Mutate
  via `setState`, never via `.push()` / `.splice()` on mutable arrays.
- **Preact event props.** `onClick`, `onInput`, `onKeyDown`, `onScroll` instead of
  `addEventListener`. Only use native `addEventListener` for document-level events
  (escape key, pointer tracking) or when augmenting native site handlers.
- **`useLayoutEffect` + `handleRef`** for exposing imperative APIs from components
  to factory callers. The ref is populated synchronously during `render()`, so the
  factory can read `handleRef.current!` immediately after render returns.
- **`useLayoutEffect` cleanup** for document-level event listeners or side effects.
  Return a cleanup function that removes the listener.
- **Event delegation.** Use `onClick` on parent elements with
  `e.target === e.currentTarget` for backdrop/overlay click handling.
- **`data-action` attributes for test selectors.** Add `data-action="add"`,
  `data-action="add-feed"` etc. on buttons so tests can find them without coupling
  to class names.
- **Keep class names stable.** Preserve existing CSS class names and structure —
  tests and styles depend on them.

#### Dependency Direction

- **Orchestrator imports from feature modules, not the reverse.** Feature
  modules do not import from the app entry point.
- **Feature modules depend on helpers, not each other.** Avoid cross-feature
  imports.
- **Types and constants have no internal imports.** They are leaf nodes.

---

## Git & Commit Rules

The user manages commits themselves. When asked to prepare a commit:

1. Run `bun run check` to ensure all checks pass first.
2. Stage intended files with `git add`, excluding `*.task.md` and `*.plan.md`.
3. Draft a commit message — concise, clear, ≤20 lines, describing what changed and why.
4. Show the commit message and wait for explicit user approval.
5. On hook rejection, fix the issue and create a new commit (never amend).
6. When asked for a PR, use `gh` and return the URL.

## Communication

Before editing, state the approach only for non-trivial tasks.

During complex work, keep updates short:

- what was found
- what changed
- what risk remains

After work, summarize:

- what changed
- files touched
- validation run, or why skipped
- remaining risk

Keep summaries short. Do not explain obvious edits.

## Subagents

Use subagents only when they save context, save time, or materially improve output quality.

For research, review, and exploration tasks, avoid confirmation bias. Do not pass a preferred conclusion. Ask the subagent to investigate, compare, or verify, and require evidence, tradeoffs, uncertainty, and better alternatives.

Prefer subagents for:

- documentation/API checks
- web research
- non-trivial copywriting/content generation

Avoid subagents for trivial work the main agent can finish faster.

When using a subagent, assign a narrow task and require:

- findings
- files inspected
- files changed, if any
- validation run, if any
- risks or uncertainty

You own final judgment and integration.

## Agent Handoff Checklist

Before finishing a task:

1. Run the most complete local validation command, usually `bun run check`.
2. Confirm generated userscripts were rebuilt when source changed.
3. Review `git status --short`.
4. Mention files changed and validation results.
5. Call out any behavior that was not verified in a real browser.

**Build Hash Verification**: Every completed development task must end with a
fresh `bun run build` (or `bun run check`, which includes build) using the
latest code. Report the resulting `Build hash: xxxxxxxx` output to the user
so they can confirm the scripts pasted into Tampermonkey match the latest build.
