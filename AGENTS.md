# Agent instructions

This is the Lecture-to-Notes project (lecture PPTX -> structured notes -> Notion).

Before doing any work, read in this order:
1. `docs/HANDOFF.md` - decisions, research findings, architecture, phase plan, operating protocol. Takes precedence over the brief where they differ.
2. `docs/project-brief.md` - the original product/engineering brief (philosophy, scope, out-of-scope list).

Key rules: keep V1 small; deterministic extraction first; AI output goes through the canonical `NoteDocument`, never straight to Notion JSON; preserve source information, never invent content; respect the phase gates (no Notion work before the Phase 6 quality checkpoint); do not commit, push, or deploy unless asked.
