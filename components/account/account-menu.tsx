'use client';

import { Fragment, useState } from 'react';
import { CircleUserRoundIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { accountInitials } from '@/lib/account/types';
import { useAccount } from './account-provider';
import type { AccountMenuSection } from './menu-section';
import { accountMenuSections } from './sections';
import { SignInDialog } from './sign-in-dialog';

const sections: readonly AccountMenuSection[] = [...accountMenuSections].sort((a, b) => a.order - b.order);

/**
 * Header account button. It is a self-contained component: place it in any
 * navigation slot (see lib/layout.shared.tsx and study-docs-layout.tsx) and it
 * brings its own provider-backed state, menu and dialog.
 */
export function AccountMenu({ className }: { className?: string }) {
  const account = useAccount();
  const [signInOpen, setSignInOpen] = useState(false);
  const signedIn = account.phase === 'signed-in';
  const visible = sections.filter((section) => section.audience === 'all' || section.audience === (signedIn ? 'signed-in' : 'guest'));
  const context = { account, openSignIn: () => setSignInOpen(true) };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="账号" className={className} />}>
          {signedIn ? (
            <Avatar size="sm"><AvatarFallback>{accountInitials(account.user)}</AvatarFallback></Avatar>
          ) : (
            <CircleUserRoundIcon />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-64">
          {visible.map((section, index) => (
            <Fragment key={section.id}>
              {index > 0 ? <DropdownMenuSeparator /> : null}
              {section.render(context)}
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
    </>
  );
}
