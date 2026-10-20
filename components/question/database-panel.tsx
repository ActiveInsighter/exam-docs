'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { CloudIcon, DownloadIcon, RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { getQuestionSupabaseClient, questionCloudConfigured } from '@/lib/question-supabase';
import type { AnswerState, QuestionConflict, QuestionSyncStatus } from '@/lib/question-store/types';
import { useQuestionDatabase } from './database-provider';

const LOCAL: QuestionSyncStatus = { phase: 'local', pending: 0, conflicts: 0, lastSyncedAt: null, error: null };

function describeAnswer(state: AnswerState) {
  const answer = state.selected.length ? state.selected.join('、') : state.values.join('；');
  return `${state.submitted ? '已提交' : '草稿'}：${answer || '尚未作答'}`;
}

export function QuestionDatabasePanel() {
  const context = useQuestionDatabase();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(LOCAL);
  const [counts, setCounts] = useState({ records: 0, attempts: 0 });
  const [conflicts, setConflicts] = useState<QuestionConflict[]>([]);
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const formId = useId();
  const database = context?.database;
  const namespace = context?.namespace ?? 'guest';
  const engine = context?.engine;

  useEffect(() => {
    setStatus(engine?.status ?? LOCAL);
    return engine?.subscribe(setStatus);
  }, [engine]);

  useEffect(() => {
    if (!database || !open) return;
    let disposed = false;
    const refresh = async () => {
      try {
        const [records, attempts, pendingConflicts] = await Promise.all([
          database.list(namespace), database.listAttempts(namespace), database.listConflicts(namespace),
        ]);
        if (!disposed) { setCounts({ records: records.length, attempts: attempts.length }); setConflicts(pendingConflicts); }
      } catch { if (!disposed) setFailure('无法读取本机答题记录'); }
    };
    void refresh();
    const unsubscribe = database.subscribe((change) => { if (change.namespace === namespace) void refresh(); });
    return () => { disposed = true; unsubscribe(); };
  }, [database, namespace, open]);

  useEffect(() => {
    setMessage(null); setFailure(null); setToken(''); setSent(false);
  }, [namespace]);

  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(false), 60_000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function action(task: () => Promise<void>) {
    setBusy(true); setFailure(null); setMessage(null);
    try { await task(); } catch (error) { setFailure(error instanceof Error ? error.message : '操作失败，请重试'); }
    finally { setBusy(false); }
  }

  function sendLink(event: FormEvent) {
    event.preventDefault();
    void action(async () => {
      const client = await getQuestionSupabaseClient();
      const { error } = await client.auth.signInWithOtp({ email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` } });
      if (error) throw error;
      setSent(true); setCooldown(true);
      setMessage('登录邮件已发送，请打开邮件中的链接。登录后可在多台设备同步。');
    });
  }

  async function exportBackup() {
    if (!database) return;
    const [records, attempts, savedConflicts] = await Promise.all([
      database.list(namespace), database.listAttempts(namespace), database.listConflicts(namespace, true),
    ]);
    const blob = new Blob([JSON.stringify({ format: 'exam-docs-question-backup', version: 1,
      exportedAt: new Date().toISOString(), namespace, records, attempts, conflicts: savedConflicts }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `exam-docs-answers-${new Date().toISOString().slice(0, 10)}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('已导出当前身份的答题记录和历史。');
  }

  if (!context) return null;
  const label = !context.ready ? '正在读取答题记录' : context.error && !database ? '答题存储异常'
    : status.conflicts ? `${status.conflicts} 项同步冲突` : status.phase === 'syncing' ? '正在同步'
    : status.phase === 'offline' ? '离线保存中' : status.phase === 'error' ? '同步待重试'
    : context.user ? (!engine ? '正在连接云端' : status.pending ? `${status.pending} 项待同步` : '答题记录已同步') : context.cachedAccount ? '答题记录 · 本机缓存' : '答题记录 · 本机';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        <CloudIcon data-icon="inline-start" />{label}
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>答题记录</DialogTitle>
          <DialogDescription>答案先保存在本机，登录后自动同步。不同设备同时修改时，会保留两份答案供你选择。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{counts.records} 道题的当前记录 · {counts.attempts} 次提交历史</p>
          {context.error ? <p role="alert" className="text-sm text-destructive">{context.error}</p> : null}
          {!context.user && context.cachedAccount ? <p className="text-sm text-muted-foreground">正在使用 {context.cachedAccount.email ?? context.cachedAccount.id} 的本机缓存。重新登录后继续同步。</p> : null}
          {context.user ? (
            <div className="flex flex-col gap-3">
              <p className="break-all text-sm">当前账号：{context.user.email ?? context.user.id}</p>
              <p className="text-sm text-muted-foreground" role="status">{label}{status.lastSyncedAt ? ` · 最近 ${new Date(status.lastSyncedAt).toLocaleTimeString()}` : ''}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy || !engine || status.phase === 'syncing'} onClick={() => void action(async () => { await engine?.sync(); })}>
                  <RefreshCwIcon data-icon="inline-start" />立即同步
                </Button>
                <Button size="sm" variant="outline" disabled={busy || !database} onClick={() => void action(async () => {
                  const result = await database!.importGuest(namespace);
                  setMessage(`已导入 ${result.records} 道题、${result.attempts} 次提交历史。本机原记录仍然保留。`);
                })}>导入未登录时的本机记录</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void action(async () => {
                  const { error } = await (await getQuestionSupabaseClient()).auth.signOut({ scope: 'local' });
                  if (error) throw error;
                })}>退出登录</Button>
              </div>
              <p className="text-xs text-muted-foreground">退出后切回未登录记录；账号的本机缓存仍留在当前浏览器。</p>
            </div>
          ) : questionCloudConfigured ? (
            <form onSubmit={sendLink} className="flex flex-col gap-3">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`${formId}-email`}>登录邮箱</FieldLabel>
                  <Input id={`${formId}-email`} type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" disabled={busy} />
                </Field>
              </FieldGroup>
              <Button type="submit" disabled={busy || cooldown || !context.ready}>{cooldown ? '邮件已发送，请稍后重试' : '发送登录邮件'}</Button>
              {sent ? <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">邮件中提供了验证码？</summary>
                <FieldGroup className="mt-3">
                  <Field>
                    <FieldLabel htmlFor={`${formId}-token`}>邮箱验证码</FieldLabel>
                    <Input id={`${formId}-token`} inputMode="numeric" autoComplete="one-time-code" value={token} onChange={(event) => setToken(event.target.value)} />
                  </Field>
                  <Button type="button" disabled={busy || !token.trim()} onClick={() => void action(async () => {
                    const { error } = await (await getQuestionSupabaseClient()).auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
                    if (error) throw error;
                  })}>验证并登录</Button>
                </FieldGroup>
              </details> : null}
            </form>
          ) : <p className="text-sm text-muted-foreground">当前使用本机存储。刷新或重开页面后可以继续作答。</p>}
          <Separator />
          <Button variant="outline" size="sm" disabled={busy || !database} onClick={() => void action(exportBackup)}>
            <DownloadIcon data-icon="inline-start" />导出本机备份
          </Button>
          <p className="text-xs text-muted-foreground">浏览器清理网站数据会删除本机记录。尚未同步的答案可先导出备份。</p>
          {conflicts.length ? <div className="flex flex-col gap-3">
            <p className="font-medium">选择要继续使用的答案</p>
            <ul className="flex flex-col gap-4">
              {conflicts.map((conflict) => <li key={conflict.conflictId} className="flex flex-col gap-2 text-sm">
                <a href={`${conflict.documentPath}#question-${encodeURIComponent(conflict.questionId)}`} className="break-all underline underline-offset-4">{conflict.questionId}</a>
                <p className="break-words">本机 {describeAnswer(conflict.localState)}</p>
                <p className="break-words">云端 {describeAnswer(conflict.remote.state)}</p>
                <div className="flex gap-2">
                  {(['local', 'remote'] as const).map((choice) => <Button key={choice} size="sm" variant="outline" disabled={busy} onClick={() => void action(async () => {
                    await database!.resolveConflict(namespace, conflict.conflictId, choice);
                    setMessage('已保留所选答案，两边的提交历史仍可导出。');
                  })}>{choice === 'local' ? '使用本机答案' : '使用云端答案'}</Button>)}
                </div>
              </li>)}
            </ul>
          </div> : null}
          {status.error ? <p role="alert" className="break-words text-sm text-destructive">{status.error}</p> : null}
          {failure ? <p role="alert" className="break-words text-sm text-destructive">{failure}</p> : null}
          {message ? <p role="status" className="text-sm">{message}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
