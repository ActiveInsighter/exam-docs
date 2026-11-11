# 状态管理

答题继续使用现有 Question Store、IndexedDB 和 Supabase 同步引擎。
React Context 提供身份与稳定依赖，`useSyncExternalStore` 订阅缓存快照。
不为整理代码引入第二套离线缓存，也不把答题数据迁移到 Zustand 或 TanStack Query。

## 身份边界

`components/question/database-provider.tsx` 负责数据库和 Session 的生命周期。
渲染时必须同时满足以下条件，才能向消费者提供 Session：

- 本地存储已初始化。
- `session.namespace` 等于当前身份的 namespace。
- `session.database` 等于当前数据库实例。

身份切换期间提供空缓存、`ready=false` 和本地同步状态；新 Session 就绪后
才开放作答。云端连接仍要求经过验证的账号，缓存身份只用于本地离线记录。
同步状态直接订阅当前 engine，连接错误也按 engine 隔离。

题目只读 `QuestionStorageContext`，该 Context 不随同步进度改变。
账号菜单和设置页使用完整的 `QuestionDatabaseContext`。

## 异步列表

`lib/question-store/query.ts` 是临时查询视图，不负责持久化。它先订阅变化，
再加载数据；通过递增版本忽略失效或乱序的请求。最后一位消费者离开时，
清理订阅、定时器和结果，避免长期保留列表。

`components/question/use-question-query.ts` 把该视图连接到 React。
切换查询对象时，在 render 中立即读取新对象的快照，不等待 Effect 清空旧数据。

- `useQuestionRecords()` 按数据库与 namespace 创建查询，合并答案、尝试记录
  和活动统计，批量变更合并为一次刷新。
- `useLibraryMarks()` 按 annotation cache 隔离，设置页和收藏弹窗共用同一查询。
  关闭或禁用的消费者不继续读取数据；失败显式返回错误并提供重试。
- 标签和单题收藏继续通过现有 `useUserTags()`、`useQuestionMark()` 细粒度订阅。
- annotation cache 的 `subscribeLibrary()` 汇总本地提交、导入、其他标签页
  和远端同步通知，内存模式也提供同样的列表刷新行为。

同一身份刷新失败时可保留该身份已加载的数据；新身份从空快照开始，
不能沿用上一位用户的数据、错误或筛选标签。

## 验证

`tests/question-session-ui.test.tsx` 验证登录、换账号、退出、慢请求、读取失败、
禁用后重开、共享查询，以及同步进度不触发题目存储消费者重渲染。
`tests/question-query.test.ts` 验证请求乱序、合并刷新、重试和订阅清理。
现有缓存生命周期、IndexedDB 与 SQL 同步集成测试继续覆盖持久化层。
