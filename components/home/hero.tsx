import { ArrowRight } from 'lucide-react';
import { IntentLink as Link } from '@/components/intent-link';
import type { ExamHomeData } from '@/lib/home/types';
import clsx from 'clsx';
import home from './home.module.css';
import styles from './hero.module.css';
import { TrialSheet } from './trial-sheet';

const numberFormat = new Intl.NumberFormat('zh-CN');

/** "数学、408、政治与英语" */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join('、')}与${names.at(-1)}`;
}

export function Hero({ data }: { data: ExamHomeData }) {
  const practiceModules = data.modules.filter((module) => module.questions > 0);
  const start = practiceModules[0]?.href ?? data.modules[0]?.href ?? '/docs/';

  return (
    <section className={styles.hero} aria-labelledby="home-title">
      {/* The header every national exam paper carries; a nod for anyone who has sat one. */}
      <p className={styles.paperHead} aria-hidden="true">
        <span>绝密</span>
        <span className={styles.star}>★</span>
        <span>启用前</span>
      </p>
      <div className={styles.grid}>
        <div className={styles.copy}>
          <h1 id="home-title" className={styles.title}>
            <span className={styles.count}>{numberFormat.format(data.totals.questions)}</span> 道题，
            <br />
            一道一道做明白。
          </h1>
          <p className={styles.lead}>
            {joinNames(practiceModules.map((module) => module.name))}的真题和练习都在这里。选完立刻判分，一键查看解答；作答记录先存在本机，登录后可多端同步。
          </p>
          <div className={styles.actions}>
            <Link href={start} className={clsx(home.button, home.buttonPrimary)}>
              开始做题
              <ArrowRight aria-hidden="true" />
            </Link>
            <a href="#bank" className={clsx(home.button, home.buttonGhost)}>
              查看题库
            </a>
          </div>
          <p className={styles.types}>
            支持单选、多选、判断、填空与解答题，数学填空自带公式键盘。
            <Link href="/docs/question-types/">看题型示例</Link>
          </p>
        </div>
        {data.questions.length > 0 && <TrialSheet questions={data.questions} />}
      </div>
    </section>
  );
}
