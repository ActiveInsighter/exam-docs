# Fumadocs on EdgeOne

A minimal Fumadocs documentation site built with Next.js 16 and Tailwind CSS 4.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000/docs`.

## Mermaid diagrams

The blog at `/blog/mermaid-theme-gallery` compares seven light/dark presets
across flowcharts, sequence diagrams and class diagrams. Use
`<Mermaid preset="neo" chart={source} />` to opt in; omitting `preset` keeps
existing document styles. Presets live in `lib/mermaid-presets.ts`. Rendering
is serialized so each diagram keeps its own theme configuration.

Mermaid is pinned to 12.2.0. Use Node.js 22.12+ within the Node 22 release line;
Mermaid 12 targets ES2024 and Safari 17.4+. The shared renderer explicitly keeps
the `dagre` layout and `classic` look for existing documents and follows the site
theme. Individual diagrams can override these defaults in Mermaid frontmatter.
`postinstall` applies an idempotent 12.2.0 workaround
(`scripts/patch-mermaid-block-layout.mjs`) for block-layout debug logging that
otherwise JSON-serializes circular React DOM references. Review it on upgrades.

## Account

The account button next to the GitHub icon opens a menu with sign-in and sign-out.
It is a standalone module (`components/account`, `lib/account`) built on shadcn
components and attached through Fumadocs' public layout options. See
[docs/account.md](docs/account.md).

## Modal

`components/ui/modal.tsx` is a general modal built on the shadcn Dialog parts:
a bottom sheet at every width (slides up on every open, drags down to
dismiss), a low frosted-glass header (title, tags, toolbar, close), single or
split-pane content, and nested levels stacked like a deck of cards with back /
close-all. The question solution sheet and the
"收藏与标签" library are built from it. See
[docs/modal-component.md](docs/modal-component.md) and the live demos on the
blog post `/blog/component-showcase`.

## Buttons

`components/ui/button.tsx` extends the shadcn Button with click-to-fill: given
`revealed`, a button fills with `--reveal-color` as a circle spreading from the
point it was pressed. `TileButton` is a selectable card button built on it; the
question options and true / false buttons use it. See
[docs/button-component.md](docs/button-component.md).

## Question progress

The custom question components save answers in browser IndexedDB, including
drafts, submissions and resets. Browser storage is the first read/write path.
Cloud sync is optional: without Supabase configuration, questions remain usable
locally and make no question-sync requests. Cloudflare deployments route Auth
and question RPC requests through the same-origin `/api/supabase` gateway, so
the browser does not need to reach the Supabase hostname directly.

To enable account sync, copy `.env.example` to `.env.local` and set
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Only public
project configuration belongs in these variables. See the Chinese
[database and sync guide](docs/question-database.md) for architecture, account
isolation, conflicts, migrations, authentication and rollout steps.

## ZBSearch

Documentation search uses Fumadocs' built-in ZBSearch engine and remains fully
static. No Algolia account, search API, Cloud Function, or Edge Function is
required.

The search layout is designed so query cost does not grow linearly with the full
document corpus:

1. `/search-index.json` is the only stable search URL. It contains a bounded
   Bloom-filter summary for each top-level documentation category and points to
   content-addressed category router files.
2. The browser scores those tiny category summaries using the current query and
   current documentation location. It normally loads only the most likely one or
   two category routers first.
3. Each category router contains Bloom routing metadata for two independent
   ZBSearch tiers: lightweight `core` shards (page title, description, bounded
   heading summary) and full-text `body` shards.
4. The browser loads a small routed core batch first so page-level results appear
   quickly, then a small routed body batch for exact heading/full-text matches.
5. If there are not enough results, search expands progressively. A hard per-query
   budget caps category routers, core shards, and body shards, so even a very
   large future category cannot force the browser to download the whole index.

Both core and body storage are automatically sharded. This matters at large
scale: even the lightweight page index is never treated as one global file that
must be downloaded in full. Corpus growth primarily creates more immutable
static shards rather than proportionally increasing every user's first-search
payload.

Body indexes remain section-aware, so results can link directly to matching
heading anchors. Very long sections are split into bounded chunks behind the same
anchor and duplicate URLs are merged in the UI.

Before indexing, low-value search payload is removed: large LaTeX formula bodies,
URLs, MDX syntax, and duplicate section text do not consume the same space as
natural-language explanations. Fenced code blocks are already excluded by the
Fumadocs structured-data extractor. Search structure is generated independently
of the main MDX render pipeline, so the pure-static build can keep
`remarkStructure` disabled for page-build performance.

Sharding is automatic rather than fixed. Pages are grouped by documentation
category/subtree, then stable content-size partitions are created around a target
search payload. Any exported ZBSearch shard that still grows beyond the soft
limit is split again automatically. Generated core, router, and body files use
content hashes in their filenames, which lets unchanged files keep stable browser
and CDN cache identities across deployments.

`npm run search:build` generates the same hierarchical search layout in `public/`
for local development. `npm run build:static-docs` generates it directly in the
EdgeOne deployment artifact and reports raw/gzip/Brotli sizes. The build has a
10 MB soft split target, warns at 15 MB, and rejects any individual static search
file at 25,000,000 bytes to stay below EdgeOne's single-file limit.

## Deployment

The current deployment workflow,
`.github/workflows/deploy-cloudflare-worker-assets.yml`, builds documentation in
GitHub Actions and publishes static documentation with a Supabase gateway to Cloudflare Workers Static
Assets. `main` targets `exam-docs`; approved preview branches target the isolated
`exam-docs-preview` Worker. The documentation package is:

- HTML, JS, CSS, Markdown downloads, the search manifest, category routers, and
  ZBSearch indexes are static files;
- documentation search runs in the browser with ZBSearch;
- a small Worker forwards only account endpoints and the question sync RPC to
  the configured Supabase project; it adds no privileged key and disables caching.

Two settings keep client-side navigation from exhausting mobile browser memory
(they caused the HarmonyOS Huawei browser to crash after a few page switches):

- Every static response sends `Speculation-Rules: "/speculation-rules.json"`, an
  empty rule set (`scripts/prepare-cloudflare-static-assets.mjs`). Cloudflare
  Speed Brain does not override an origin's header. Its document rule made
  Chromium retain every removed link, and with it each previous page: about
  117k DOM nodes after nine navigations instead of about 13k. Turning Speed
  Brain off in the zone settings (`speed_brain = off`) is the matching
  dashboard change.
- Links do not prefetch when they scroll into view (`components/intent-link.tsx`,
  passed to Fumadocs' `RootProvider`). A question page's RSC payload is several
  MB, and a phone used to parse about 18 MB of sibling chapters on every page
  load. Links prefetch only on mouse hover; taps fetch just the target page.

The browser also releases saved answer/mark cache entries when their last
subscriber leaves (pending or failed answer writes remain until persisted).
Search parses and queries shards sequentially in short-lived Web Workers;
completion, replacement, closing, hiding and a 30-second timeout terminate the
worker and release parsed indexes. Search failures can be retried in place.
See [the performance and HarmonyOS investigation](reports/performance-harmony-2026-10-23.md)
for measurements and the remaining device-verification limit.

The static output retains its EdgeOne-compatible routing metadata. Supabase
Auth and database RPCs are reached through the same-origin Worker when cloud sync
is configured; no Next.js server is required. Local development can leave
`NEXT_PUBLIC_SUPABASE_PROXY_PATH` empty to reach Supabase directly.

Required GitHub Actions secrets for Cloudflare deployment:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Optional GitHub Actions repository **Variables** for question sync:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

These are build-time public values. An empty configuration keeps local-only
mode. Changing a value requires rebuilding the static site. Supabase migrations
live under `supabase/migrations/` and are deployed by the connected Supabase
GitHub integration after **Deploy to production** is enabled. Database migration
and static-site deployment are separate jobs; see the
[rollout guide](docs/question-database.md#仓库与部署) before enabling cloud sync.

Do not commit secret values. Database passwords, personal access tokens,
`service_role` keys and `sb_secret_` keys must never be browser variables.
