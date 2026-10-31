import { onRequestPost } from './functions/api/proxy'

export interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Handle /api/proxy CORS forwarding for DashScope (Qwen) & Volcengine Ark (Doubao)
    if (url.pathname === '/api/proxy') {
      if (request.method === 'POST') {
        return onRequestPost({ request })
      }
      return new Response(JSON.stringify({ error: { message: 'Method Not Allowed' } }), {
        status: 405,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      })
    }

    // Fallback to static assets binding
    return env.ASSETS.fetch(request)
  },
}
