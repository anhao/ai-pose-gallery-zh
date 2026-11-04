#!/usr/bin/env python3
"""Local pose catalogue and stdio MCP adapter. Python standard library only."""
from pathlib import Path
import argparse
import base64
import functools
import gzip
import http.server
import json
import subprocess
import re
import sys
import threading

ROOT = Path(__file__).resolve().parent
GALLERY = ROOT / 'gallery'
VERSION = json.loads((ROOT / '.codex-plugin/plugin.json').read_text())['version']
UI_URI = f'ui://ai-pose-gallery/v{VERSION}/index.html'
UI_MIME = 'text/html;profile=mcp-app'
ICONS = [{'src': 'data:image/png;base64,' + base64.b64encode((ROOT / 'assets' / name).read_bytes()).decode(),
          'mimeType': 'image/png', 'sizes': ['384x384'], 'theme': theme}
         for name, theme in [('sidebar-icon.png', 'light'), ('sidebar-icon-dark.png', 'dark')]]
UI_META = {'ui': {'prefersBorder': False, 'csp': {'connectDomains': [], 'resourceDomains': ['data:']}},
           'openai/widgetDescription': '本地姿势参考图库，支持筛选、切换视角和查看原图。',
           'openai/widgetPrefersBorder': False,
           'openai/widgetCSP': {'connect_domains': [], 'resource_domains': ['data:']},
           'openai/ui': {'availableDisplayModes': ['fullscreen'], 'preferredDisplayMode': 'fullscreen'}}


@functools.cache
def catalogue():
    return json.loads((GALLERY / 'data/pose-zh.json').read_text())


@functools.cache
def catalogue_index():
    return {item['id']: item for item in catalogue()}


def lookup(pose_id):
    try:
        return catalogue_index()[pose_id]
    except KeyError:
        raise ValueError('未知姿势 ID') from None


@functools.cache
def search_index():
    return [(item, ' '.join(str(value) for value in item.values()).casefold())
            for item in catalogue()]


def record(item):
    return {**item, '缩略图': str(GALLERY / item['缩略图']),
            '原图': str(GALLERY / item['原图'])}


def search(query='', system='', category='', angle='', limit=12):
    if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 50:
        raise ValueError('limit 必须为 1–50 的整数')
    tokens = query.casefold().split()
    matches = [x for x, text in search_index()
               if (not system or x['体系'] == system)
               and (not category or x['分类'] == category)
               and (not angle or x['角度'] == angle)
               and all(t in text for t in tokens)]
    return {'total': len(matches), 'items': [record(x) for x in matches[:limit]]}


def export(pose_id, output_dir):
    item = lookup(pose_id)
    target = Path(output_dir).expanduser()
    if not target.is_absolute():
        raise ValueError('output_dir 必须为绝对路径')
    target = target.resolve()
    target.mkdir(parents=True, exist_ok=True)
    image = target / (pose_id + '.png')
    provenance = target / (pose_id + '.source.json')
    if image.exists() or provenance.exists():
        raise ValueError('目标已存在；请选择其他目录，插件不会覆盖文件')
    source = {'pose': item, 'upstream': json.loads((ROOT / 'upstream.json').read_text()),
              'original_author': 'ギア (@giaaibusi)',
              'original_site': 'https://ai-pose-gallery.pages.dev/',
              'license_note': '图片及原始数据不适用 MIT；原仓库声明不得商用。'}
    with image.open('xb') as out:
        out.write((GALLERY / item['原图']).read_bytes())
    with provenance.open('x') as out:
        json.dump(source, out, ensure_ascii=False, indent=2)
    return {'image': str(image), 'source': str(provenance)}


@functools.lru_cache(maxsize=16)
def http_body(path, modified_ns, compressed):
    """Cache immutable runtime assets, not per-request catalogue parsing/encoding."""
    body = Path(path).read_bytes()
    if Path(path).suffix == '.html':
        body = re.sub(rb'<script\b[^>]*src="https://u\.authbox\.cn/[^>]*></script>', b'', body)
    return gzip.compress(body, compresslevel=6, mtime=0) if compressed else body


class GalleryHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def do_GET(self):
        self._serve(head_only=False)

    def do_HEAD(self):
        self._serve(head_only=True)

    def _serve(self, head_only=False):
        path = self.path.split('?')[0]
        if path in ('/', '/index.html'):
            page = ROOT / 'ui/index.html'
            file = page if page.is_file() else GALLERY / 'index.html'
        elif path in ('/icons/pose-mark.svg', '/icons/lucide/search.svg', '/icons/lucide/chevron-down.svg'):
            file = ROOT / 'ui' / path.lstrip('/')
        elif path in ('/data/pose-zh.json', '/data/meta-zh.json'):
            file = GALLERY / path.lstrip('/')
        else:
            return super().do_HEAD() if head_only else super().do_GET()
        compressed = 'gzip' in self.headers.get('Accept-Encoding', '').lower()
        stat = file.stat()
        etag = f'"{stat.st_mtime_ns:x}-{stat.st_size:x}-{"gz" if compressed else "raw"}"'
        if self.headers.get('If-None-Match') == etag:
            self.send_response(304)
            self.send_header('ETag', etag)
            self.send_header('Vary', 'Accept-Encoding')
            self.end_headers()
            return
        body = http_body(str(file), stat.st_mtime_ns, compressed)
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8' if file.suffix == '.html' else 'image/svg+xml' if file.suffix == '.svg'
                         else 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('ETag', etag)
        self.send_header('Vary', 'Accept-Encoding')
        if compressed:
            self.send_header('Content-Encoding', 'gzip')
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def end_headers(self):
        if self.path.split('?')[0].lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico')):
            self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def log_message(self, *_):
        pass


HTTP_SERVER = None


def open_gallery():
    global HTTP_SERVER
    if HTTP_SERVER is None:
        HTTP_SERVER = http.server.ThreadingHTTPServer(
            ('127.0.0.1', 0), functools.partial(GalleryHandler, directory=str(GALLERY)))
        threading.Thread(target=HTTP_SERVER.serve_forever, daemon=True).start()
    return {'url': f'http://127.0.0.1:{HTTP_SERVER.server_port}/',
            'instruction': '用 open_in_codex 浏览器面板打开此 URL；服务随本 MCP 进程退出。'}


def tool(name, description, properties=None, required=None, read_only=True):
    return {'name': name, 'description': description,
            'inputSchema': {'type': 'object', 'properties': properties or {},
                            'required': required or [], 'additionalProperties': False},
            'annotations': {'readOnlyHint': read_only, 'destructiveHint': False,
                            'openWorldHint': False}}


STRING = {'type': 'string'}
TOOLS = [
    tool('pose_gallery_open', '打开本地 AI Pose Gallery 中文图库，返回可在 Codex 浏览器打开的 URL。', read_only=False),
    tool('pose_gallery_search', '按中文动作词、体系、分类及视角检索姿势参考，返回图片绝对路径。',
         {**{k: STRING for k in ['query', 'system', 'category', 'angle']},
          'limit': {'type': 'integer', 'minimum': 1, 'maximum': 50}}),
    tool('pose_gallery_details', '按 ID 获取姿势及同组全部视角。', {'pose_id': STRING}, ['pose_id']),
    tool('pose_gallery_image', '按 ID 读取一张姿势参考图，默认缩略图。',
         {'pose_id': STRING, 'full': {'type': 'boolean'}}, ['pose_id']),
    tool('pose_gallery_export', '导出指定参考原图及来源信息到用户选定的绝对目录，拒绝覆盖。',
         {'pose_id': STRING, 'output_dir': STRING}, ['pose_id', 'output_dir'], False),
]

TOOLS[0].update({'title': '姿势图库', 'icons': ICONS, '_meta': {
    'ui': {'visibility': ['model', 'app'], 'resourceUri': UI_URI},
    'ui/resourceUri': UI_URI, 'openai/outputTemplate': UI_URI,
    'openai/widgetAccessible': True,
    'openai/ui': {'entrypoints': [{'type': 'global'}]}}})
for app_tool in [
    tool('pose_gallery_catalog', '读取图库目录，用于本地图库界面。'),
    tool('pose_gallery_assets', '按姿势 ID 批量读取本地图片，用于图库界面。',
         {'ids': {'type': 'array', 'items': STRING, 'minItems': 1, 'maxItems': 24},
          'kind': {'type': 'string', 'enum': ['thumb', 'mini', 'display', 'original']}}, ['ids', 'kind']),
    tool('pose_gallery_original_link', '取得指定原图的本机浏览器地址。', {'pose_id': STRING}, ['pose_id'], False),
    tool('pose_gallery_copy_image', '将选定姿势原图复制到本机剪贴板，仅在用户点击复制图片时调用。', {'pose_id': STRING}, ['pose_id'], False)
]:
    app_tool['_meta'] = {'ui': {'visibility': ['app']}, 'openai/widgetAccessible': True}
    TOOLS.append(app_tool)


def call(name, args):
    spec = next((x for x in TOOLS if x['name'] == name), None)
    if spec is None:
        raise ValueError('未知工具')
    schema = spec['inputSchema']
    if set(args) - set(schema['properties']) or set(schema['required']) - set(args):
        raise ValueError('参数缺失或存在未知参数')
    for key, value in args.items():
        kind = schema['properties'][key]['type']
        if kind == 'string' and not isinstance(value, str):
            raise ValueError(f'{key} 必须为字符串')
        if kind == 'boolean' and not isinstance(value, bool):
            raise ValueError(f'{key} 必须为布尔值')
    if name == 'pose_gallery_open':
        result = open_gallery()
    elif name == 'pose_gallery_search':
        result = search(**args)
    elif name == 'pose_gallery_details':
        item = lookup(args['pose_id'])
        result = {'pose': record(item), 'angles': [record(x) for x in catalogue()
                  if (x['体系'], x['姿势编号']) == (item['体系'], item['姿势编号'])]}
    elif name == 'pose_gallery_image':
        item = lookup(args['pose_id'])
        full = args.get('full', False)
        path = GALLERY / item['原图' if full else '缩略图']
        optimized = GALLERY / 'optimized/thumbs' / (item['id'] + '.webp')
        if not full and optimized.is_file():
            path = optimized
        mime = 'image/png' if full else ('image/webp' if path.suffix == '.webp' else 'image/jpeg')
        return {'content': [{'type': 'image', 'mimeType': mime,
                             'data': base64.b64encode(path.read_bytes()).decode()}]}
    elif name == 'pose_gallery_catalog':
        result = {'items': catalogue()}
    elif name == 'pose_gallery_assets':
        ids, kind = args['ids'], args['kind']
        if not isinstance(ids, list) or not 1 <= len(ids) <= 24 or not all(isinstance(x, str) for x in ids):
            raise ValueError('ids 必须是 1–24 个姿势 ID')
        if kind not in ('thumb', 'mini', 'display', 'original') or (kind == 'original' and len(ids) != 1):
            raise ValueError('无效的图片类型或数量')
        images = {}
        for pose_id in ids:
            item = lookup(pose_id)
            path = (GALLERY / item['原图']) if kind == 'original' else (GALLERY / 'optimized' / ({'thumb': 'thumbs', 'mini': 'mini', 'display': 'img'}[kind]) / (pose_id + '.webp'))
            if not path.is_file() and kind != 'original':
                path = GALLERY / item['原图' if kind == 'display' else '缩略图']
            mime = {'.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp'}[path.suffix.lower()]
            images[pose_id] = f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode()
        result = {'images': images}
    elif name == 'pose_gallery_copy_image':
        item = lookup(args['pose_id'])
        script = '''import AppKit
import Foundation
let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
guard let image = NSImage(data: data) else { exit(2) }
let board = NSPasteboard.general
board.clearContents()
guard board.setData(data, forType: .png) else { exit(3) }
if let tiff = image.tiffRepresentation { board.setData(tiff, forType: .tiff) }
'''
        try:
            subprocess.run(['/usr/bin/swift', '-e', script, str(GALLERY / item['原图'])], check=True, capture_output=True, timeout=30)
        except (subprocess.SubprocessError, OSError) as exc:
            raise ValueError('无法复制图片，请重试或下载原图') from exc
        result = {'copied': True}
    elif name == 'pose_gallery_original_link':
        item = lookup(args['pose_id'])
        result = {'url': open_gallery()['url'] + item['原图']}
    else:
        result = export(**args)
    return {'content': [{'type': 'text', 'text': json.dumps(result, ensure_ascii=False)}],
            'structuredContent': result}


def serve_mcp():
    for line in sys.stdin:
        request = None
        try:
            request = json.loads(line)
            if 'id' not in request:
                continue
            method, params = request['method'], request.get('params', {})
            if method == 'initialize':
                result = {'protocolVersion': params.get('protocolVersion', '2025-06-18'),
                          'capabilities': {'tools': {}, 'resources': {}},
                          'serverInfo': {'name': 'ai-pose-gallery-zh', 'version': VERSION, 'icons': ICONS}}
            elif method == 'ping':
                result = {}
            elif method == 'tools/list':
                result = {'tools': TOOLS}
            elif method == 'resources/list':
                result = {'resources': [{'uri': UI_URI, 'name': 'ai-pose-gallery', 'title': '姿势图库',
                                         'mimeType': UI_MIME, 'icons': ICONS, '_meta': UI_META}]}
            elif method == 'resources/templates/list':
                result = {'resourceTemplates': []}
            elif method == 'resources/read':
                if not re.fullmatch(r'ui://ai-pose-gallery/v[0-9]+\.[0-9]+\.[0-9]+/index\.html', params.get('uri', '')):
                    raise ValueError('未知资源')
                from widget import widget_html
                result = {'contents': [{'uri': params['uri'], 'mimeType': UI_MIME, '_meta': UI_META,
                                        'text': widget_html(ROOT)}]}
            elif method == 'tools/call':
                try:
                    result = call(params['name'], params.get('arguments', {}))
                except (ValueError, TypeError, OSError) as error:
                    result = {'isError': True, 'content': [{'type': 'text', 'text': str(error)}]}
            else:
                print(json.dumps({'jsonrpc': '2.0', 'id': request['id'],
                                  'error': {'code': -32601, 'message': 'Method not found'}}), flush=True)
                continue
            response = {'jsonrpc': '2.0', 'id': request['id'], 'result': result}
        except Exception as error:
            response = {'jsonrpc': '2.0', 'id': request.get('id') if isinstance(request, dict) else None,
                        'error': {'code': -32600, 'message': str(error)}}
        print(json.dumps(response, ensure_ascii=False), flush=True)
    if HTTP_SERVER:
        HTTP_SERVER.shutdown()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--search')
    args = parser.parse_args()
    if args.search is not None:
        print(json.dumps(search(query=args.search), ensure_ascii=False, indent=2))
    else:
        serve_mcp()
