import { LogOutIcon } from 'lucide-react';
import { DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { AccountMenuSection } from '../menu-section';

export const sessionSection: AccountMenuSection = {
  id: 'session',
  order: 1000,
  audience: 'signed-in',
  render({ account }) {
    return (
      <DropdownMenuGroup>
        <DropdownMenuItem onClick={() => { void account.signOut().catch(() => undefined); }}>
          <LogOutIcon />退出登录
          <span className="ml-auto text-xs text-muted-foreground">本机记录保留</span>
        </DropdownMenuItem>
      </DropdownMenuGroup>
    );
  },
};
