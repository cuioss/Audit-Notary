# CLAUDE.md

@AGENTS.md

Claude Code specifics, in addition to the shared guidance above.

- The release runbook is the project skill `/release` (`.claude/skills/release/SKILL.md`). Use it for every
  release; do not improvise the steps.
- Plan before changing the module structure or adding a module: the order and the decisions are in
  `doc/specification/architecture-and-modules.adoc` and `doc/adr/`, and the open questions are at the end of each
  concept.
- Ask before adding any dependency and before touching `.github/project.yml` (see _Releases_ in `AGENTS.md`).
- Every change to the look or the interaction of the web app goes through the project skill `/audit-notary-design`
  (`.claude/skills/audit-notary-design/SKILL.md`): its rules, its checklist and its screenshot critique.

## Temporary Files

Use `.plan/temp/` for ALL temporary and generated files.

## Tool Usage

- Use proper tools (Edit, Read, Write) instead of shell commands (echo, cat).
- Verify claims about external products, standards and APIs against their documentation or source before writing
  them into the documentation.
