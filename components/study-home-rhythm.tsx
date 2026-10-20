'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

const estimatedExamTime = new Date('2026-12-19T08:30:00+08:00').getTime();
const reminders = [
  '把今天的一点弄懂，就是向前走了一步。',
  '先完成眼前这一题，再慢慢走向下一个目标。',
  '复习不必每天完美，愿你每天都有一点收获。',
  '累了就休息一下，回来再继续也来得及。',
  '把错题变成理解，把理解留给下一次尝试。',
];

function StudyCountdown() {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    const update = () => {
      setRemainingSeconds(Math.max(0, Math.floor((estimatedExamTime - Date.now()) / 1000)));
    };

    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const units = [
    { label: '天', value: remainingSeconds === null ? null : Math.floor(remainingSeconds / 86400) },
    { label: '时', value: remainingSeconds === null ? null : Math.floor((remainingSeconds % 86400) / 3600) },
    { label: '分', value: remainingSeconds === null ? null : Math.floor((remainingSeconds % 3600) / 60) },
    { label: '秒', value: remainingSeconds === null ? null : remainingSeconds % 60 },
  ];

  return (
    <dl className="study-rhythm-time">
      {units.map(({ label, value }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value === null ? '--' : String(value).padStart(2, '0')}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StudyRhythm() {
  const [reminderIndex, setReminderIndex] = useState(0);

  return (
    <section className="study-rhythm" aria-labelledby="study-rhythm-heading">
      <div className="study-rhythm-countdown">
        <h2 id="study-rhythm-heading">让每一天，都有一点进步。</h2>
        <StudyCountdown />
        <p className="study-rhythm-note">
          按 2026 年 12 月 19 日 08:30（北京时间）估算，具体考试安排以官方公告为准。
        </p>
      </div>
      <div>
        <div className="study-rhythm-reminder">
          <p>今日提醒</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="study-rhythm-change"
            onClick={() => setReminderIndex((index) => (index + 1) % reminders.length)}
            aria-label="换一句学习提醒"
          >
            换一句
          </Button>
        </div>
        <p className="study-rhythm-quote" aria-live="polite" aria-atomic="true">
          {reminders[reminderIndex]}
        </p>
      </div>
    </section>
  );
}
