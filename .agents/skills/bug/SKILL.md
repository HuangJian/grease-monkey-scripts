---
name: bug
description: Methodology for investigating and fixing bugs with behavior preservation and test-driven validation
license: MIT
compatibility: opencode
---

## What I do

Investigate and fix bugs using a systematic approach.

## When to use me

Use when the user reports a bug or asks to fix unexpected behavior.

## Diagnosis

1. **Analyze the code** — Understand the data flow: `fetch → parse → merge → filter → render`
2. **Add console.debug** — Log intermediate state at key points, filter with `[gm-<script>]` prefix
3. **Seek simpler logic** — If the logic is complex (timezones, multiple conditions), ask if there's a simpler way

Verify external data with curl:

```bash
env all_proxy=http://127.0.0.1:7890 curl -s --max-time 15 '<url>'
```

Refer to unit tests from past bug fixes for common patterns.

## Fix Steps

1. **Write a unit test to reproduce** — Use the standard describe format:

   ```typescript
   describe('feature', () => {
     test('bugfix: bug description', () => {
       // Arrange
       // Act
       // Assert - should fail without fix
     })
   })
   ```

2. **Fix the source code** — Tests should pass

3. **Build and verify** — `bun run check`
   - If you need to analyze console.debug output, remind the user to install the `.debug.js` variant (keeps debug output)
   - `.user.js` strips console.debug

## Principles

- Try analyzing the code first to find logic bugs, then add logging, then consider environment changes or external data format changes
- Simpler is better
