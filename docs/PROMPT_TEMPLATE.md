# Cursor task prompt template

Use this at the beginning of a new feature or a new Cursor chat.

```text
Read @CLAUDE.md, @docs/STATUS.md, @docs/ARCHITECTURE.md, @docs/SECURITY_MODEL.md, and the task-relevant specification before editing.

Task:
[Describe one bounded outcome.]

Acceptance criteria:
- [Observable result]
- [Required failure behavior]
- [Required tests]

First respond with:
1. your understanding of the current state
2. the smallest implementation plan
3. files you expect to change
4. trust boundaries affected
5. verification commands

Then implement only this task. Follow existing architecture and semantic design tokens. Do not add dependencies without explaining why. Do not inspect or print secrets. Do not fabricate external success.

Run relevant narrow tests, then pnpm check. Fix failures caused by the change. Update docs/STATUS.md and docs/DECISIONS.md if necessary.

Finish with changed files, verification evidence, known limitations, and the safest next action.
```

