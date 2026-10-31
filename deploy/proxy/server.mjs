// 與 functions/api/proxy.ts 等價的 Node 版本（無相依套件），供 docker 部署使用
import http from 'node:http'
import { Readable } from 'node:stream'

const PORT = Number(process.env.PORT || 3000)
const FORWARD = ['content-type', 'authorization', 'x-goog-api-key', 'x-dashscope-async']

const json = (res, status, message) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ error: { message } }))
}

http
  .createServer(async (req, res) => {
    if (req.url?.split('?')[0] !== '/api/proxy') return json(res, 404, 'Not Found')
    if (req.method !== 'POST') return json(res, 405, 'Method Not Allowed')

    const target = req.headers['x-target-url']
    if (typeof target !== 'string' || !/^https?:\/\//i.test(target)) {
      return json(res, 400, 'Missing or invalid x-target-url header')
    }
    const headers = {}
    for (const k of FORWARD) if (req.headers[k]) headers[k] = req.headers[k]

    try {
      const upstream = await fetch(target, {
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
