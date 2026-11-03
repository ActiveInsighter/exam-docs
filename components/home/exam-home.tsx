import { IntentLink as Link } from '@/components/intent-link';
import { getExamHomeData } from '@/lib/home/catalog.server';
import { siteConfig } from '@/lib/site-config';
import { AdmissionTicket } from './admission-ticket';
import { Hero } from './hero';
import home from './home.module.css';
import { ProgressCard } from './progress-card';
import { QuestionBank } from './question-bank';

/*
 * Home page, composed on the server from build-time data:
 *
 *   Hero          headline with the real question total + a playable answer sheet
 *   QuestionBank  every module and collection, sized in answer-sheet boxes
 *   ProgressCard  the reader's own records (client, local database)
 *   AdmissionTicket  exam countdown (client clock)
 */
export function ExamHome() {
  const data = getExamHomeData();
  const start = data.modules.find((module) => module.questions > 0)?.href ?? data.modules[0]?.href ?? '/docs/';

  return (
    <div className={home.page}>
      <Hero data={data} />
      <QuestionBank modules={data.modules} />
      <div className={home.split}>
        <ProgressCard startHref={start} />
        <AdmissionTicket />
      </div>
      <footer className={home.footer}>
        <span className={home.footerBrand}>{siteConfig.name}</span>
        <nav aria-label="更多资源">
          <Link href="/docs/question-types/">题型示例</Link>
          <Link href="/blog/">博客</Link>
          <a href="/llms.txt">全部文档目录</a>
          <a href={siteConfig.repository.url} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </footer>
    </div>
  );
}
