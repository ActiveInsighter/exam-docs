# 导航缓存与鸿蒙恢复答案诊断（2026-11-01）

导航内存累积已有可验证的修复；鸿蒙恢复答案闪退仍待真机日志确认，不能以桌面 Chromium 通过替代 ArkWeb 验证。

## Next 导航缓存

Next 16.4.3 的 `segment-cache/bfcache.js` 将每个条目的 `size` 写成 100 字节。
条目持有的 RSC 对象可使整个 Flight 响应及其中的 KaTeX 字符串继续存活，但这部分内存没有计入相应的 LRU 计费。

`scripts/patch-next-bfcache-size.mjs` 在 postinstall 中同时修改 ESM/CJS 文件，
将每条目的计费值改为 `8 * 1024 * 1024`。这是保守的固定估算，不是动态测量真实响应大小。
不修改实际响应、不限制渲染内容；历史条目淘汰后重新请求对应静态 RSC 文件。
补丁匹配不到预期源码时会失败，升级 Next 必须复核。

`scripts/prepare-static-build-cache.mjs` 将 epoch 从 `study-layout-v3` 提升至
`study-layout-v4`，使旧的 Turbopack 缓存失效。
`scripts/verify-next-bfcache-patch.mjs` 在静态构建完成后检查输出的客户端 chunk：
找不到预期缓存条目，或条目大小仍为旧值，均使构建失败。

## 原生 CDP 对比

同一线上静态站点、同一路径，从李林 880 第一章连续前往第十三章，共 12 次客户端导航。
独立 Chromium profile、412×915 移动视口、Android Chrome UA；未启用 CDP Network 域。
补丁组只在加载 JS chunk 时通过 Fetch 域替换条目计费值；没有捕获 Flight 响应体。
每次采样前执行两次 GC，使用 memory-infra 的
`partition_alloc/partitions/buffer/allocated_objects_size` 衡量存活分配，避免把 PartitionAlloc 保留的空闲页当作存活对象。

| 指标 | 未修改：初始 → 12 次导航 | 8 MiB：初始 → 12 次导航 |
| --- | --- | --- |
| 字符串缓冲区存活分配（MiB） | 18.5 → 91.3 | 18.5 → 27.5 |
| V8 分配总量（MiB） | 12.2 → 27.6 | 12.2 → 15.7 |
| JSHeapUsedSize（十进制 MB） | 10.0 → 25.8 | 10.1 → 13.7 |

补丁组第二次导航短暂达到 40.7 MiB，随后回落；第四至第十二次导航的缓冲区为
24.9–33.8 MiB，没有对照组的持续累积。此结果不是对任意页面设定 34 MiB 的硬性上限。

补丁组随后后退四次、前进四次。每步验证 URL 确实变化，标题、题目及 KaTeX 公式均存在。
第九至十三章之间的历史导航均通过，返回第十三章仍有 44 题、382 个 KaTeX 元素。

## 临时诊断通道

`components/crash-diagnostics-script.tsx` 在两份 root layout 的 head 中挂载。
有公开 Supabase 配置时，鸿蒙/ArkWeb/华为浏览器默认启用；其他浏览器需 `?diag=1`。
`?diag=0` 在当前浏览器持久关闭，`?diag=1` 可重新打开。

事件包括启动、hydration、路由、数据库打开、答案读取开始/读取完成/应用完成、提交/重置、
数学键盘及弹窗开关、错误、长任务、可见性与页面生命周期。
本地心跳保存堆、DOM、滚动位置及已作答题数；不记录具体作答内容或 URL 查询参数。

每次事件先同步存入 localStorage，再批量实时上报；缺少正常 pagehide 的旧会话在下次访问时补传。
仅在补传得到成功 HTTP 响应后删除旧记录；失败保留待重试。
本地最多保留五次访问、每次最多 150 个事件，上传按 UTF-8 字节限制在 30,000 字节内。
实时上传最多 280 批，超过后丢弃待传队列，避免诊断自身无限积累。
没有 pagehide 也可能是系统丢弃后台页或关闭进程，不能单凭这一标记认定具体崩溃原因。

`lib/question-store/cache.ts` 在读取 IndexedDB 前、取到记录后和发布恢复状态后同步记录标记。
配合后续渲染错误与心跳，可缩小“读取存储”“应用答案”“渲染恢复结果”的排查范围。
所有诊断调用均为尽力执行，异常不会阻止答题写入。

## 数据库与网关核验

线上迁移版本已是 `20261101085408_client_diagnostics`，与本地文件一致。
`exam_private.client_diagnostics` 已启用 RLS；anon/authenticated 无表读取权限，anon 也无直接插入权限。
两者只被授予固定的 `exam_client_log(text,text,jsonb)` 函数执行权限。
函数固定空 search_path，仅插入诊断表，校验会话 ID、kind、JSON 数组和 32 KiB 载荷限制，
并对单会话与最近一小时的批次数做尽力限制。该限制不是严格的并发配额，也不是总表容量或保留期上限。

Security Advisor 中的“无 RLS policy”和“公开可执行 SECURITY DEFINER”对应刻意设置的
只写入口；没有新增读取 policy 来消除提示。已有的密码泄漏保护设置未在本任务中调整。
已确认的 setup/localcheck 探测会话已清理。

管理员可查询最近会话，浏览器角色不可读取：

```sql
select session_id, kind, received_at, events
from exam_private.client_diagnostics
order by id desc
limit 50;
```

正式站点与 Worker 更新后，在目标手机上重现“作答 → 重新加载”，再打开页面使遗留记录补传。
按会话查看最后一个答案恢复标记、错误和心跳；排查完成后移除诊断脚本、埋点、网关入口以及数据库函数/表。
代码完成与云端构建通过都不代表该真机闪退已被修复。
