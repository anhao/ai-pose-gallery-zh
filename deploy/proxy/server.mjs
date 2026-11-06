// 與 functions/api/proxy.ts 等價的 Node 版本（無相依套件），供 docker 部署使用
import http from 'node:http'
import { Readable } from 'node:stream'

const PORT = Number(process.env.PORT || 3000)
const FORWARD = ['content-type', 'authorization', 'x-goog-api-key', 'x-dashscope-async']
const MAX_BODY_BYTES = 10 * 1024 * 1024

const DEFAULT_ALLOWED_ORIGINS = [
  'https://dashscope.aliyuncs.com',
  'https://ark.cn-beijing.volces.com',
  'https://generativelanguage.googleapis.com',
  'https://api.openai.com',
]

function matchOriginRule(target, rawRule) {
  const rule = rawRule.trim()
  if (!rule) return false
  if (rule === '*') return true

  const wildcardMatch = rule.match(/^(?:(https?):\/\/)?\*\.([a-z0-9.-]+)(?::(\d+))?(?:\/.*)?$/i)
  if (wildcardMatch) {
    const [, proto, baseHost, port] = wildcardMatch
    if (proto && `${proto.toLowerCase()}:` !== target.protocol) return false
    if ((port || '') !== target.port) return false
    const host = target.hostname.toLowerCase()
    const suffix = `.${baseHost.toLowerCase().replace(/^\.+|\.+$/g, '')}`
    return host.endsWith(suffix) && host.length > suffix.length
  }

  try {
    const parsed = new URL(rule.includes('://') ? rule : `https://${rule}`)
    return parsed.origin === target.origin
  } catch {
    return false
  }
}

function isOriginAllowed(target, envRaw = process.env.PROXY_ALLOWED_ORIGINS) {
  const extraRules =
    envRaw && typeof envRaw === 'string'
      ? envRaw
          .split(/[\s,;]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : []
  const allRules = [...DEFAULT_ALLOWED_ORIGINS, ...extraRules]
  return allRules.some((rule) => matchOriginRule(target, rule))
}

const json = (res, status, message) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ error: { message } }))
}

http
  .createServer(async (req, res) => {
    if (req.url?.split('?')[0] !== '/api/proxy') return json(res, 404, 'Not Found')
    if (req.method !== 'POST') return json(res, 405, 'Method Not Allowed')

    const targetUrl = req.headers['x-target-url']
    if (typeof targetUrl !== 'string' || !targetUrl) {
      return json(res, 400, 'Missing x-target-url header')
    }

    let target
    try {
      target = new URL(targetUrl)
    } catch {
      return json(res, 400, 'Invalid x-target-url header')
    }

    if (target.protocol !== 'https:' || !isOriginAllowed(target)) {
      return json(res, 403, 'Target origin not allowed')
    }

    const declaredLength = Number(req.headers['content-length'] ?? '0')
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return json(res, 413, `Request body exceeds ${MAX_BODY_BYTES} bytes`)
    }

    const headers = {}
    for (const k of FORWARD) if (req.headers[k]) headers[k] = req.headers[k]

    try {
      const upstream = await fetch(target.toString(), {
        method: 'POST',
        headers,
        body: Readable.toWeb(req),
        duplex: 'half',
      })
      res.writeHead(upstream.status, {
        'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      })
      if (upstream.body) Readable.fromWeb(upstream.body).pipe(res)
      else res.end()
    } catch (err) {
      json(res, 502, err?.message || 'Upstream proxy error')
    }
  })
  .listen(PORT, () => console.log(`proxy listening on :${PORT}`))
