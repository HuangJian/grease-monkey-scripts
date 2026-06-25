# Agents Guide

## Core Principles

1. **Ask, don't assume.** If something is unclear, ask before writing a single line. Never make silent assumptions about intent, architecture, or requirements. When running unattended, pick the most reasonable interpretation, proceed, and record the assumption rather than blocking.
2. **Match solution complexity to problem complexity.** Implement the simplest solution for simple problems; invest in better solutions for harder ones. Do not over-engineer or add flexibility that isn't needed yet.
3. **Smallest maintainable change.** Make the narrowest change that solves the actual request. Prefer existing patterns over new abstractions. Avoid broad refactors, speculative helpers, and clever architecture unless clearly justified.
4. **Don't touch unrelated code — but surface what you find.** Do not fix bad code or design smells discovered in passing. Instead, report them so they can be addressed as a separate issue.
5. **Flag uncertainty explicitly.** If unsure about something, see principle 1. If it makes sense, conduct a small, localized, low-risk experiment and bring the hypothesis and results to discuss. Confidence without certainty causes more damage than admitting a gap.
6. **Suggest better ways.** Always open to ideas on better approaches, especially ones with lasting impact over tactical changes. Don't hesitate to propose them.
7. **Assume the user is a principal engineer.** Correct the user when appropriate. Optimize for correctness, speed, judgment, and token efficiency.
8. **FAANG-level code quality.** Clear naming, strong types, simple control flow, minimal mutation, focused functions, pure functions/components where practical, no unnecessary abstraction.

## Context & Communication

### Context Discipline

Protect context aggressively.

- Answer the narrow question first. Inspect the smallest relevant file, symbol, route, component, diff, log, or test output.
- Prefer targeted searches, focused file sections, nearby call sites, capped logs, and scoped validation. Avoid running validation commands like `bun run check` unless necessary.
- Avoid dumping full files, full logs, unrelated directories, broad repo searches, large diffs, or generated output after the relevant code is found.
- Do not byte-cap instruction files, skill files, tool docs, or agent policy files. Read the whole relevant file unless it is unexpectedly huge.

### Communication

- Before editing, state the approach only for non-trivial tasks.
- During complex work, keep updates short: what was found, what changed, what risk remains.
- After work, summarize: what changed, files touched, validation run or why skipped, remaining risk. Keep summaries short; do not explain obvious edits.

## Command Output Discipline

Protect context usage. **Any command with unknown or potentially large output must be scoped and byte-capped.** Line caps alone are unsafe — a single line can be huge.

```bash
# Byte-cap with head/tail
COMMAND 2>&1 | head -c 4000
COMMAND 2>&1 | tail -c 4000

# Good scoped examples
rg -n -m 20 'functionName|ComponentName' src 2>&1 | head -c 200
bash -o pipefail -c 'bun run typecheck 2>&1 | tail -c 500'
bash -o pipefail -c 'bun test 2>&1 | tail -c 2000'
bash -o pipefail -c 'bun run build 2>&1 | tail -c 500'
rg -l "SEARCH_TERM" src 2>&1 | head -c 4000
```

Do not rely on `head -n`, `tail -n`, or `sed -n` as the only cap. If capped output is insufficient, narrow the command before increasing the cap.

Scope before printing content: list files first, search specific paths, count matches when useful. Avoid reading generated, binary, minified, database, or huge JSON/JSONL files unless required.

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

## Validation

Match validation to risk.

- Skip validation for low-risk changes and say so plainly.
- Use the cheapest useful check for risky changes.
- Do not run full test suites or full builds unless risk justifies it or the user asks.

Scoped validation commands:

| Command | Use for |
|---|---|
| `bun run typecheck` | Type errors |
| `bun run test` | Behavior changes (silent wrapper: failures re-run individually with output) |
| `bun run test:verbose` | Full raw test output |
| `bun run lint` | Style issues |
| `bun run check` | Comprehensive: typecheck + lint + format + tests + build |

## Task Workflows

Skills in `.agents/skills/` define focused methodologies. Key steps:

### Plan (`.agents/skills/plan`)

For non-trivial, ambiguous, or design-benefiting tasks. Engage the user to clarify requirements, constraints, edge cases. Analyze tradeoffs, propose a design. Output `<task>.plan.md` with goals, non-goals, design decisions, step-by-step plan, files to modify, open questions. Wait for approval before implementation. Do NOT use for trivial or well-understood tasks.

### Bug (`.agents/skills/bug`)

For fixing unexpected behavior.

1. **Diagnose** — Analyze the data flow (`fetch → parse → merge → filter → render`). Add `console.debug` with `[gm-<script>]` prefix at key points. Seek simpler logic for complex conditions. Verify external data with `curl` if needed.
2. **Write a regression test** — Minimal unit test that reproduces the bug. Should fail without the fix.
3. **Fix the source** — Test should pass.
4. **Build and verify** — `bun run check`. If analyzing debug output, remind user to install `.debug.js` variant (`.user.js` strips `console.debug`).

### Refactor (`.agents/skills/refactor`)

For restructuring code without changing behavior.

1. **Survey** the target and 1–2 nearby modules to learn the established layout. Do not invent new structure when one exists.
2. **Identify behavior invariants** — public exports, test names, observable side effects, cross-module callers.
3. **Engage on scope** — ask focused questions only where the answer changes the design.
4. **Write `<task>.plan.md`** — goals, non-goals, design rationale, file layout, implementation order, test plan, risks.
5. **Wait for approval** before any code change.
6. **Implement following plan order** — move one module at a time; keep public exports until barrel/index is in place.
7. **Reorganize tests 1:1** with new source layout. Keep every existing test passing; add focused tests for newly-extracted modules.
8. **Run `bun run check`**. Test count should be ≥ pre-refactor.
9. **Do not auto-commit.** Stage, present diff summary, let user invoke commit.

Anti-patterns: speculative abstractions, drive-by cleanup outside scope, renaming public types consumers still reference, inlining test assertions in passing.

### Commit (`.agents/skills/commit`)

See Git & Commit Rules below.

---

## Project: Tampermonkey Userscripts

This repository contains Tampermonkey userscripts. Treat each script as browser software: keep behavior testable, preserve site-native interactions, and validate generated installable output.

### Tooling

Use Bun for package management, tests, and builds. The project uses oxlint for linting and oxfmt for formatting. Preact is the UI framework for dashboard components.

```sh
bun install
bun run test          # silent wrapper: failures re-run individually with output
bun run test:verbose  # full raw output
bun run typecheck
bun run lint
bun run format
bun run build
bun run check         # typecheck + lint + format + tests + build
```

`bun run check` is the preferred final validation.

### Architecture & Layout

```text
src/
  runtime.ts          Shared Runtime type and browser/Tampermonkey adapter.
  utils.ts            Shared pure helpers (escapeHtml, URL utils, etc.).
  shared/             Cross-script shared components (tag-panel, author-labels).

test/
  runtime.ts          Shared test mock runtime (createDom, createRuntime).

src/<script-name>/
  index.user.ts       Userscript metadata and startup entry (keep thin).
  app/                Orchestration: lifecycle, group rendering, refresh, config.
  card/               Card chrome, tabs, render entry points.
  shell/              Overlay shell, mount, editor dialog.
  types.ts            Script-specific types.
  <feature>/          Feature modules (tnews, xit, weather, novels, ...).

test/<script-name>/
  *.test.ts           Bun tests, usually with jsdom for DOM behavior.

dist/
  <script-name>.user.js      Installable (console.debug stripped).
  <script-name>.debug.js     Debug variant (console.debug kept).
```

Key constraints:

- Keep `index.user.ts` thin: metadata block + call into testable modules.
- Keep direct access to `window`, `document`, `GM.*`, `GM_xmlhttpRequest`, `prompt`, and `location` inside the runtime adapter (`src/runtime.ts`). Business logic receives a `Runtime` object.
- Types used by a single script live in that script's `types.ts`. Shared types (`Runtime`, `RequestDetails`) live in `src/runtime.ts`.
- Simple scripts that don't need subdirectories can stay flat (`index.user.ts` + `index.ts` + `types.ts`).

### Build Rules

- Source files live under `src/`. Generated installable files live under `dist/`.
- Do not hand-edit generated files in `dist/`; rebuild them.
- Preserve the `// ==UserScript==` metadata at the top of generated output.
- Prefer readable, non-minified output while the project is actively migrating.
- Build strips `console.log`/`console.debug` from `.user.js`; keeps them in `.debug.js`. `console.warn`/`console.error` ship in both.

### Testing Rules

- Add or update tests for behavior changes before relying on manual browser checks.
- **Every bug fix must include a regression test.** Minimal unit test that reproduces the bug, fails without the fix, passes with it. Feature changes and refactors do not require tests unless behavior risk justifies it.
- Put pure logic in small functions and cover with unit tests.
- Use jsdom/happy-dom integration tests for DOM transformations.
- Mock Tampermonkey APIs through injected `Runtime` objects (see `test/runtime.ts`).
- Avoid live network requests in tests.
- When a bug depends on real website HTML, fetch the page for investigation, then reduce the relevant DOM shape into a small fixture. Do not paste entire pages into tests.

### DOM Safety

Userscripts run inside pages owned by other sites. Be conservative:

- **Preserve native site handlers.** Use `addEventListener` when augmenting native site elements; avoid overwriting `onclick`, `onmousedown`, or similar properties unless replacing behavior is explicitly intended. Within script-owned Preact trees, use Preact event props (`onClick`, `onInput`) instead.
- **Avoid duplicating real DOM nodes with the same `id`.**
- **Prefer lightweight references or read-only clones** (remove `id` attributes and script-owned controls) for repeated/secondary content.
- **Scope selectors to the intended container.** If code moves DOM nodes, parse from a stable snapshot or use `:scope` to avoid reading newly nested descendants.
- **Insert controls where they remain visible** in the relevant collapsed/expanded state.
- **Keep script-owned classes prefixed** or clearly namespaced, e.g. `gm-*`.
- **Reuse existing CSS classes** when creating/modifying HTML controls. Don't invent functionality-coupled class names that imply event behavior (e.g. `gm-sp-xit-error` for a styled error display — the class should describe the element, not the feature).

### Code Quality

#### Split Files

When a file exceeds ~300 lines or mixes unrelated concerns, turn it into a folder. Keep the original public API in an `index.ts` that re-exports from internal files. Extract each behavior cluster into its own file (e.g. `tokenize.ts`, `parse.ts`, `match.ts` instead of one `query.ts`). Internal helpers stay as private imports within the folder — only the public surface goes through `index.ts`.

#### No Circular Dependencies

#### Dependency Direction

- Orchestrator imports from feature modules, not the reverse. Feature modules do not import from the app entry point.
- Feature modules depend on helpers, not each other. Avoid cross-feature imports.
- Types and constants have no internal imports. They are leaf nodes.

#### Preact Patterns

All UI code uses Preact components and hooks. Avoid imperative DOM construction (`createContextualFragment`, `createElement`, `innerHTML`, `querySelector` after render) in favor of JSX, `useRef`, `useState`, and Preact event props.

- **JSX for DOM construction.** Use JSX templates instead of `createContextualFragment` or `createElement` chains. Only fall back to `insertAdjacentHTML` outside Preact trees (e.g. when augmenting native site DOM).
- **`useRef` for DOM refs.** Attach `ref={ref}` to elements instead of `querySelector` after render.
- **`useState` for mutable data.** Lists, fields, errors live in `useState`. Mutate via `setState`, never via `.push()` / `.splice()` on mutable arrays.
- **Preact event props.** `onClick`, `onInput`, `onKeyDown`, `onScroll` instead of `addEventListener`. Only use native `addEventListener` for document-level events (escape key, pointer tracking) or when augmenting native site handlers.
- **`useLayoutEffect` + `handleRef`** for exposing imperative APIs from components to factory callers. The ref is populated synchronously during `render()`, so the factory can read `handleRef.current!` immediately after render returns.
- **`useLayoutEffect` cleanup** for document-level event listeners or side effects. Return a cleanup function that removes the listener.
- **Event delegation.** Use `onClick` on parent elements with `e.target === e.currentTarget` for backdrop/overlay click handling.
- **`data-action` attributes for test selectors.** Add `data-action="add"`, `data-action="add-feed"` etc. on buttons so tests can find them without coupling to class names.
- **Keep class names stable.** Preserve existing CSS class names and structure — tests and styles depend on them.

#### CSS

- **Use primitive classes first.** Reach for `gm-sp-btn`, `gm-sp-btn-icon`, `gm-sp-btn-primary`, `gm-sp-input`, `gm-sp-error-box` from `primitives.css`. Only add a thin feature-specific class for extras (padding, layout) that the primitive doesn't set.
- **Primitives omit feature-specific values.** A primitive like `gm-sp-btn` sets border, background, and color but not padding or font-size. The feature class supplies those. Don't add speculative properties to primitives; keep them minimal.
- **Keep old classes when adopting primitives.** Add `gm-sp-btn` alongside an existing button class rather than replacing it. Remove the old class only when every property it provides is confirmed present in the primitive cascade.
- **Put new CSS in the right file.** Tokens → `tokens.css`. Primitives → `primitives.css`. Overlay shell and grid → `layout.css`. Card chrome, lists, tabs → `card.css`. Editor dialogs and forms → `editor.css`. Feature-specific → `weather.css`, `novels.css`, `reddit.css`, `tnews.css`, `xit.css`.
- **Use CSS variables from `tokens.css`** — no hardcoded colors.

#### Logging

- **`console.debug`** for ad-hoc troubleshooting. Stripped from `.user.js`, kept in `.debug.js`. To verify a fix in a real browser, install the `.debug.js` variant.
- **No `console.log`** in committed code. Same stripping rules apply. If something is worth saying in prod, use `console.warn` or `console.error`.
- **`console.warn` / `console.error`** ship in both variants. Reserve for actual user-visible problems (failed fetch, validation error), not step-by-step tracing.
- **Prefix debug output** with a stable tag like `[gm-dashboard]` (or `[gm-<script>]`) so it can be filtered in DevTools and a leftover line is easy to attribute.

#### Code Style

- **`addEventListener` over `onclick`/`onmousedown`** to preserve native site handlers.
- **`textContent` over `innerHTML`** when matching visible text.
- **`NodeList.forEach()` directly.** Only wrap with `Array.from` when chaining `.filter()`, `.map()`, `.sort()`, etc.
- **Use modern array methods.** `.every()` over `.reduce()` for boolean checks. Combine chained `.filter()` into one.
- **Replace deprecated HTML** (e.g., `<font>` → `<span style="...">`).
- **`insertAdjacentHTML` over `htmlToElement`.** Prefer `insertAdjacentHTML` for all DOM construction outside Preact trees. Query elements from the container after insertion via `querySelector`/`querySelectorAll` for event listeners and conditional modifications.
- **Loop DOM creation → `map().join()`.** Replace `for` + `createElement`/`htmlToElement` + `appendChild` loops with `entries.map(it => toHtml(it)).join('')` + `insertAdjacentHTML`, then wire event listeners via `querySelectorAll().forEach()`.
- **Extract long expressions into variables.** When an inline element exceeds ~100 chars, extract the dynamic content into a named variable before the template.

#### Anti-patterns

- **Duplicate switch dispatch** — replace with a registry; new cases touch one place.
- **Custom escape functions** — use `escapeHtml` from `src/utils.ts`.
- **Inline shared UI** — import existing shared components instead of duplicating.
- **Copy-paste CSS class names** — feature classes must match the feature name.
- **Object reference list ops** — compare by ID, not by reference.
- **Inconsistent storage keys** — use `{FEATURE}_KEY` (GM) + `{FEATURE}_LS_KEY` (localStorage).
- **Missing lifecycle methods** — all sources implement the full `Source` interface.
- **Inconsistent save callbacks** — always call `ctx.refresh?.()` before `ctx.close()`.
- **Uncleaned event listeners** — always remove listeners when the component unmounts.
- **Duplicate keyboard handling** — centralize in `shortcut.ts`.
- **Single-use abstractions** — prefer inline types and direct logic when a helper, wrapper, map, or named type is used only once.
- **Wrapper functions that simply call another function.**

### Site Investigation

Real site DOM often differs from simplified assumptions. If the user asks to inspect a live page, use the access path they provide. For V2EX in this environment, the known working proxy pattern is:

```sh
env all_proxy=http://127.0.0.1:7890 curl -L --max-time 30 <url>
```

Use fetched HTML only as evidence for implementation and tests. Do not make the test suite depend on live network availability.

---

## Git & Commit Rules

The user manages commits themselves. When asked to prepare a commit:

1. Run `bun run check` to ensure all checks pass first.
2. Stage intended files with `git add`, excluding `*.task.md` and `*.plan.md`.
3. Draft a commit message — concise, clear, ≤20 lines, describing what changed and why.
4. Show the commit message and wait for explicit user approval.
5. On hook rejection, fix the issue and create a new commit (never amend).
6. When asked for a PR, use `gh` and return the URL.

## Subagents

Use subagents only when they save context, save time, or materially improve output quality.

For research, review, and exploration tasks, avoid confirmation bias. Do not pass a preferred conclusion. Ask the subagent to investigate, compare, or verify, and require evidence, tradeoffs, uncertainty, and better alternatives.

Prefer subagents for:

- documentation/API checks
- web research
- non-trivial copywriting/content generation

Avoid subagents for trivial work the main agent can finish faster.

When using a subagent, assign a narrow task and require: findings, files inspected, files changed (if any), validation run (if any), risks or uncertainty. You own final judgment and integration.

## Handoff Checklist

Before finishing a task:

1. Run the most complete local validation command, usually `bun run check`.
2. Confirm generated userscripts were rebuilt when source changed.
3. Review `git status --short`.
4. Mention files changed and validation results.
5. Call out any behavior that was not verified in a real browser.

**Build Hash Verification**: Every completed development task must end with a fresh `bun run build` (or `bun run check`, which includes build) using the latest code. Report the resulting `Build hash: xxxxxxxx` output to the user so they can confirm the scripts pasted into Tampermonkey match the latest build.
