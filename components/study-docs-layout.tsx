'use client';

import type { ComponentProps } from 'react';
import { DocsLayout, useSpaciousLayout, type DocsLayoutProps } from 'fumadocs-ui/layouts/spacious';
import { HeaderActions } from 'fumadocs-ui/layouts/spacious/slots/actions';
import { SidebarTrigger } from 'fumadocs-ui/components/sidebar/base';
import { SidebarIcon } from 'lucide-react';
import { AccountMenu } from '@/components/account';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// The Fumadocs `actions` slot is the top-right toolbar (GitHub, options menu).
// The account button is placed in front of the stock toolbar instead of
// patching it, so a Fumadocs upgrade keeps working unchanged.
function StudyHeaderActions({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <AccountMenu />
      <HeaderActions {...props} />
    </div>
  );
}

// Keep sign-in reachable on phones, where Spacious hides its desktop actions.
function StudyMobileHeader({ className, ...props }: ComponentProps<'div'>) {
  const { slots } = useSpaciousLayout();
  return (
    <header id="nd-subnav" className={cn('sticky top-(--fd-banner-height,0px) z-30 [grid-area:header] flex h-(--fd-header-height) items-center gap-1 bg-fd-card ps-4 pe-2.5 md:hidden', className)} {...props}>
      <slots.navTitle className="me-auto inline-flex min-w-0 items-center gap-2.5 font-semibold" />
      <AccountMenu />
      {slots.searchTrigger ? <slots.searchTrigger.sm hideIfDisabled className="p-2" /> : null}
      <SidebarTrigger aria-label="打开导航" className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}>
        <SidebarIcon />
      </SidebarTrigger>
    </header>
  );
}

// Spacious layout (the one fumadocs.dev uses): `root: true` folders become the
// sidebar tab dropdown.
export function StudyDocsLayout(props: DocsLayoutProps) {
  return <DocsLayout {...props} sidebar={{ defaultOpenLevel: 0 }} slots={{ header: StudyMobileHeader, actions: StudyHeaderActions, ...props.slots }} />;
}
