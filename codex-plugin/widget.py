"""Adapt the same gallery to the local MCP Apps bridge without localhost image requests."""
import base64
from pathlib import Path

BRIDGE = r'''<script>
(() => {
  const pending = new Map(), thumbs = new Map(), minis = new Map(), inflight = new Set();
  let serial = 0, batchTimer;
  const post = msg => parent.postMessage({jsonrpc:'2.0', ...msg}, '*');
  function request(method, params = {}) {
    return new Promise((resolve,reject) => {
      const id = `pose-${++serial}`;
      const timer = setTimeout(()=>{pending.delete(id);reject(Error('图库连接超时，请重新打开。'));},30000);
      pending.set(id,{resolve,reject,timer});
      post({id,method,params});
    });
  }
  addEventListener('message',event=>{
    if(event.source!==parent||event.data?.jsonrpc!=='2.0')return;
    const m=event.data;
    if(m.id!==undefined && pending.has(m.id) && !m.method){const p=pending.get(m.id);clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}
    else if(m.method==='ping'||m.method==='ui/resource-teardown')post({id:m.id,result:{}});
  });
  const ready=request('ui/initialize',{appInfo:{name:'ai-pose-gallery',version:'0.4.0'},appCapabilities:{availableDisplayModes:['fullscreen']},protocolVersion:'2026-01-26'}).then(x=>{post({method:'ui/notifications/initialized'});return x;});
  ready.catch(()=>{});
  async function call(name,args={}){await ready;const r=await request('tools/call',{name,arguments:args});if(r?.isError)throw Error(r.content?.find(x=>x.type==='text')?.text||'图库读取失败');return r.structuredContent;}
  const placeholder='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  async function image(id,kind){const result=await call('pose_gallery_assets',{ids:[id],kind});return result.images[id];}
  async function loadCards(){
    for(const [kind,selector,cache] of [['thumb','.main-image[data-pose-id],.viewer-thumb[data-pose-id]',thumbs],['mini','.preview-thumb[data-pose-id]',minis]]) {
      const imgs=[...document.querySelectorAll(selector)];
      const ids=[...new Set(imgs.map(x=>x.dataset.poseId))];
      for(const img of imgs){const url=cache.get(img.dataset.poseId);if(url&&img.src!==url)img.src=url;}
      const missing=ids.filter(id=>!cache.has(id)&&!inflight.has(kind+id));
      for(let i=0;i<missing.length;i+=24){const batch=missing.slice(i,i+24);batch.forEach(id=>inflight.add(kind+id));try{const r=await call('pose_gallery_assets',{ids:batch,kind});for(const [id,url] of Object.entries(r.images))cache.set(id,url);}catch(err){console.error('图库缩略图加载失败',err);}finally{batch.forEach(id=>inflight.delete(kind+id));}}
      for(const img of document.querySelectorAll(selector)){const url=cache.get(img.dataset.poseId);if(url&&img.src!==url)img.src=url;}
    }
  }
  function queue(){clearTimeout(batchTimer);batchTimer=setTimeout(loadCards,0);}
  async function download(id){const src=await image(id,'original');const a=document.createElement('a');a.href=src;a.download=id+'.png';document.body.appendChild(a);a.click();a.remove();}
  async function openOriginal(id){const r=await call('pose_gallery_original_link',{pose_id:id});await request('ui/open-link',{url:r.url});}
  window.POSE_HOST={catalog:async()=> (await call('pose_gallery_catalog')).items,thumb:id=>thumbs.get(id)||placeholder,mini:id=>minis.get(id)||placeholder,image,queue,download,openOriginal,copyImage:async id=>call('pose_gallery_copy_image',{pose_id:id})};
})();
</script>'''


def widget_html(root: Path) -> str:
    page = (root / 'ui/index.html').read_text()
    for icon in ('pose-mark.svg', 'lucide/search.svg', 'lucide/chevron-down.svg'):
        encoded = base64.b64encode((root / 'ui/icons' / icon).read_bytes()).decode()
        page = page.replace('icons/' + icon, 'data:image/svg+xml;base64,' + encoded)
    replacements = {
        '<script>\n(() => {\n\'use strict\';': BRIDGE + '\n<script>\n(() => {\n\'use strict\';',
        "const thumbnail = item => item.缩略图;": "const thumbnail = item => window.POSE_HOST.thumb(item.id);",
        "const miniThumbnail = item => item.缩略图;": "const miniThumbnail = item => window.POSE_HOST.mini(item.id);",
        'class="main-image" src="${thumbnail(item)}"': 'class="main-image" data-pose-id="${esc(item.id)}" src="${thumbnail(item)}"',
        'sync();saveURL();}': 'sync();window.POSE_HOST.queue();}',
        'img.dataset.fallback=entry.item.缩略图;img.src=thumbnail(entry.item);': 'img.dataset.poseId=entry.item.id;delete img.dataset.fallback;img.src=thumbnail(entry.item);window.POSE_HOST.queue();',
        "const response=await fetch('data/pose-zh.json');if(!response.ok)throw Error('load');data=await response.json();": "data=await window.POSE_HOST.catalog();",
        'full.src=fullImage(item);': "window.POSE_HOST.image(item.id,'display').then(src=>{if(viewerState.token===token)full.src=src;}).catch(()=>{if(viewerState.token===token)$('#imageStatus').textContent='图片加载失败，请重新打开。';});",
        "if(!full.src.endsWith('.png')){full.src=item.原图;return;}": "if(!full.retried){full.retried=true;window.POSE_HOST.image(item.id,'original').then(src=>full.src=src).catch(()=>$('#imageStatus').textContent='图片加载失败，请重新打开。');return;}",
        "$('#downloadImage').href=item.原图;": "$('#downloadImage').href='#';",
        "load();\n})();": """$('#downloadImage').addEventListener('click',async e=>{e.preventDefault();const label=e.currentTarget.querySelector('span');label.textContent='正在准备原图…';try{await window.POSE_HOST.download(viewerState.item.id);label.textContent='下载原图';}catch{label.textContent='下载失败，请重试';}});
document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();reset();});
load();
})();""",
    }
    for old, new in replacements.items():
        if old not in page:
            raise ValueError('Widget adapter source changed: ' + old[:90])
        page = page.replace(old, new, 1)
    page = page.replace('data-fallback="${esc(item.缩略图)}"', '')
    return page
