import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { Mermaid } from '@/components/mdx/mermaid';
import { mermaidPresets } from '@/lib/mermaid-presets';

const examples = [
  {
    name: '流程图',
    source: `flowchart TD
  A[阅读知识点] --> B[完成练习]
  B --> C{是否掌握}
  C -->|是| D[进入复习]
  C -->|否| E[回顾错题]
  E --> A`,
  },
  {
    name: '时序图',
    source: `sequenceDiagram
  actor S as 学习者
  participant W as 学习网站
  participant N as 笔记库
  S->>W: 打开知识点
  W->>N: 读取学习笔记
  N-->>W: 返回内容
  W-->>S: 展示图解
  S->>W: 完成练习`,
  },
  {
    name: '类图',
    source: `classDiagram
  class 笔记 {
    +标题
    +复习()
  }
  class 知识点 {
    +名称
    +掌握程度
  }
  class 练习 {
    +题目
    +提交答案()
  }
  笔记 "1" --> "多个" 知识点 : 包含
  知识点 "1" --> "多个" 练习 : 巩固`,
  },
];

export function MermaidThemeGallery() {
  return (
    <div className="not-prose min-w-0 font-sans" data-mermaid-gallery>
      <Tabs items={examples.map((example) => example.name)}>
        {examples.map((example) => (
          <Tab key={example.name} value={example.name}>
            <div className="grid min-w-0 gap-8 sm:grid-cols-2">
              {mermaidPresets.map((preset) => (
                <section key={preset.id} className="flex min-w-0 flex-col gap-3" data-mermaid-preset={preset.id}>
                  <header>
                    <h3 className="text-base font-semibold text-fd-foreground">{preset.name}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-fd-muted-foreground">{preset.description}</p>
                  </header>
                  <Mermaid chart={example.source} preset={preset.id} title={`${example.name} · ${preset.id}`} className="my-0 flex-1" />
                  <details className="text-sm text-fd-muted-foreground">
                    <summary className="cursor-pointer rounded-sm py-1 focus-visible:outline-2 focus-visible:outline-fd-ring">查看用法与图表源码</summary>
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-fd-secondary p-3 text-xs leading-relaxed"><code>{`<Mermaid preset="${preset.id}" chart={\`\n${example.source}\n\`} />`}</code></pre>
                  </details>
                </section>
              ))}
            </div>
          </Tab>
        ))}
      </Tabs>
    </div>
  );
}
