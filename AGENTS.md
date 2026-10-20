<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 用户约定：构建与发布

- 完整构建默认交给 GitHub Actions，使用 `deploy-cloudflare-worker-assets.yml`，参数为 `deploy=false`、`shards=8`。
- 本机优先运行类型检查、针对性测试和浏览器交互验证；只有用户明确要求时才在本机运行完整生产或静态构建。
- 按当前会话授权推送工作分支并触发云端构建。正式发布、将 `deploy` 改为 `true` 或合并到 `main`，需有用户明确授权。
