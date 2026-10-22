# 构建与部署提速（2026-10-22）

分支 `ccr-25cff76e-9ib8hv`。按仓库约定，在 GitHub Actions 中以 `deploy=false, shards=8` 完整构建。未部署，未合并 main。

## 瓶颈定位

以 main 最近一次生产部署 [39609755794](https://github.com/ActiveInsighter/exam-docs/actions/runs/39609755794) 为样本（7 分 35 秒）：

- 页面构建约 1.5 分钟。`wrangler deploy` 占 237 秒，其中上传 2808 个变化文件用了 209 秒。合并后的静态包达 2.57 GB，单个数学页的 HTML 可达 10 MB。
- 体积来源：在数学页的 RSC 负载中，**93% 是 KaTeX 的 span 树**。每个公式被展开成几十个 React 元素，并被 React Flight 拆成数千行 `$L` 引用。同一份内容又分别出现在 HTML 内联 RSC、`index.txt` 和 page segment 中。
- 合并步骤的 `rm -rf /tmp/shard-extract/*` 不会删除隐藏目录 `.static-docs`，导致每合并一个分片都要重新哈希之前所有分片的文件。

## 改动

1. **KaTeX 预渲染为 HTML 字符串**（`lib/rehype-katex-html.ts`）：保留外层 `span.katex` / `span.katex-display`，内部改为 `dangerouslySetInnerHTML`，DOM 不变。题目组件内嵌套的公式同样处理。选择题服务端版式估算（`getChoiceDensity`）改为读取预渲染字符串，结果与之前一致。测试中整章二次型题目的渲染 HTML 与原实现等价。经 Fumadocs `buildMDX` 编译后，该章代码从 19.6 MB 降到 5.1 MB。
2. **分片并行预上传**（`scripts/upload-cloudflare-assets.mjs`）：仅在会部署的运行中执行，条件与部署步骤完全相同。各分片和搜索 runner 构建完成后，按 Cloudflare direct-upload 协议把自己的文件上传到目标 Worker。哈希与 Content-Type 与 wrangler 一致，最终仍由官方 `wrangler deploy` 发布。该步骤 `continue-on-error`，失败时 wrangler 照常上传。
3. **修复合并循环**：每次合并都重建解压目录。

## 实测（8 分片，deploy=false）

| Run | 场景 | 总耗时 | 分片构建 (`build:static-docs`) | 合并包 |
| --- | --- | ---: | --- | ---: |
| [39699819426](https://github.com/ActiveInsighter/exam-docs/actions/runs/39699819426) | 基线（= main） | 161 秒 | 62–76 秒 | 2.57 GB |
| [39702280623](https://github.com/ActiveInsighter/exam-docs/actions/runs/39702280623) | KaTeX + 合并修复 | 154 秒 | 30–49 秒（静态生成 50–64 秒 → 19–36 秒） | 2.19 GB（−14.5%） |
| [39703103632](https://github.com/ActiveInsighter/exam-docs/actions/runs/39703103632) | 加入测试 memo | 123 秒 | 29–50 秒 | — |

- 合并步骤：15.9 秒 → 5.9 秒。冲突检查保留，结果为 0 冲突。
- 新的关键路径是 `validate` job（约 64–100 秒，主要是 `npm test` 中整科编译题目的内容测试）。

## 未验证项

- **exam-docs 的预上传尚未在真实部署中运行**：本仓库只允许 main 和指定分支部署，所以本次只做了构建验证。完全相同的脚本和步骤已在 fumadocs-study 实测：wrangler 上传从 5174 个文件、146 秒降到 0 个文件，"No updated asset files to upload"。exam-docs 部署 job 中的上传约占 209 秒，合并到 main 后可直接核对其日志中的 `[cloudflare-upload]` 行与 wrangler 的 `No updated asset files` 行。
- English reading 浏览器验证曾尝试改用 runner 自带的 Chrome（可省约 20 秒），已撤回：完整版 Chrome 会自动请求 `/favicon.ico`，而站点该路径返回 404，会使 console 错误断言失败。

## 第二轮：测试与浏览器验证

- **内容测试**：公式检查改为 `tests/helpers/formula-errors.ts`。只解析一次 MDX，再按 rehype-katex 的方式逐个用 KaTeX 渲染公式，不再对每页做完整 MDX 编译（代码生成是主要耗时）。已在 core-questions 与 past-exams 的全部页面以及故意写错的公式上，与原编译检查逐页核对，结果一致。本机全部 222 个测试由 90 秒降到 26 秒；CI `validate` 中 vitest 由约 71 秒降到 30 秒（[39707368775](https://github.com/ActiveInsighter/exam-docs/actions/runs/39707368775)，构建总耗时 117 秒）。
- **English reading 浏览器验证**：桌面和 390/320/700 三种触屏布局原本就各用独立的浏览器上下文，现改为并发执行。解答弹层的视口检查改为等待其动画稳定，原先的单次采样在负载下会与滑入动画竞争；真正溢出的弹层仍会失败。只安装实际使用的 headless shell。对生产站点本机实测由约 30 秒降到约 10 秒，连续 8 次通过。
- **路由验证**：694 个文档路由改用 HEAD 请求、32 路并发。对生产站点逐一比对，HEAD 与原 GET 状态码完全一致，且不再下载约 2.2 GB 的页面正文。
- 以上浏览器与路由验证只在 main 部署时运行，本分支 CI 未执行。本机已对生产站点验证。
- 本机使用的旧版 Chromium（build 1194）在 `$`/`%24` 两种拼写的 RSC 预取文件间出现 `ERR_TOO_MANY_REDIRECTS`；fumadocs-study 的 CI 日志显示，新版 Chrome 跟随一次 307 后即得到 200。属原有问题，本轮未修改。
