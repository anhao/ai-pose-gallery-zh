import { t } from '@/i18n'

/** Only our proxy's fixed messages; upstream diagnostics stay verbatim. */
export function proxyErrorMessage(message: string): string {
  const messages: Record<string, string> = {
    'Method Not Allowed': t('代理不支持此请求方法'),
    'Missing x-target-url header': t('代理请求缺少 x-target-url 请求头'),
    'Invalid x-target-url header': t('代理请求的 x-target-url 请求头无效'),
    'Target origin not allowed': t('代理不允许访问此目标来源'),
    'Upstream redirect blocked': t('代理已阻止上游重定向'),
    'Upstream proxy error': t('上游代理错误'),
    'Proxy request failed': t('代理请求失败'),
  }
  let detail = message
  try {
    const parsed = JSON.parse(message)
    if (typeof parsed?.error?.message === 'string') detail = parsed.error.message
  } catch { /* A plain-text diagnostic is valid too. */ }
  const limit = /^Request body exceeds (\d+) bytes$/.exec(detail)
  return Object.hasOwn(messages, detail) ? messages[detail] : limit ? t('代理请求体超过 {n} 字节', { n: limit[1] }) : message
}
