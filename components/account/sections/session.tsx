import { LogInIcon, LogOutIcon } from 'lucide-react';
import { DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { AccountMenuSection } from '../menu-section';

export const sessionSection: AccountMenuSection = {
  id: 'session',
  order: 1000,
  audience: 'all',
  render({ account, openSignIn }) {
    return (
      <DropdownMenuGroup>
        {account.phase === 'signed-in' ? (
          <DropdownMenuItem onClick={() => { void account.signOut().catch(() => undefined); }}>
            <LogOutIcon />退出登录
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled={account.phase !== 'guest'} onClick={openSignIn}>
            <LogInIcon />登录 / 注册
          </DropdownMenuItem>
        )}
      </DropdownMenuGroup>
    );
  },
};
