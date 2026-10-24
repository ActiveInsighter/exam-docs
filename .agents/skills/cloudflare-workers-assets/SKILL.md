---
name: cloudflare-workers-assets
description: Build, validate, and deploy exam-docs static assets and its Supabase gateway Worker using the existing sharded GitHub Actions workflow.
---

# Cloudflare Workers Static Assets

Repository-local skill adapted from Anyworkflow-remote's deployment skill and
this project's actual configuration. This is not a Cloudflare-published skill.

Use for `wrangler.jsonc`, static export, RSC routing, asset upload, deployment
Actions, workers.dev, custom domains, or the Supabase gateway Worker. Read
`AGENTS.md`, `package.json`, `wrangler.jsonc`, and affected files before editing.

## Deployment contract

- This is a Next.js/Fumadocs static export with `worker/index.ts` as the Worker
  entry point and `.static-docs/` as the deployed asset directory.
- Preserve `assets.binding = "ASSETS"`,
  `assets.run_worker_first = ["/api/supabase/*"]`,
  `assets.not_found_handling = "404-page"`, and
  `assets.html_handling = "auto-trailing-slash"`.
- The Worker proxies Supabase requests and delegates other requests to
  `env.ASSETS.fetch(request)`. Preserve caller authentication and Supabase RLS;
  never add a service-role key to browser code or proxy requests.
- Preserve the export/shard pipeline and RSC rewrites. The asset preparation
  script translates `.static-docs/edgeone.json` into `_redirects`, `_headers`,
  and `.assetsignore`; edit generators rather than generated output.
- Preserve Markdown UTF-8 headers and the empty speculation-rules response
  used to opt out of Speed Brain's document rules. Inspect the generator's
  documented memory-leak rationale before changing that behavior.
- Preserve Unicode paths, search assets, hashed JS/CSS references, and the
  generated `404.html`. Do not introduce an SPA fallback.
- Full builds default to `.github/workflows/deploy-cloudflare-worker-assets.yml`
  with explicit `deploy=false` and `shards=8`. The workflow currently defaults
  `deploy` to true, so never omit this input on a validation dispatch.
- Follow existing session authorization for pushes and workflow dispatches.
  Production deployment or merging to main requires explicit authorization.
- Keep production `exam-docs` and isolated `exam-docs-preview` targets distinct;
  inspect workflow branch conditions before dispatching or pushing.
- CI uses `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Browser Supabase
  variables are inlined at build time; private credentials never belong there.

## Verification

Run targeted tests for changed scripts/routing and relevant application/Worker
type checks. Inspect actual Actions results for CI changes. Asset pre-upload
is an optimization, not deployment success: report a deployed Worker only
after the deploy workflow succeeds and Wrangler confirms it.

For an authorized deployment, verify `/docs`, a nested page, client-side
navigation/RSC requests, search, a Unicode route, a Markdown view, 404 behavior,
and the authenticated Supabase gateway path when affected.

## Official references

- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/static-assets/binding/
- https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/
- https://developers.cloudflare.com/workers/static-assets/redirects/
- https://developers.cloudflare.com/workers/static-assets/headers/
- https://developers.cloudflare.com/workers/wrangler/configuration/

Fetch relevant current documentation when behavior or platform limits matter.
