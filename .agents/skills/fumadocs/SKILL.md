---
name: fumadocs
description: Maintain this existing Fumadocs Next.js documentation site, including MDX content, navigation, source loaders, search, themes, components, and static exports, using official Fumadocs documentation.
---

# Fumadocs

This is a repository-local skill based on official Fumadocs documentation, not
an upstream-published general Fumadocs skill. The official repository currently
ships a narrowly scoped Radix/Base UI synchronization skill, not a general
site-maintenance skill. The original official agent setup guide is preserved
in [references/official-agent-instructions.md](references/official-agent-instructions.md).

## Start with this existing project

1. Read `AGENTS.md` and `package.json`. This project pins Fumadocs Core/UI
   16.17.5 and MDX 15.4.7; verify the installed version before using an API.
2. Inspect `source.config.ts`, `lib/source.ts`, relevant `app/` routes, and
   affected content/components. Preserve the existing source and search pipeline.
3. Fetch https://fumadocs.dev/llms.txt to find the relevant current docs page.
   Append `.mdx` to a page URL for Markdown. Compare current documentation with
   the pinned package's exports and declarations before editing.
4. Do not re-scaffold this existing site or run an initialization CLI as a
   routine maintenance step. Do not upgrade dependencies just to match examples.

## Content and UI

- Preserve frontmatter, slugs, relative links, `meta.json` ordering, Chinese
  text/Unicode paths, math, Mermaid, and custom MDX components.
- Inspect existing MDX component registration before introducing new components.
  Keep React server/client boundaries and serialized props valid.
- `.source/` is generated: change source configuration/content, not generated
  files. Use the existing generation commands when verification requires them.
- `fumadocs-ui` resolves to `@fumadocs/base-ui` in this repository. Check its
  installed exports and primitive APIs; do not assume Radix trigger semantics.
- Reuse `lib/layout.shared.tsx`, existing layouts, theme tokens, and
  `app/global.css`. Preserve Fumadocs CSS import order and Tailwind source scanning.
- Read `tailwindcss` for styling, `shadcn` for direct shadcn component work,
  `vercel-react-best-practices` for React performance, and `web-perf` for audits.

## Static output and verification

Keep static routes and generated parameters compatible with the existing
sharded static export, search index, and RSC rewrites. Read
`cloudflare-workers-assets` for export/deployment changes.

Run targeted tests and type checks appropriate to the change. Follow the root
build policy: full builds run in GitHub Actions by default, with `deploy=false`
and `shards=8`; full local builds require an explicit request. The upstream
setup guide's scaffold/build steps are context for new apps, not instructions
to replace this repository's established workflow.

## Official documentation

- https://fumadocs.dev/docs/page-conventions.mdx
- https://fumadocs.dev/docs/navigation.mdx
- https://fumadocs.dev/docs/markdown.mdx
- https://fumadocs.dev/docs/guides/customize-ui.mdx
- https://fumadocs.dev/docs/headless/source-api.mdx
- https://fumadocs.dev/docs/mdx/next.mdx
- https://fumadocs.dev/docs/search/custom.mdx
- https://fumadocs.dev/docs/ui/theme.mdx
- https://fumadocs.dev/docs/deploying/static.mdx
