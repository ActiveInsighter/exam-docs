/** Explain the storage failure without exposing the answer or account details. */
export function questionStorageError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'QuotaExceededError') return '浏览器存储空间不足，答案尚未保存。请保留当前答案，释放空间后重试保存。';
  if (name === 'SecurityError' || name === 'NotAllowedError') return '浏览器阻止了本机存储，答案尚未保存。请允许此网站使用存储后重试保存。';
  if (name === 'InvalidStateError' || name === 'AbortError' || name === 'UnknownError') {
    return '本机数据库连接中断，答案尚未保存。请保留当前答案并重试保存。';
  }
  return '答案未能保存到本机，请保留当前答案并重试保存。';
}
