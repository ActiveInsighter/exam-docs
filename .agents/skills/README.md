# Project skills

Installed on 2026-10-24. Canonical files live here; `.claude/skills/<name>`
contains relative symlinks to these same directories. Keep symlinks intact
when cloning or archiving the repository. Both entry points include all
upstream rules, references, and supporting files.

## Sources

| Skill | Source | Provenance |
| --- | --- | --- |
| vercel-react-best-practices | https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices | Vercel official |
| web-perf | https://github.com/cloudflare/skills/tree/main/skills/web-perf | Cloudflare official |
| shadcn | https://github.com/shadcn-ui/ui/tree/main/skills/shadcn | shadcn official |
| frontend-design | https://github.com/anthropics/skills/tree/main/skills/frontend-design | Anthropic official |
| fumadocs | https://fumadocs.dev/llms.txt | Locally authored adapter to official docs; not an official upstream skill |
| tailwindcss | https://tailwindcss.com/docs | Locally authored adapter to official docs; not an official upstream skill |
| cloudflare-workers-assets | This repository's Wrangler configuration, workflow and asset scripts; adapted from Anyworkflow-remote | Repository-local deployment contract, not Cloudflare-published |

Fumadocs and Tailwind Labs did not expose an installable general-purpose
official skill in their official repositories or the skill index when checked.
The Fumadocs repository's `radix-base-ui-sync` skill is for its own component
implementation workflow and is not a general site-maintenance skill. The
original official Fumadocs agent setup guide is included under
`fumadocs/references/official-agent-instructions.md`, sourced from
https://github.com/fuma-nama/fumadocs/blob/main/apps/docs/components/agent-instructions.md.
The local adapters direct agents to retrieve relevant official documentation
and check the project's pinned package versions before implementing changes.

## Updating

The official skills were installed with the `skills` CLI for `codex` and
`claude-code`; `skills-lock.json` preserves their upstream source paths and
computed content hashes. It intentionally lists only upstream-installed skills.
Update a selected official skill from the repository root, for example:

```bash
npx skills update vercel-react-best-practices --project --yes
```

Review the diff and keep all upstream supporting files together. Maintain the
three repository-local skills manually alongside changes to project versions,
official docs, and deployment configuration. Do not overwrite a local adapter
with an unrelated community skill under the same name.

`CLAUDE.md` imports `AGENTS.md`, which routes tasks to the relevant skills.
The repository's build and deployment policy still applies. Installing skills
does not install application packages, add components, or run a deployment.

## exam-docs only

`supabase-postgres-best-practices` is installed from the official
https://github.com/supabase/agent-skills/tree/main/skills/supabase-postgres-best-practices
source, including its reference files. It is not installed in fumadocs-study.
