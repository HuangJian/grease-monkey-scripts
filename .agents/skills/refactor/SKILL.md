---
name: refactor
description: Plan and execute a code refactor with behavior preservation, test reorganization, and pattern alignment
license: MIT
compatibility: opencode
---

## What I do

1. **Survey the target and adjacent code.** Read the module(s) to refactor and 1–2 nearby modules in the same project to learn the established layout (e.g., one existing feature module that already follows the target pattern). Do not invent a new structure when one exists.
2. **Identify behavior invariants.** Public exports, existing test names, observable side effects, debug logs that must survive, and any cross-module callers (grep for them). Refactors must not change behavior — these are the contract.
3. **Engage the user on scope.** Ask focused questions only where the answer changes the design: scope expansion into other modules, test reorganization strategy, state encapsulation tradeoffs, generic-helper vs inline-helper choices. Do not ask trivia.
4. **Write `<task>.plan.md`** in the project root with:
   - Goals and non-goals
   - Design decisions and rationale (what is being preserved and why)
   - File layout (new tree + renames + deletions)
   - Step-by-step implementation order
   - Test plan: which existing tests move, which new tests are added, which fixtures need path updates
   - Risks (closure patterns, race conditions, transitive test refs)
5. **Wait for explicit plan approval** before any code change.
6. **Implement following the plan order.** Move one module at a time; keep public exports until the barrel/index is in place; do not refactor unrelated code touched in passing.
7. **Reorganize tests 1:1 with the new source layout** when the source splits. Keep every existing test case passing; add focused unit tests for newly-extracted modules that previously had none.
8. **Run `bun run check`** (typecheck + lint + format + tests + build) before declaring done. On failure, fix and re-run; never amend a commit.
9. **Do not auto-commit.** Stage, present the diff summary, and let the user invoke the `commit` skill.

## When to use me

Use this skill when the user asks to refactor, restructure, modularize, split, encapsulate, or reorganize existing code without changing its behavior.

Do NOT use for:

- New features (use `plan` first, then implement directly)
- Behavior changes (rewrite with regression test, no plan needed beyond a single page)
- Trivial edits (rename, single-line fix, formatting)

## Anti-patterns to avoid

- Adding speculative abstractions (generic helpers, wrapper classes) beyond what the refactor actually needs.
- Touching unrelated modules' logic only if the helper is part of the refactor's stated goal.
- "Drive-by" cleanup of test names, dead code, or comments outside the refactor scope.
- Changing public type names when consumers still reference them; rename via index barrel if needed.
- Inlining or restructuring test assertions in passing — only move/relocate them.

## Validation gate

`bun run check` must pass. Test count should be ≥ pre-refactor (new module coverage often adds tests, never removes).
