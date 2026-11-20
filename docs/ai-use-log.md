# AI use log

The faculty requires a declaration of AI use. This file records, for each
piece of work, what an AI tool produced and what the author must review and
verify personally. One entry per module or planning step, newest last.

The tool used throughout is Claude Code (Anthropic), working in the author's
repository at the author's instruction. The author decides the scope, answers
the design questions, approves each module and is responsible for the result.

Work done with the same tool before this log was started (the move to
Appwrite, neighbour notices, free-item sharing; commits up to `375141b`) is
not itemised here. It is visible in the Git history and must be covered by
the declaration as well.

## 2026-11-20 to 2026-11-21: baseline and build plan

**Module:** planning (section 3, steps 1 to 3 of the build brief).

**What the AI generated or changed**

- Ran the baseline checks and reported them.
- Wrote `docs/build-plan.md`, `docs/requirements.md` and this file.
- Created the local Git tag `appwrite-migration` and the branch
  `feature/dormitory-portal`.
- No application code was changed.

**What the author must review and verify**

- That the decisions in section 3 of the build plan are the ones the author
  actually made, and the open decisions in section 4 are answered by the
  author, not left to the tool.
- That the states in `docs/requirements.md` are true. The "Built" entries
  repeat the brief's own list; the "Partly" notes are the tool's reading of
  the code and should be checked against the files named in them.
- That the scope is agreed with the supervisor before it is presented as the
  thesis system.
