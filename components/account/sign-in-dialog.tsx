'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useAccount } from './account-provider';

const RESEND_SECONDS = 60;

/** Email sign-in. The first successful sign-in also creates the account. */
export function SignInDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const account = useAccount();
  const id = useId();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (account.phase === 'signed-in') onOpenChange(false);
  }, [account.phase, onOpenChange]);

  useEffect(() => {
    if (!open) { setCode(''); setSentTo(null); setFailure(null); }
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function run(task: () => Promise<void>) {
    setBusy(true); setFailure(null);
    try { await task(); } catch (error) { setFailure(error instanceof Error ? error.message : '操作失败，请重试'); }
    finally { setBusy(false); }
  }

  function sendLink(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await account.sendEmailLink(email);
      setSentTo(email.trim()); setCooldown(RESEND_SECONDS);
    });
  }

  function verify(event: FormEvent) {
    event.preventDefault();
    void run(() => account.verifyEmailCode(sentTo ?? email, code));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>登录 / 注册</DialogTitle>
          <DialogDescription>输入邮箱，我们会发送登录邮件。首次登录会自动创建账号。</DialogDescription>
        </DialogHeader>
        <form onSubmit={sendLink}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-email`}>邮箱</FieldLabel>
              <Input id={`${id}-email`} type="email" autoComplete="email" required placeholder="you@example.com"
                value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} />
            </Field>
            <Button type="submit" disabled={busy || cooldown > 0 || !email.trim()}>
              {cooldown > 0 ? `${cooldown} 秒后可重新发送` : sentTo ? '重新发送登录邮件' : '发送登录邮件'}
            </Button>
          </FieldGroup>
        </form>
        {sentTo ? (
          <form onSubmit={verify}>
            <FieldGroup>
              <p role="status" className="text-sm text-muted-foreground">
                已向 {sentTo} 发送邮件，打开其中的链接即可登录。
              </p>
              <Field>
                <FieldLabel htmlFor={`${id}-code`}>邮件中的验证码（可选）</FieldLabel>
                <Input id={`${id}-code`} inputMode="numeric" autoComplete="one-time-code"
                  value={code} onChange={(event) => setCode(event.target.value)} disabled={busy} />
                <FieldDescription>邮件包含数字验证码时，可在此输入代替点击链接。</FieldDescription>
              </Field>
              <Button type="submit" variant="outline" disabled={busy || !code.trim()}>验证并登录</Button>
            </FieldGroup>
          </form>
        ) : null}
        {failure ? <FieldError>{failure}</FieldError> : null}
      </DialogContent>
    </Dialog>
  );
}
