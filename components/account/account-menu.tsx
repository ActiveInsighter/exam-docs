'use client';

import { Fragment, useMemo, useState } from 'react';
import { CircleUserRoundIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { accountInitials, accountLabel } from '@/lib/account/types';
import { cn } from '@/lib/utils';
import { useAccount } from './account-provider';
import { useRegisteredAccountSections } from './menu-registry';
import type { AccountMenuContext, AccountMenuSection } from './menu-section';
import { accountMenuSections } from './sections';
import { SignInDialog } from './sign-in-dialog';

/**
 * Header account button. It is a self-contained component: place it in any
 * navigation slot (see lib/layout.shared.tsx and study-docs-layout.tsx) and it
 * brings its own provider-backed state, menu and dialog. Feature sections
 * registered with useAccountMenuSection() appear between identity and session.
 */
export function AccountMenu({ className }: { className?: string }) {
  const account = useAccount();
  const registered = useRegisteredAccountSections();
  const [signInOpen, setSignInOpen] = useState(false);
  const signedIn = account.phase === 'signed-in';
  const sections = useMemo<readonly AccountMenuSection[]>(
    () => [...accountMenuSections, ...registered].sort((a, b) => a.order - b.order),
    [registered],
  );
  const visible = sections.filter((section) => section.audience === 'all' || section.audience === (signedIn ? 'signed-in' : 'guest'));
  const base: AccountMenuContext = { account, openSignIn: () => setSignInOpen(true) };
  const context: AccountMenuContext = { ...base, status: visible.find((section) => section.status)?.status?.(base) };
  const indicator = visible.find((section) => section.indicator)?.indicator?.(base);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={signedIn ? `账号：${accountLabel(account.user)}` : '账号与答题记录'} className={cn('relative', className)} />}
        >
          {signedIn ? (
            <Avatar size="sm"><AvatarFallback className="bg-primary/10 font-medium text-primary">{accountInitials(account.user)}</AvatarFallback></Avatar>
          ) : (
            <CircleUserRoundIcon />
          )}
          {indicator}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-72 max-w-[calc(100vw-1rem)] p-1.5">
          {visible.map((section, index) => (
            <Fragment key={section.id}>
              {index > 0 ? <DropdownMenuSeparator className="my-1.5" /> : null}
              {section.render(context)}
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
    </>
  );
}
