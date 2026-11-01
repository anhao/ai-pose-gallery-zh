// Cloudflare Pages Function: /api/proxy
// 用于在生产环境解决阿里云百炼 (DashScope) 与字节火山方舟 (Volcengine Ark) 官方接口的浏览器 CORS 限制
// 仅放行下方白名单内的上游域名，避免该端点被当作对公网开放的转发代理使用。

/**
 * 允许转发的上游 origin 白名单。
 *
 * 必须按 origin 精确匹配，不能改用 startsWith 或正则前缀匹配，
 * 否则 `https://dashscope.aliyuncs.com.example.com` 之类的域名可以绕过。
 */
const ALLOWED_ORIGINS = new Set([
  'https://dashscope.aliyuncs.com', // 阿里云百炼 / Qwen
  'https://ark.cn-beijing.volces.com', // 火山方舟 / Doubao
  'https://generativelanguage.googleapis.com', // Google Gemini
  'https://api.openai.com', // OpenAI
])

/** 单次转发的请求体上限：生图接口携带 base64 图片时 10 MiB 足够。 */
const MAX_BODY_BYTES = 10 * 1024 * 1024

class BodyTooLargeError extends Error {}

const jsonResponse = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })

/**
 * 流式统计请求体大小，超限即中断。
 * 浏览器侧通常会带 content-length，这里兜底 chunked 上传的情况。
 */
const limitBodySize = (body: ReadableStream<Uint8Array> | null, limit: number) => {
  if (!body) return null
  let received = 0
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength
        if (received > limit) {
          controller.error(new BodyTooLargeError())
          return
        }
        controller.enqueue(chunk)
      },
    }),
  )
}

export const onRequestPost = async (context: { request: Request }) => {
  const { request } = context

  const targetUrl = request.headers.get('x-target-url')
  if (!targetUrl) return jsonResponse(400, 'Missing x-target-url header')

  let target: URL
  try {
    target = new URL(targetUrl)
  } catch {
    return jsonResponse(400, 'Invalid x-target-url header')
  }

  // 只允许白名单内的 https 上游，其余一律拒绝
  if (target.protocol !== 'https:' || !ALLOWED_ORIGINS.has(target.origin)) {
    return jsonResponse(403, 'Target origin not allowed')
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return jsonResponse(413, `Request body exceeds ${MAX_BODY_BYTES} bytes`)
  }

  const forwardHeaders = new Headers()
  for (const key of ['content-type', 'authorization', 'x-goog-api-key', 'x-dashscope-async']) {
    const val = request.headers.get(key)
    if (val) forwardHeaders.set(key, val)
  }

  try {
    const upstream = await fetch(target.toString(), {
      method: 'POST',
      headers: forwardHeaders,
      body: limitBodySize(request.body, MAX_BODY_BYTES),
    })
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      },
    })
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      return jsonResponse(413, `Request body exceeds ${MAX_BODY_BYTES} bytes`)
    }
    return jsonResponse(502, err instanceof Error ? err.message : 'Upstream proxy error')
  }
}
