import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const i18n = readFileSync(new URL('../comfyui_plugin/web/i18n.js', import.meta.url), 'utf8').replaceAll('export ', '');
const catalogueI18n = readFileSync(new URL('../comfyui_plugin/web/catalogue-i18n.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replaceAll('export ', '');
const dictionaries = Object.fromEntries(['terms', 'poses', 'costumes'].map((name) => [name,
  JSON.parse(readFileSync(new URL(`../data/i18n/vi/${name}.json`, import.meta.url), 'utf8'))]));
const extension = readFileSync(new URL('../comfyui_plugin/web/extension.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('import.meta.url', '"https://example.test/extension.js"');

class Element {
  constructor() { this.children = []; this.elements = {}; this.events = {}; this.style = {}; }
  querySelector(id) { return this.elements[id] ||= new Element(); }
  appendChild(child) { this.children.push(child); }
  addEventListener(name, callback) { this.events[name] = callback; }
  setAttribute(name, value) { this[name] = value; }
  remove() {}
}

function load(language, fetchApi = async () => ({ ok: true, json: async () => ({ items: [] }) })) {
  const context = vm.createContext({
    navigator: { language }, URL, console,
    document: { createElement: () => new Element(), getElementById: () => true, body: new Element() },
    window: { confirm: (message) => { context.confirmation = message; return true; } },
    api: { fetchApi: (url, options) => url === '/pose_character_atlas/i18n/vi'
      ? Promise.resolve({ ok: true, json: async () => dictionaries }) : fetchApi(url, options) },
    app: { registerExtension: (value) => { context.extension = value; }, graph: { setDirtyCanvas() {} } },
  });
  vm.runInContext(i18n + '\n' + catalogueI18n + '\n' + extension + '\nglobalThis.hooks = { t, localizeNode, PoseAtlasModal, catalogueCache, fetchCatalogue, loadCatalogueTranslations, catalogueTitle, catalogueTerm, catalogueSearchText };', context);
  return context;
}

for (const language of ['vi', 'vi-VN', 'VI-vn', 'zh-CN', 'en-US', 'vietnamese', undefined]) {
  test(`browser locale ${language} is ignored: Vietnamese labels, no workflow value changes`, () => {
    const context = load(language);
    const node = {
      widgets: [{ name: 'resize_mode', value: '原图尺寸', options: { values: ['原图尺寸'] } },
        { name: 'extra_prompt', value: '用户原文', options: {}, inputEl: {} }],
      inputs: [{ name: 'image_id' }], outputs: [{ name: '姿势图', type: 'IMAGE' }],
    };
    context.hooks.localizeNode(node);
    assert.equal(node.widgets[0].value, '原图尺寸');
    assert.deepEqual(node.widgets[0].options.values, ['原图尺寸']);
    assert.equal(node.widgets[1].value, '用户原文');
    assert.equal(node.outputs[0].name, '姿势图');
    assert.equal(node.widgets[0].label, 'Chế độ đổi kích thước');
    assert.equal(node.outputs[0].label, 'Ảnh tư thế');
    assert.match(node.widgets[1].inputEl.placeholder, /Prompt bổ sung/);
  });
}

test('Vietnamese shell, confirmation, toggle labels, filters, pagination and raw catalogue data', async () => {
  const context = load('vi-VN');
  const modal = new context.hooks.PoseAtlasModal();
  modal.renderShell();
  assert.doesNotMatch(modal.backdrop.innerHTML, /\p{Script=Han}/u);
  assert.match(modal.backdrop.innerHTML, /Trang trước/);
  assert.match(modal.backdrop.innerHTML, /value="gia-anime"/);
  modal.backdrop.querySelector('#pca-depth-btn').events.click();
  assert.match(modal.backdrop.querySelector('#pca-depth-btn').textContent, /Bản đồ độ sâu/);
  modal.backdrop.querySelector('#pca-sfw-btn').events.click();
  assert.match(context.confirmation, /đủ 18 tuổi/);
  assert.equal(modal.safeMode, false);
  const item = { id: 'pose-1', 姿势名称: '坐姿', 分类: '坐', 角度: '正面' };
  context.hooks.catalogueCache.pose = [item];
  modal.populateFilters();
  const option = modal.backdrop.querySelector('#pca-filter-primary').children.at(-1);
  assert.equal(option.value, '坐');
  modal.primaryFilter = option.value;
  assert.equal(modal.getFilteredItems()[0], item);
  modal.renderGrid();
  assert.equal(modal.backdrop.querySelector('#pca-page-info').textContent, 'Trang 1 / 1 (1 mục)');
  assert.match(modal.backdrop.querySelector('#pca-grid').children.at(-1).innerHTML, /坐姿/);
});

test('real catalogues have Vietnamese titles, categories, angles, hair groups and tags without mutation', async () => {
  const context = load('vi');
  await context.hooks.loadCatalogueTranslations(context.api);
  const files = { pose: ['pose-zh'], costume: ['costume-zh', 'costume-anime-zh', 'costume-gia-anime-zh', 'costume-shisei-zh'], portrait: ['portrait-zh'] };
  for (const [lib, names] of Object.entries(files)) {
    for (const name of names) {
      const items = JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
      const before = JSON.stringify(items);
      for (const item of items) {
        const raw = item.姿势名称 || item.服装名称 || item.发型名称;
        const title = context.hooks.catalogueTitle(lib, item, raw);
        assert.doesNotMatch(title, /\p{Script=Han}/u, `${lib}/${item.id}`);
        for (const value of [item.体系, item.分类, item.一级分类, item.角度, item.发长, item.分区, ...(item.标签 || [])].filter(Boolean)) {
          assert.doesNotMatch(context.hooks.catalogueTerm(value), /\p{Script=Han}/u, value);
        }
      }
      assert.equal(JSON.stringify(items), before);
    }
  }
});

test('translated cards, raw filter values, Chinese and Vietnamese search, unknown fallback', async () => {
  const context = load('vi');
  await context.hooks.loadCatalogueTranslations(context.api);
  const item = JSON.parse(readFileSync(new URL('../data/pose-zh.json', import.meta.url), 'utf8'))[0];
  context.hooks.catalogueCache.pose = [item];
  const modal = new context.hooks.PoseAtlasModal();
  modal.renderShell();
  modal.safeMode = false;
  modal.populateFilters();
  const option = modal.backdrop.querySelector('#pca-filter-primary').children.at(-1);
  assert.equal(option.textContent, 'Tư thế đứng');
  assert.equal(option.value, '站姿');
  modal.primaryFilter = option.value;
  for (const query of ['đứng', 'chính diện', item.姿势名称, item.id]) {
    modal.searchQuery = query.toLowerCase();
    assert.equal(modal.getFilteredItems()[0], item, query);
  }
  modal.searchQuery = 'không tồn tại';
  assert.equal(modal.getFilteredItems().length, 0);
  modal.searchQuery = '';
  modal.renderGrid();
  const card = modal.backdrop.querySelector('#pca-grid').children.at(-1);
  assert.doesNotMatch(card.innerHTML, /\p{Script=Han}/u);
  assert.match(card.innerHTML, /Chính diện/);
  assert.equal(context.hooks.catalogueTitle('pose', { id: 'unknown' }, '原文'), '原文');
  assert.equal(context.hooks.catalogueTerm('unknown'), 'unknown');
  const other = load('zh');
  try { await other.hooks.loadCatalogueTranslations({ fetchApi() { throw Error('offline'); } }); } catch {}
  assert.equal(other.hooks.catalogueTitle('pose', item, item.姿势名称), item.姿势名称);
  const costume = { id: 'unknown', 标签: ['丝巾'] };
  assert.match(context.hooks.catalogueSearchText('costume', costume, 'unknown'), /Khăn lụa/);
});

test('dictionary failures are retryable and never poison the cache', async () => {
  const context = load('vi');
  await assert.rejects(context.hooks.loadCatalogueTranslations({ fetchApi: async () => ({ ok: false }) }), /Không thể tải/);
  await assert.rejects(context.hooks.loadCatalogueTranslations({ fetchApi: async () => ({ ok: true, json: async () => ({}) }) }), /không hợp lệ/);
  await context.hooks.loadCatalogueTranslations(context.api);
  assert.equal(context.hooks.catalogueTerm('站姿'), 'Tư thế đứng');
});

test('picker view labels are Vietnamese but applying keeps IDs and view values raw', () => {
  const context = load('vi');
  const modal = new context.hooks.PoseAtlasModal();
  modal.renderShell();
  modal.activeLib = 'costume';
  modal.costumeView = 'back';
  const item = { id: 'SPR-0001', 服装名称: '原文', 分类: '原分类', views: [
    { id: 'front', label: '正面' }, { id: 'back', label: '背面' },
  ] };
  context.hooks.catalogueCache.costume = [item];
  modal.renderGrid();
  const card = modal.backdrop.querySelector('#pca-grid').children.at(-1);
  const select = card.children[0];
  assert.equal(select.children[1].textContent, 'Phía sau');
  assert.equal(select.children[1].value, 'back');
  const callbacks = [];
  const widgets = ['costume_view', 'use_depth', 'image_id'].map((name) => ({ name, callback: (value) => callbacks.push([name, value]) }));
  modal.targetNode = { widgets };
  modal.recipeSelection.costume = item.id;
  modal.applyAndClose();
  assert.deepEqual(callbacks, [['costume_view', 'back'], ['use_depth', false], ['image_id', 'SPR-0001']]);
});

test('the shell is always Vietnamese with raw catalogue values, whatever the browser locale', () => {
  const context = load('en-US');
  const modal = new context.hooks.PoseAtlasModal();
  modal.renderShell();
  modal.renderGrid();
  assert.doesNotMatch(modal.backdrop.innerHTML, /\p{Script=Han}/u);
  assert.match(modal.backdrop.innerHTML, /Áp dụng vào nút/);
  assert.equal(modal.backdrop.querySelector('#pca-page-info').textContent, 'Trang 1 / 1 (0 mục)');
});

test('HTTP/network errors are visible and localized, failed fetch can be retried', async () => {
  let calls = 0;
  const context = load('vi', async (url, options) => {
    assert.equal(url, '/pose_character_atlas/catalogue?library=pose');
    assert.equal(options.headers['Accept-Language'], 'vi');
    calls++;
    if (calls === 1) return { ok: false, status: 400, json: async () => ({ error: 'Không tìm thấy tệp dữ liệu' }) };
    if (calls === 2) throw new Error('Network offline');
    return { ok: true, json: async () => ({ items: [] }) };
  });
  const modal = new context.hooks.PoseAtlasModal();
  modal.renderShell();
  await modal.switchLibrary('pose');
  assert.match(modal.backdrop.querySelector('#pca-grid').textContent, /Tải thất bại.*HTTP 400.*Không tìm thấy/);
  await modal.switchLibrary('pose');
  assert.match(modal.backdrop.querySelector('#pca-grid').textContent, /Tải thất bại.*Network offline/);
  await modal.switchLibrary('pose');
  assert.equal(calls, 3);
});

test('node titles are always Vietnamese, registration identifiers unchanged', async () => {
  for (const language of ['vi', 'zh-CN', 'en-US']) {
    const context = load(language);
    class Node {}
    const data = { name: 'PoseGalleryNode', display_name: 'AI 姿势参考图 (Pose Gallery)', category: 'AI角色三合一参考图集' };
    await context.extension.beforeRegisterNodeDef(Node, data);
    assert.equal(data.name, 'PoseGalleryNode');
    assert.equal(data.category, 'AI角色三合一参考图集');
    assert.equal(data.display_name, 'AI ảnh tham khảo tư thế (Pose Gallery)');
  }
});
