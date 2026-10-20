# Fumadocs on EdgeOne

A minimal Fumadocs documentation site built with Next.js 16 and Tailwind CSS 4.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000/docs`.

## Question progress

The custom question components save answers in browser IndexedDB, including
drafts, submissions and resets. Browser storage is the first read/write path.
Cloud sync is optional: without Supabase configuration, questions remain usable
locally and make no question-sync requests.

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
GitHub Actions and publishes a pure static package to Cloudflare Workers Static
Assets. `main` targets `exam-docs`; approved preview branches target the isolated
`exam-docs-preview` Worker. The documentation package is:

- HTML, JS, CSS, Markdown downloads, the search manifest, category routers, and
  ZBSearch indexes are static files;
- documentation search runs in the browser with ZBSearch;
- no application server or question API hosted with the static package.

The static output retains its EdgeOne-compatible routing metadata. Supabase
Auth and database RPCs are reached directly from the browser when cloud sync is
configured; adding them does not require a Next.js server.

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
