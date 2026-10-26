/**
 * Explains a storage failure without exposing the answer or account details.
 * `queuedForCloud`: the answer was committed by a signed-in reader and is on
 * its way to the cloud even though this browser could not store it.
 */
export function questionStorageError(error: unknown, queuedForCloud = false): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'QuotaExceededError') {
    return queuedForCloud
      ? '浏览器存储空间不足，答案未能存到本机，正在同步到云端。释放空间后可重试保存。'
      : '浏览器存储空间不足，答案尚未保存。请保留当前答案，释放空间后重试保存。';
  }
  if (queuedForCloud) return '答案未能存到本机，正在同步到云端。可稍后重试保存。';
  if (name === 'SecurityError' || name === 'NotAllowedError') return '浏览器阻止了本机存储，答案尚未保存。请允许此网站使用存储后重试保存。';
  if (name === 'InvalidStateError' || name === 'AbortError' || name === 'UnknownError') {
    return '本机数据库连接中断，答案尚未保存。请保留当前答案并重试保存。';
  }
  return '答案未能保存到本机，请保留当前答案并重试保存。';
}
