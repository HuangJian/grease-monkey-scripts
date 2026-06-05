---
name: commit
description: Stage, review, and commit changes following AGENTS.md Git & Commit Rules
license: MIT
compatibility: opencode
---

## What I do

1. Run `bun run check` to ensure all checks pass before committing
1. Find intended files with `git status`, excluding `*.task.md` and `*.plan.md`
1. Create a commit message with a concise, clear message describing what changed and why (≤20 lines)
1. Show the commit message and wait for explicit user approval before committing
1. On hook rejection, fix the issue and create a new commit (never amend)
1. When asked, create a PR using `gh` and return the URL

## When to use me

Use this skill when the user says "commit", "commit the changes", "create a PR", or otherwise asks to stage, commit, or push changes to git.
