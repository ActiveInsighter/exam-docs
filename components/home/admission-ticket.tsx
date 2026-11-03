'use client';

import { examNotices, examSchedule } from '@/lib/home/content';
import styles from './admission-ticket.module.css';
import { useCountdown } from './use-countdown';

const pad = (value: number) => String(value).padStart(2, '0');

/*
 * The exam countdown, laid out as an admission ticket (准考证): exam name,
 * time, a photo box under a red seal, and the 考生须知 list carrying the
 * encouragement lines.
 */
export function AdmissionTicket() {
  const left = useCountdown(examSchedule.startsAt);

  return (
    <section className={styles.ticket} aria-labelledby="ticket-title">
      <header className={styles.head}>
        <p className={styles.exam}>{examSchedule.title}</p>
        <h2 id="ticket-title" className={styles.title}>
          准考证
        </h2>
      </header>

      <div className={styles.body}>
        <dl className={styles.fields}>
          <div>
            <dt>初试时间</dt>
            <dd>
              {examSchedule.dateLabel} {examSchedule.timeLabel}
            </dd>
          </div>
          <div>
            <dt>距离开考</dt>
            <dd className={styles.countdown} aria-live="off">
              {left === null ? (
                <span className={styles.days}>--</span>
              ) : left.done ? (
                <span className={styles.doneText}>考试已经开始，祝你顺利</span>
              ) : (
                <>
                  <span className={styles.days}>{left.days}</span>
                  <span className={styles.unit}>天</span>
                  <span className={styles.clock}>
                    {pad(left.hours)}:{pad(left.minutes)}:{pad(left.seconds)}
                  </span>
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>考生</dt>
            <dd>正在复习的你</dd>
          </div>
        </dl>
        <div className={styles.photo} aria-hidden="true">
          <span>照片</span>
          <svg className={styles.seal} viewBox="0 0 100 100">
            <defs>
              <path id="ticket-seal-arc" d="M 18 52 A 32 32 0 1 1 82 52" />
            </defs>
            <circle cx="50" cy="50" r="45" />
            <text className={styles.sealText}>
              <textPath href="#ticket-seal-arc" startOffset="50%" textAnchor="middle">
                考研学习复习专用
              </textPath>
            </text>
            <text className={styles.sealStar} x="50" y="62" textAnchor="middle">
              ★
            </text>
          </svg>
        </div>
      </div>

      <div className={styles.notices}>
        <h3>考生须知</h3>
        <ol>
          {examNotices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ol>
      </div>

      <footer className={styles.foot}>
        <span className={styles.barcode} aria-hidden="true" />
        <p>{examSchedule.note}</p>
      </footer>
    </section>
  );
}
