import { LogInIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { accountInitials, accountLabel, type AccountPhase } from '@/lib/account/types';
import type { AccountMenuSection } from '../menu-section';

const subtitle: Record<AccountPhase, string> = {
  'signed-in': '已登录',
  guest: '登录后可在多台设备同步答题记录',
  loading: '正在读取登录状态…',
  disabled: '云端账号尚未启用，记录保存在本机',
};

export const identitySection: AccountMenuSection = {
  id: 'identity',
  order: 0,
  audience: 'all',
  render({ account, openSignIn, status }) {
    const signedIn = account.phase === 'signed-in' ? account.user : null;
    return (
      <DropdownMenuGroup>
        <div className="flex items-center gap-3 px-1.5 pt-1 pb-2">
          <Avatar size="lg">
            <AvatarFallback className={signedIn ? 'bg-primary/10 font-medium text-primary' : undefined}>
              {signedIn ? accountInitials(signedIn) : '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-medium" title={signedIn ? accountLabel(signedIn) : undefined}>
              {signedIn ? accountLabel(signedIn) : '未登录'}
            </span>
            <span className="truncate text-xs text-muted-foreground">{status ?? subtitle[account.phase]}</span>
          </div>
        </div>
        {account.phase === 'signed-in' ? null : (
          <DropdownMenuItem
            disabled={account.phase !== 'guest'}
            onClick={openSignIn}
            className="justify-center bg-primary py-1.5 font-medium text-primary-foreground focus:bg-primary/90 focus:text-primary-foreground not-data-[variant=destructive]:focus:**:text-primary-foreground"
          >
            <LogInIcon />登录 / 注册
          </DropdownMenuItem>
        )}
      </DropdownMenuGroup>
    );
  },
};
