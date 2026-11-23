import type { GptParams } from '@/types/gallery'

export function isGptFreeImageModel(model: string): boolean {
  return /^gptfree-pool\/gpt-image(?:-|$)/i.test(model.trim())
}

export function resolveGptImageEndpoint(model: string, endpoint: GptParams['endpointMode']): GptParams['endpointMode'] {
  // The pool advertises Chat in its model metadata, but rejects image requests there.
  return isGptFreeImageModel(model) && (endpoint === 'chat' || endpoint === 'responses')
    ? 'images_edits'
    : endpoint
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

export function toMagpieProxyUrl(targetUrl: string, pageUrl: string): string | null {
  try {
    const page = new URL(pageUrl)
    if (!LOOPBACK_HOSTS.has(page.hostname) || !['http:', 'https:'].includes(page.protocol)) return null
    if (/^\/magpie\/v1(?:\/|$)/.test(targetUrl)) return targetUrl

    const target = new URL(targetUrl)
    if (target.protocol !== 'http:' || !LOOPBACK_HOSTS.has(target.hostname) || target.port !== '3425'
      || target.username || target.password || !/^\/v1(?:\/|$)/.test(target.pathname)) return null
    return `/magpie${target.pathname}${target.search}`
  } catch {
    return null
  }
}
