import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenuGroup } from '@/components/ui/dropdown-menu';
import { accountInitials, accountLabel } from '@/lib/account/types';
import type { AccountMenuSection } from '../menu-section';

export const identitySection: AccountMenuSection = {
  id: 'identity',
  order: 0,
  audience: 'all',
  render({ account }) {
    const signedIn = account.phase === 'signed-in' ? account.user : null;
    return (
      <DropdownMenuGroup>
        <div className="flex items-center gap-3 px-1.5 py-1.5">
          <Avatar>
            <AvatarFallback>{signedIn ? accountInitials(signedIn) : '?'}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{signedIn ? accountLabel(signedIn) : '未登录'}</span>
            <span className="truncate text-xs text-muted-foreground">
              {signedIn ? '已登录' : account.phase === 'disabled' ? '云端账号尚未启用' : '登录后可在多台设备使用'}
            </span>
          </div>
        </div>
      </DropdownMenuGroup>
    );
  },
};
