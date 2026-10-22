import { IntentLink as Link } from './intent-link';
import { ArrowRight, ArrowUpRight, BookOpen, Calculator, Check, ChevronRight, Code2, FileText, Globe2, Languages, Network } from 'lucide-react';
import { TabsContent, TabsList, TabsTrigger } from 'fumadocs-ui/components/ui/tabs';
import { homeSubjects } from '@/lib/study-home-content';
import { StudyRhythm } from './study-home-rhythm';
import { StudyPreviewTabs } from './study-preview-tabs';

const subjectIcons = { math: Calculator, computer: Network, english: Languages, politics: Globe2, code: Code2 };

export function StudyHome() {
  return (
    <div className="study-home">
      <section className="study-hero" aria-labelledby="study-hero-heading">
        <div className="study-hero-art" aria-hidden="true">
          <div className="study-hero-orbit" /><div className="study-hero-orbit study-hero-orbit-inner" />
          <span className="study-hero-spark study-hero-spark-one">+</span><span className="study-hero-spark study-hero-spark-two">+</span>
        </div>
        <div className="study-hero-copy">
          <p className="study-hero-label"><span />你的考研学习空间</p>
          <h1 id="study-hero-heading">把知识连起来，<br />把每一步学扎实。</h1>
          <p className="study-hero-description">从一道题回到一个知识点，再把它变成自己的答案。<br className="study-desktop-break" />整理、练习、回顾，在这里接着学。</p>
          <div className="study-hero-actions">
            <Link href="/docs/math/" className="study-button study-button-primary">开始学习<ArrowRight aria-hidden="true" /></Link>
            <a href="#subjects" className="study-button study-button-secondary">浏览学习模块<ChevronRight aria-hidden="true" /></a>
          </div>
        </div>
        <section className="study-preview" aria-label="学习内容预览">
          <div className="study-preview-toolbar">
            <span className="study-window-dots" aria-hidden="true"><i /><i /><i /></span>
            <span><BookOpen aria-hidden="true" />考研学习 / 学习空间</span>
            <span className="study-preview-hint">内容预览</span>
          </div>
          <StudyPreviewTabs>
            <aside className="study-preview-sidebar">
              <p>我的知识库</p>
              <TabsList className="study-preview-tabs" aria-label="预览学习科目">
                {homeSubjects.map((subject) => {
                  const Icon = subjectIcons[subject.icon];
                  return <TabsTrigger key={subject.id} value={subject.id} aria-label={subject.name} className="study-preview-tab"><Icon aria-hidden="true" /><span className="study-tab-name">{subject.name}</span><span className="study-tab-short">{subject.shortName}</span><ChevronRight aria-hidden="true" /></TabsTrigger>;
                })}
              </TabsList>
              <div className="study-preview-sidebar-note"><span className="study-brand-mark" aria-hidden="true"><BookOpen /></span><span>学过的，<br />慢慢成为自己的。</span></div>
            </aside>
            {homeSubjects.map((subject) => (
              <TabsContent key={subject.id} value={subject.id} className="study-preview-content">
                <div className="study-preview-breadcrumb">学习空间<ChevronRight aria-hidden="true" />{subject.name}</div>
                <div className="study-preview-title-row"><h2>{subject.previewTitle}</h2><Link href={subject.href} aria-label={`进入${subject.name}`}><ArrowUpRight aria-hidden="true" /></Link></div>
                <p className="study-preview-description">{subject.previewDescription}</p>
                <div className="study-preview-topic-list">{subject.topics.map((topic) => <span key={topic}><Check aria-hidden="true" />{topic}</span>)}</div>
                <div className="study-preview-sections">
                  {subject.sections.map((section) => <Link key={section.title} href={section.href} className="study-preview-section"><FileText aria-hidden="true" /><span><strong>{section.title}</strong><span>{section.description}</span></span><ChevronRight aria-hidden="true" /></Link>)}
                </div>
                <div className="study-preview-bottom"><span>{subject.formula ?? '理解一个概念，再向前一步。'}</span><Link href={subject.href}>打开{subject.shortName}<ArrowRight aria-hidden="true" /></Link></div>
              </TabsContent>
            ))}
          </StudyPreviewTabs>
        </section>
      </section>
      <section id="subjects" className="study-subjects" aria-labelledby="study-subjects-heading">
        <div className="study-section-heading"><div><p>从这里开始</p><h2 id="study-subjects-heading">每一门，都有清晰的入口。</h2></div><p>找到正在学的内容，<br />按自己的节奏往下走。</p></div>
        <nav className="study-subject-grid" aria-label="学习模块">
          {homeSubjects.map((subject) => {
            const Icon = subjectIcons[subject.icon];
            return <Link key={subject.id} href={subject.href} className="study-subject"><div className="study-subject-top"><Icon aria-hidden="true" /><ArrowUpRight aria-hidden="true" /></div><h3>{subject.name}</h3><p>{subject.description}</p><span className="study-subject-topics">{subject.topics.join(' / ')}</span></Link>;
          })}
        </nav>
      </section>
      <StudyRhythm />
      <section className="study-home-closing" aria-labelledby="study-closing-heading">
        <BookOpen aria-hidden="true" /><h2 id="study-closing-heading">今天，就从下一页开始。</h2><p>不用一次走完。把眼前这一节，学成自己的。</p>
        <Link href="/docs/math/" className="study-button study-button-primary">打开学习资料<ArrowRight aria-hidden="true" /></Link>
      </section>
      <footer className="study-home-footer">
        <span><BookOpen aria-hidden="true" />考研学习</span>
        <nav aria-label="更多资源"><Link href="/blog/">学习笔记<ArrowUpRight aria-hidden="true" /></Link><a href="/llms.txt">全部文档目录<ArrowUpRight aria-hidden="true" /></a><a href="https://fumadocs.dev" target="_blank" rel="noreferrer">Built with Fumadocs<ArrowUpRight aria-hidden="true" /></a></nav>
      </footer>
    </div>
  );
}
