import { SettingsPage } from '@/components/settings/settings-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '设置',
  description: '答题记录与来源、账号同步、收藏与标签、外观和本机数据。',
  alternates: { canonical: '/settings' },
  robots: { index: false },
};

export default function Page() {
  return <SettingsPage />;
}
