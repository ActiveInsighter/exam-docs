export function accountErrorMessage(error: unknown): string {
  const failure = error as { code?: string; status?: number; message?: string } | null;
  const message = failure?.message ?? '';
  if (/failed to fetch|fetch failed|networkerror|load failed|network request failed/i.test(message)) {
    return '无法连接登录服务，请检查网络后重试。';
  }
  if (failure?.code === 'over_email_send_rate_limit' || failure?.code === 'over_request_rate_limit' || failure?.status === 429) {
    return '登录邮件发送过于频繁，请稍后重试。';
  }
  if (failure?.code === 'email_address_not_authorized' || /email address not authorized/i.test(message)) {
    return '登录邮件服务尚未开放此邮箱，请联系站点管理员。';
  }
  if (failure?.code === 'otp_expired') return '登录链接或验证码已失效，请重新发送登录邮件。';
  return message || '操作失败，请重试。';
}
