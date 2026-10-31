// Cloudflare Pages Function: /api/proxy
// 用于在生产环境解决阿里云百炼 (DashScope) 与字节火山方舟 (Volcengine Ark) 官方接口的浏览器 CORS 限制
export const onRequestPost = async (context: { request: Request }) => {
  const { request } = context
  const targetUrl = request.headers.get('x-target-url')
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return new Response(JSON.stringify({ error: { message: 'Missing or invalid x-target-url header' } }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  }

  const forwardHeaders = new Headers()
  for (const key of ['content-type', 'authorization', 'x-goog-api-key', 'x-dashscope-async']) {
    const val = request.headers.get(key)
    if (val) forwardHeaders.set(key, val)
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: forwardHeaders,
      body: request.body,
    })
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: { message: err?.message || 'Upstream proxy error' } }), {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  }
}
