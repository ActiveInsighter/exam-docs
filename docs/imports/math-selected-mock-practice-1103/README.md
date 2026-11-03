# 数学分类模拟题 1103 替换记录

- 来源：https://drive.google.com/file/d/1dkYvVsFkkuuD2E8WraS-IXw86XM6FjS2/view
- 文件：分类模拟题练习题整理1103.zip（848117 字节）。
- SHA-256：`36161e63a779c4755088266d7e923e92a6fb3a42e0aabb3073bf4d914e3ac5fc`。
- 导入日期：2026-11-03。
- 原始包：`public/downloads/math-selected-mock-practice-1103.zip`。
- 完整替换 `content/docs/math/classified-mock-exams/` 的旧 1031 内容，保留栏目 URL 和导航名称。
- 105 个 MDX 页面、82 个小节（其中两节为无题定位页）、1744 道题；高数 963、线代 486、概率 295。
- 导入前逐题校验原包清单的 1744 个 SHA-256，以及 9 个图片 SHA-256，全部一致。
- 所有新题目的 ID 加 `selected-1103-` 前缀，防止与站内来源题库的答题记录冲突。
- 相对 PNG 图片移动至 `public/math-selected-1103/` 并使用绝对资源 URL；8 个 SVG 保持原路径。
- 入口按三科汇总，小节与章节按 meta.json 顺序生成实际发布路由链接。所有目录默认折叠。
- 题干、答案与解析内容保留。公式检查另发现原包 25 处 KaTeX 渲染错误，并按项目规则将另一个分段方程改为多行显示格式，共涉及 15 个题块；修复公式分隔符、方程编号、弧线命令、粘连的 LaTeX 命令及一个损坏的转义字符，数学含义不变。逐题修复前后内容和哈希保存在 formula-repairs.json。
- 原始题目和图片哈希保存在 selection-checks.json；逆向还原公式修复、ID 前缀和图片地址变化后，1744 个题块均与来源哈希一致。
- 页面总数保持 851，部署计数断言无需调整。旧 1031 下载包已移除；其他题库仍使用的共享图片保留。
- 不运行本机生产或静态构建；使用现有 GitHub Actions 八分片流程验证与正式发布。
