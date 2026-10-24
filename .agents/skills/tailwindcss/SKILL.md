---
name: tailwindcss
description: Maintain this project's Tailwind CSS 4 styles, theme variables, source detection, responsive layouts, and Fumadocs/shadcn integration using official Tailwind documentation.
---

# Tailwind CSS

This is a repository-local skill based on Tailwind Labs' official documentation,
not a Tailwind Labs-published skill. No official installable Tailwind skill was
found in the official organization or skill index when installed (2026-10-24).

## Project workflow

1. Read `package.json`, `postcss.config.*`, `app/global.css`, affected styles,
   and existing tokens before editing. This project uses Tailwind CSS 4 and
   `@tailwindcss/postcss`; verify the installed versions.
2. Retrieve the relevant official documentation below. Do not introduce a v3
   `tailwind.config.js`, `@tailwind` directives, or a replacement build pipeline
   into this v4 project unless a task explicitly requires a migration.
3. Keep the existing `@import 'tailwindcss' source(none)` and explicit `@source`
   paths. When moving or adding class-bearing files, check source coverage.
4. Use complete, statically detectable class names. For dynamic states, map to
   complete strings or use CSS variables; do not construct partial utility names.
5. Reuse semantic CSS variables and existing `styles/tokens/` definitions.
   Inspect `@theme inline` mappings before changing color/font/radius tokens.
6. Preserve Fumadocs stylesheet ordering and Base UI component behavior. For
   shadcn components also read the official `shadcn` skill and, where present,
   `components.json`; preserve the project's aliases and primitive family.
7. Review light/dark themes, keyboard focus, touch targets, responsive text and
   long content. Verify narrow and desktop layouts without horizontal overflow.
8. Run targeted verification; follow `AGENTS.md` for full-build policy. Do not
   perform an unrelated theme reset, CLI initialization, or dependency upgrade.

## Official references

- https://tailwindcss.com/docs/installation/using-postcss
- https://tailwindcss.com/docs/theme
- https://tailwindcss.com/docs/detecting-classes-in-source-files
- https://tailwindcss.com/docs/adding-custom-styles
- https://tailwindcss.com/docs/responsive-design
- https://tailwindcss.com/docs/dark-mode
- https://tailwindcss.com/docs/hover-focus-and-other-states
- https://tailwindcss.com/docs/upgrade-guide
