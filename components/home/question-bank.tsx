import type { CSSProperties } from 'react';
import { IntentLink as Link } from '@/components/intent-link';
import { BANK_BUBBLE_UNIT } from '@/lib/home/content';
import type { BankModule } from '@/lib/home/types';
import home from './home.module.css';
import styles from './question-bank.module.css';
import { RevealOnView } from './reveal-on-view';

const numberFormat = new Intl.NumberFormat('zh-CN');

/** A strip of answer-sheet boxes, one per BANK_BUBBLE_UNIT questions; the last box is shaded to its share. */
function Cells({ questions, row }: { questions: number; row: number }) {
  const count = Math.ceil(questions / BANK_BUBBLE_UNIT);
  const remainder = questions % BANK_BUBBLE_UNIT;
  return (
    <span className={styles.cells} role="img" aria-label={`${numberFormat.format(questions)} 道题`}>
      {Array.from({ length: count }, (_, index) => {
        const partial = index === count - 1 && remainder > 0;
        const style = {
          '--delay': `${row * 140 + index * 9}ms`,
          ...(partial ? { '--fill': Math.max(0.12, remainder / BANK_BUBBLE_UNIT) } : null),
        } as CSSProperties;
        return <i key={index} className={styles.cell} data-partial={partial ? '' : undefined} style={style} />;
      })}
    </span>
  );
}

export function QuestionBank({ modules }: { modules: BankModule[] }) {
  return (
    <section id="bank" className={styles.bank} aria-labelledby="bank-title">
      <div className={home.sectionHead}>
        <h2 id="bank-title" className={home.sectionTitle}>
          题库
        </h2>
        <p className={home.sectionNote}>
          每个方格代表 {BANK_BUBBLE_UNIT} 道题，涂满的部分就是题量。点科目名称或下面的分册，直接进入。
        </p>
      </div>
      <RevealOnView className={styles.rows}>
        {modules.map((module, row) => (
          <article key={module.href} className={styles.row} aria-labelledby={`bank-${row}`}>
            <header className={styles.rowHead}>
              <h3 id={`bank-${row}`} className={styles.name}>
                <Link href={module.href}>{module.name}</Link>
              </h3>
              <p className={styles.count}>
                {module.questions > 0 ? (
                  <>
                    <strong>{numberFormat.format(module.questions)}</strong> 道题
                  </>
                ) : (
                  <>
                    <strong>{numberFormat.format(module.pages)}</strong> 篇题解
                  </>
                )}
              </p>
            </header>
            <div className={styles.rowBody}>
              {module.questions > 0 ? (
                <Cells questions={module.questions} row={row} />
              ) : (
                <p className={styles.noCells}>题解与笔记，按专题阅读，没有需要判分的题目。</p>
              )}
              {module.collections.length > 0 && (
                <ul className={styles.collections} aria-label={`${module.name}分册`}>
                  {module.collections.map((collection) => (
                    <li key={collection.href}>
                      <Link href={collection.href}>
                        {collection.name}
                        <span>
                          {collection.questions > 0
                            ? numberFormat.format(collection.questions)
                            : `${numberFormat.format(collection.pages)} 篇`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        ))}
      </RevealOnView>
    </section>
  );
}
