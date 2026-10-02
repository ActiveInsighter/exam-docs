# exam-docs 构建提速研究（2026-10-02）

本研究在 `codex/build-speed-research-1002` 分支进行。构建、测试、部署均在 GitHub Actions，部署到隔离 Cloudflare 预览 Worker。未合并 main。原始计时见同目录 `build-speed-metrics-2026-10-02.json`，每项保留 run URL、commit、job 和 step 耗时。

## 范围与方法

- 基线：exam-docs main `eb118b9`（599 个文档，已采用 4 个加权分片）；fumadocs-study main `ae7c01d`（780 个文档，原为单 runner 串行构建页面与搜索）。
- 软件不升级：Node 22、Next.js 16.3.3、fumadocs-core 16.14.0、fumadocs-mdx 15.2.2。使用 `ubuntu-24.04` hosted runner。
- 冷/热编译模式实验在同一个 runner 连续运行两遍，冷遍先删除 stage/cache；4/8 分片比较采用独立 workflow 的首次运行与后续复测，并记录缓存恢复和实际编译时间。不同 hosted runner 性能与网络有波动，结果是本次样本，不是统计置信区间。
- 分别记录可部署包就绪时间（不含上传）、最长页面构建步骤（并行阶段的关键耗时）、各分片构建步骤之和（计算投入）、完整 workflow（含排队/下载/合并/上传/验证）。不能用总 runner 秒数当作用户等待时间，也不能把部署上传算成页面编译。

## 官方文档与判断

1. [Fumadocs MDX 性能](https://www.fumadocs.dev/docs/mdx/performance)、[Dynamic Mode](https://www.fumadocs.dev/docs/mdx/entry/dynamic)、[Async Mode](https://www.fumadocs.dev/docs/mdx/async)：大量文档应避免一次性将正文纳入 bundler；Async 是值得实验的替代方案。本项目继续保留 Dynamic。
2. [Fumadocs global config](https://www.fumadocs.dev/docs/mdx/global)：查阅锁定版本的官方包实现后发现，`experimentalBuildCache` 位于 bundler loader，Dynamic runtime 直接调用 `buildMDX`。因此不能把这个选项当成当前 Dynamic 页面生成的持久缓存，也没有宣称它能提速。
3. [Next CI build caching](https://nextjs.org/docs/app/guides/ci-build-caching)、[Turbopack 文件系统缓存](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopackFileSystemCache)：已有 `.next/cache` 的持久化；热缓存编译约 3–4 秒，主要瓶颈已转到页面生成，继续加缓存开关的收益有限。
4. [Next staticGeneration 参数](https://nextjs.org/docs/app/api-reference/config/next-config-js/staticGeneration)：属于实验参数。没有在 CPU 数量不变时盲目调高单进程并发，也没有把未实测的参数列成收益。通过多个独立 runner 增加实际 CPU/内存来并行生成页面。
5. [Next generateBuildId](https://nextjs.org/docs/app/api-reference/config/next-config-js/generateBuildId)：同一份应用 shell 的分片使用同一个 ID；修改应用代码、样式、配置、依赖或新增/删除路由会更新 ID，单纯修改正文不打乱共享静态命名空间。所有正文仍重新渲染，HTML/Markdown 和搜索重新生成。
6. [GitHub cache keys/restore keys](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)：分片数量与编号独立缓存，输入哈希变化时恢复最近兼容缓存；保留既有 dependency/download cache。
7. [Tailwind 源码扫描](https://tailwindcss.com/docs/detecting-classes-in-source-files)：按文档使用 `source(none)` 与显式 `@source`，限制为应用和文档源码；构建目录同时保留 `.gitignore`。Fumadocs 的 preset CSS 继续正常导入。
8. [Fumadocs 搜索静态导出](https://www.fumadocs.dev/docs/headless/search/orama)：保持静态搜索，增加真实 server.export → staticClient 的查询结果一致性测试。规范化的是自动生成的外部 ID，内部数字索引和正文数据保持完整，输出重新计算内容哈希。

## 实际实现

- 默认 8 个加权页面分片，手动输入 `shards=4` 可节省总计算投入。按正文源文件字节数分配，并对最终 URL 去重排序，每条路由有唯一归属。源文件大小是成本近似，仍可能有耗时不均。
- 搜索独立构建一次，与页面并行；Markdown 全量导出只归属 shard 0。fumadocs-study 引入此架构；exam-docs 在已有架构上提高分片数量。
- 同路径 JS/CSS 字节冲突立即阻止合并。新增跨分片 `docs/__next.docs.txt` 字节一致性检查；浏览器面对的 HTML/RSC/CSS 资源引用逐一检查存在。
- 保留原静态资产去重、Cloudflare package 限制检查、Markdown UTF-8 metadata、dry-run 和部署验证。
- `probe_edit=true, deploy=false` 在 runner 临时追加正文标记，在合并后的 HTML 和 Markdown 内检查标记；源仓库不提交测试正文。此输入与 deploy=true 组合会在 checkout 后立即失败。

## 计时结果

| 样本 | 可部署包就绪 | 最长构建步骤 | 分片步骤总和 | Workflow 总耗时 | 部署步骤 | 结果 / 原始记录 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 已有生产流程样本 | 179 秒 | 129 秒 | 461 秒 | 321 秒 | 126 秒 | [success](https://github.com/ActiveInsighter/exam-docs/actions/runs/36855484493) |
| 首次 4 分片 / 新缓存键 | 184 秒 | 129 秒 | 475 秒 | 205 秒 | — | [success](https://github.com/ActiveInsighter/exam-docs/actions/runs/37002377031) |
| 首次 8 分片 / 新缓存键（源码隔离修复前） | 172 秒 | 83 秒 | 593 秒 | 320 秒 | 128 秒 | [success](https://github.com/ActiveInsighter/exam-docs/actions/runs/37002749570) |
| 最终代码 4 分片 / 热缓存 / 不部署 | 155 秒 | 104 秒 | 382 秒 | 177 秒 | — | [success](https://github.com/ActiveInsighter/exam-docs/actions/runs/37005599905) |
| 8 分片 / 热缓存 / 临时修改正文 / 不部署 | 146 秒 | 73 秒 | 508 秒 | 168 秒 | — | [success](https://github.com/ActiveInsighter/exam-docs/actions/runs/37005264094) |
| 最终代码 8 分片 / 首次发布新 shell | 135 秒 | 69 秒 | 455 秒 | 328 秒 | 173 秒 | [success](https://github.com/ActiveInsighter/exam-docs/actions/runs/37005921035) |
| 最终代码 8 分片 / 同提交重建并再次发布 | 126 秒 | 75 秒 | 488 秒 | 163 秒 | 23 秒 | [success](https://github.com/ActiveInsighter/exam-docs/actions/runs/37006486395) |

可部署包就绪时间从已有生产样本的 **179 秒降至 126 秒（缩短 29.6%）**；同版本 4→8 分片为 **155→126 秒（缩短 18.7%）**。该指标从 workflow 创建计至 `Validate Cloudflare asset package` 成功结束，包含排队、依赖恢复、搜索/页面构建、制品传输、合并与包验证，排除 dry-run、部署与上线后浏览器检查，比单一步骤更接近实际构建等待。

构建关键步骤相对已有生产样本从 **129 秒降至 75 秒（缩短 41.9%）**。最终代码同版本 4→8 分片的比较为 **104→75 秒（缩短 27.9%）**，分片步骤总计算投入增加 **27.7%**。最长步骤包含 Next 构建及本分片打包；8 分片搜索并行、后续合并仍另有开销，这不是整个构建管线的耗时。

已有生产 workflow 的 321 秒与同提交重复发布的 163 秒涉及不同上传条件，只表示实际样本。首次切换新 shell 用了 328 秒；再次发布复用 3530 个文件，仍上传 18 个文件。没有声称整个静态输出逐字节完全可复现，也没有把资源复用的收益全归因于编译提速。

编译模式实验：Dynamic 同 runner 冷/热为 121.80/106.80 秒（exam 为代表性的第 0/4 分片，study 为原单 runner 全量构建）。[原始实验 run](https://github.com/ActiveInsighter/exam-docs/actions/runs/37002032428) 的 Dynamic job 成功，整体因 Async job 失败而标红。成功的热缓存编译分别约 4.0 秒与 3.4 秒；热缓存没有消除 Dynamic 正文生成成本。

最终两次正常部署导出的 32 份搜索资产 SHA-256 全部相同；共享布局、同路径 JS/CSS 的严格一致性检查通过。完整分片制品对比发现仅 6 个页面的 HTML/RSC 共 18 文件变化，抽样差异位于 Shiki 代码高亮色值/token 边界；15 份文件替换颜色字面量后完全一致。未修改或规范化高亮输出，这些小幅产物变化仍保留。


## 实验失败与修复

- Async 实验的两个 runner 都在预编译阶段被 shutdown，以信号/exit 143 结束，未取得可比较的成功构建或热缓存成绩。不能证明 Async 更快或更慢，也不能仅凭这个退出码确认 OOM。研究 workflow 保留为手动运行，失败实验不作为生产门禁。
- 初始全仓库 `npm test` 在未更改业务代码时即失败，涉及已删除的旧部署 workflow、过时的内容名或 collections mock/alias。基线失败记录：[exam-docs](https://github.com/ActiveInsighter/exam-docs/actions/runs/37001915757)、[fumadocs-study](https://github.com/ActiveInsighter/fumadocs-study/actions/runs/37001917541)。后续执行当前生产部署测试集与新增回归测试；不声称全仓库测试通过。
- exam-docs 热缓存跨分片布局检查发现真实的不确定输出：[诊断 run](https://github.com/ActiveInsighter/exam-docs/actions/runs/37004169831)。4 份布局仅 CSS 引用不同，替换 CSS URL 后内容 SHA-256 一致。CSS 中出现二进制缓存误识别出来的乱码 arbitrary property；只复制 `.gitignore` 的尝试仍失败。最终使用显式 Tailwind 源码范围，继续保留严格检查，未放宽冲突规则。
- fumadocs-study 初次 8 分片预览已成功部署，原浏览器检查通过，新增搜索检查因把当前搜索组件的 button 当成 link 而超时。按锁定版本 Fumadocs UI 源码修正选择器，随后验证真实 Enter 选择与页面跳转。失败 run 不标为全流程通过。

## 验证与复现

- 最终代码提交：`03962cd`，46 项部署/回归测试（10 个测试文件）通过。该提交完成同版本 4/8 分片验证、完整重建与预览部署；后续报告补充提交只修改 reports。
- 文档数量：600 HTML 路由 / 599 Markdown / 搜索 599 页。分片合并冲突检查、所有浏览器静态资源引用检查和 Wrangler dry-run 通过。
- 正文更新验证：[probe run](https://github.com/ActiveInsighter/exam-docs/actions/runs/37005264094)，临时标记在 HTML 与 Markdown 中均出现。该 run 已包含最终的 Tailwind 源码范围修复。
- 完整预览验证：[最终复测](https://github.com/ActiveInsighter/exam-docs/actions/runs/37006486395)。所有 600 个文档 HTTP 路由返回 200。
- 预览地址：[exam-docs](https://exam-docs-preview.2212148739lbw.workers.dev)。


手动运行 `.github/workflows/deploy-cloudflare-worker-assets.yml`，设置 `shards=4` 或 `8`。设置 `deploy=false` 可仅构建、验证、Wrangler dry-run；设置 `probe_edit=true` 需同时 `deploy=false`。研究分支 deploy=true 使用预览 Worker，main 的原生产目标不变。推送 main 后默认使用 8 分片。

查看每个 build job 的 `Build weighted static shard` 步骤和 `/usr/bin/time -v`，以及 search、merge、deploy 的独立步骤；不要将不同测试阶段的样本混合成单一百分比。

## 后续取舍

8 分片减少等待但增加整体 runner 计算与下载/上传开销。若账号并发受限、缓存下载成为瓶颈或更在意计算投入，可以使用 4 分片。搜索目前约 30–55 秒，是页面提速后下一项可观察的独立成本；未实现正文编译跨提交持久缓存。全量页面仍每次生成，本次是并行提速，不是跳过未修改页面。
