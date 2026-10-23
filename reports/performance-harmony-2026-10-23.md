# 构建、交互性能与鸿蒙浏览器排查（2026-10-23）

项目：`/home/dev/Documents/Project/exam-docs`。工作分支：`codex/performance-harmony-20261023`。

## 现象和证据边界

用户补充：鸿蒙 7 最新版华为浏览器，有时页面静置也会闪退。本次没有真实华为设备、浏览器进程退出日志或已登录的用户会话，因此不能确认浏览器被终止的直接原因，不能把 Chromium 仿真通过等同于真机修复成功。

现有生产版本已经关闭 Cloudflare 推测加载、触屏视口预取与 Realtime WebSocket；代码中的同步没有空闲轮询。本次 Chromium 移动仿真以访客身份连续切换 9 个李林 880 数学章节，逐页执行 GC 后 JS 堆为 23.1–24.7 MB，未见随章节数持续增长；随后静置 10 秒，DOM、布局和样式重算次数均无增长，JS 堆减少 948 字节。详见 [原始采样](harmony-browser-baseline-2026-10-23.json)。这只测量该场景的 JS/DOM，未覆盖真实设备的原生、图片和 GPU 内存，也未覆盖长时间登录态。

## 已修复的代码问题

1. **答案与标记缓存无回收。** 站点 Provider 跨路由存活，原来的 Map 保留所有访问过的题目及已完成的文档读取 Promise。现在最后一个订阅者离开后批量回收已落库条目；尚在排队、写入或写入失败的答案保留，成功落库后才回收。只合并同时进行的整页读取，返回旧页及同页延后挂载的题目都能从 IndexedDB 恢复。无数据库的临时缓存保持原有行为，空快照也保持稳定，避免 `useSyncExternalStore` 收到无变化的新对象。
2. **搜索索引永久保留及主线程解析。** 已核查当前 Fumadocs 的 `staticClient` 实现：其模块级 Map 没有淘汰接口，仅删除外层客户端无效。站点的 core/body 均使用 simple 导出，因此直接用 ZBSearch 公共 API 加载该格式，保持原有分词、中文精确匹配、英文容错、标题权重与结果结构。与原客户端逐项对比结果及顺序一致。
3. **搜索改为短生命周期 Worker。** 每层搜索顺序处理分片，避免并行 JSON 解析峰值；搜索完成、查询替换、关闭、隐藏或超过 30 秒都会终止 Worker。关闭后不会留下索引或请求继续工作。清单和路由加载也有超时，失败 Promise 会移除，界面提供可重试错误。代价是重新查询要重新解析分片，但文件仍使用 HTTP 缓存；目的是让浏览器在搜索后恢复低占用。
4. **同步超时在部分内核中没有真正取消请求。** 旧代码仅在支持 `AbortSignal.timeout` 时给 RPC 加取消信号；同步引擎外层 `Promise.race` 本身不能取消底层网络。在缺少该 API 且网络卡住时，后续重试可能与悬挂请求积压。现在统一使用 `AbortController` 和可清理的 20 秒计时器，不依赖新 API。测试模拟缺少该能力的环境，确认超时信号确实 aborted，正常完成后没有遗留计时器。这是兼容性缺口的修复，尚不能断言用户的鸿蒙内核缺少此 API。

## 构建改动

- 仅在 GitHub Actions 的 `Deploy exam-docs to Cloudflare` 工作流中跳过 8 个分片重复的 TypeScript 检查，由原有 `validate` job 的应用及 Worker 类型检查统一负责；合并/部署仍依赖该 job 成功。其他 CI 及手工本地构建默认继续检查类型；工作流改名会自动回退到检查。
- 搜索缓存精确失效及发布后搜索浏览器检查已编写在 [工作流补丁](harmony-workflow-follow-up.patch)，尚未应用：当前 GitHub OAuth 凭据缺少 workflow 写权限，拒绝推送 `.github/workflows` 改动。补丁将搜索缓存从 `lib/**`、`data/**` 改为实际 tokenizer、路径、Markdown、索引脚本和内容输入，并升级版本；应用后普通 UI 修改将不再使索引缓存失效。
- 保留现有权重分片、Turbopack 缓存、分片冲突校验及预上传。最近生产构建的静态阶段约 30–48 秒，stage 准备不足约 1 秒；没有为了小幅 I/O 收益改写已经很快的打包路径。

## 验证

- 本机完整 `npm test`：37 个文件、293 项测试通过。包括新增跨 20 页回收与恢复、同页延后挂载、失败草稿恢复、Strict Mode 重订阅、搜索客户端等价、网络失败重试和 RPC 超时取消测试。
- 应用与 Worker 类型检查通过（与 CI 相同的应用范围，排除测试文件和独立 Worker）；现有 `npm run typecheck` 会额外检查测试文件，其原有 `tests/account-connectivity.test.ts` 直接访问 SDK 的 protected `storageKey`，不应据此误报发布应用有类型错误。
- `verify-english-reading-browser.mjs`：桌面与 390/320/700px 触屏布局、题目即时判分、原文翻译、分栏滚动、导航器及解答弹层交互通过。
- `verify-search-browser.mjs`：模拟 503 后原位重试、同查询关闭重开、关闭时取消挂起的索引请求、无横向溢出及无未捕获异常。5 个 Worker 被创建，结束时保留 0 个。脚本已提交，自动接入发布后验证的步骤在上述工作流补丁中。
- 完整构建按仓库约定在 GitHub Actions 执行：`deploy=false, shards=8`。云端结果与可比计时在完成后补充。

## 真机下一步

授权发布这批改动后，在用户的鸿蒙浏览器验证：登录/未登录各静置、多个数学章节切换后静置、搜索后关闭再静置、断网/弱网后恢复，以及进入后台再返回。若仍然退出，需要获取发生时间、具体页面及浏览器/系统退出日志，区分 Web 渲染进程被内存回收、内核崩溃和整浏览器进程退出；本次修复不能替代这一证据。

技术参考：[Supabase RPC 取消信号](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal)、本机 Next 16.3.3 `node_modules/next/dist/docs/01-app/02-guides/memory-usage.md`、当前安装的 Fumadocs `search/client/orama-static.js`。UI 审查依据 [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)。
