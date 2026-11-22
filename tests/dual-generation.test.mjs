import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
})
after(() => server.close())
const { buildRecipePrompt, generateCharacterImage, stitchRecipeCanvas } = await server.ssrLoadModule('/src/services/aiGenerator.ts')
const { comfyRecipeWorkflowImages } = await server.ssrLoadModule('/src/lib/recipeCharacters.ts')
const { workflowIdentity } = await server.ssrLoadModule('/src/lib/comfyWorkflowParameters.ts')
const { pixAiSources } = await server.ssrLoadModule('/src/services/pixai.ts')
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6ioAAAAASUVORK5CYII='
const sources = Array.from({ length: 5 }, (_, index) => `data:image/png;base64,${Buffer.concat([Buffer.from(png, 'base64'), Buffer.from([index])]).toString('base64')}`)
const portrait = (id, source) => ({ id, 原图: source, 缩略图: source, 标题: id, 发型名称: id, 发长: '短发' })
const costume = (id, source) => ({ id, 原图: source, 预览图: source, 缩略图: source, 服装名称: id, 分类: '日常' })
const dualRecipe = () => ({ characterMode: 'dual', characterLayout: 'a-left',
  portrait: portrait('A人像', sources[0]), costume: costume('A服装', sources[1]),
  secondaryCharacter: { portrait: portrait('B人像', sources[2]), costume: costume('B服装', sources[3]) },
  pose: { id: 'pose', 原图: sources[4], 缩略图: sources[4], 姿势名称: '面对面', 角度: '正面', 体系: '双人', 分类: '站立' }, extraImages: [],
})
function config(provider = 'gpt', endpoint = 'images_edits_json') {
  return { activeProvider: provider,
    providers: Object.fromEntries(['gpt', 'gemini', 'qwen', 'doubao', 'comfyui', 'pixai'].map((id) => [id, { model: id === 'gpt' ? 'gpt-image-2' : 'test-model', customModel: '', baseUrl: 'https://api.example', apiKey: 'test-key' }])),
    imagePassMode: 'url', sendStitchedSheet: false, useProxy: false,
    gptParams: { endpointMode: endpoint, size: 'auto', quality: 'auto', background: 'auto', moderation: 'auto', outputFormat: 'png', inputFidelity: 'high' },
    geminiParams: { endpointMode: endpoint, aspectRatio: '3:4', imageSize: '1K' },
    qwenParams: { size: '1024*1536', n: 1, promptExtend: true, watermark: false, negativePrompt: '' },
    doubaoParams: { size: '2K', sequentialImageGeneration: 'disabled', watermark: false, responseFormat: 'b64_json' },
    comfyuiParams: { workflowJson: '{}', portraitNodeId: '1', costumeNodeId: '2', poseNodeId: '5', stitchedNodeId: 'none', promptNodeId: '6', randomizeSeed: false },
  }
}
async function capture(provider, endpoint, recipe = dualRecipe()) {
  const original = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url, init) => { requests.push({ url, body: init.body }); return Response.json({ data: [{ b64_json: png }] }) }
  try {
    const result = await generateCharacterImage({ recipe, prompt: buildRecipePrompt(recipe, 'none'), config: config(provider, endpoint) })
    assert.equal(result.imageUrl, `data:image/png;base64,${png}`)
    assert.equal(requests.length, 1, 'must submit once without generation retries')
    return requests[0]
  } finally { globalThis.fetch = original }
}

test('dual prompt binds each identity and costume to the selected screen position', () => {
  const recipe = { ...dualRecipe(), characterLayout: 'a-right' }
  const prompt = buildRecipePrompt(recipe, 'none')
  assert.match(prompt, /5 张参考图/)
  assert.match(prompt, /角色 A：对应画面右侧.*图1.*图2/)
  assert.match(prompt, /角色 B：对应画面左侧.*图3.*图4/)
  assert.match(prompt, /共享姿势：图5/)
  assert.match(prompt, /不混合五官/)
  assert.match(prompt, /不能交换身份或服装/)
})

test('optional costumes do not shift references or borrow the other character outfit', () => {
  const recipe = dualRecipe()
  recipe.costume = null
  const prompt = buildRecipePrompt(recipe, 'none')
  assert.match(prompt, /4 张参考图/)
  assert.match(prompt, /角色 A：.*保留图1中该人物原有可见服装/)
  assert.match(prompt, /角色 B：.*图2.*图3/)
  assert.match(prompt, /共享姿势：图4/)
})

for (const endpoint of ['images_edits_json', 'images_edits', 'responses', 'chat']) {
  test(`GPT ${endpoint} sends all five references in role order`, async () => {
    const request = await capture('gpt', endpoint)
    if (endpoint === 'images_edits') {
      const images = request.body.getAll('image[]')
      assert.equal(images.length, 5)
      for (const [index, image] of images.entries()) assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.from(sources[index].split(',')[1], 'base64'))
    } else {
      const body = JSON.parse(request.body)
      const images = endpoint === 'images_edits_json' ? body.images.map((image) => image.image_url)
        : endpoint === 'responses' ? body.input[0].content.filter((item) => item.type === 'input_image').map((image) => image.image_url)
          : body.messages[0].content.filter((item) => item.type === 'image_url').map((image) => image.image_url.url)
      assert.deepEqual(images, sources)
    }
  })
}
for (const endpoint of ['native', 'chat']) {
  test(`Gemini ${endpoint} sends all five references in role order`, async () => {
    const body = JSON.parse((await capture('gemini', endpoint)).body)
    const images = endpoint === 'native' ? body.contents[0].parts.filter((item) => item.inlineData).map((image) => `data:image/png;base64,${image.inlineData.data}`)
      : body.messages[0].content.filter((item) => item.type === 'image_url').map((image) => image.image_url.url)
    assert.deepEqual(images, sources)
  })
}
test('Qwen and Doubao include both identities and both costumes', async () => {
  const qwen = JSON.parse((await capture('qwen')).body)
  assert.deepEqual(qwen.input.messages[0].content.filter((item) => item.image).map((item) => item.image), sources)
  assert.deepEqual(JSON.parse((await capture('doubao')).body).image, sources)
})

test('single mode preserves its three references and ignores retained character B', async () => {
  const recipe = { ...dualRecipe(), characterMode: 'single' }
  const body = JSON.parse((await capture('gpt', 'images_edits_json', recipe)).body)
  assert.deepEqual(body.images.map((item) => item.image_url), [sources[0], sources[1], sources[4]])
  assert.doesNotMatch(body.prompt, /角色 B|身份隔离/)
  assert.match(body.prompt, /3 张参考图/)
})

test('missing dual portraits are rejected before any outbound request', async () => {
  const recipe = dualRecipe()
  recipe.secondaryCharacter.portrait = null
  const original = globalThis.fetch
  globalThis.fetch = async () => { assert.fail('must not send a request') }
  try { await assert.rejects(generateCharacterImage({ recipe, prompt: 'test', config: config() }), /角色 B.*人像/) }
  finally { globalThis.fetch = original }
})

test('PixAI dual mode is rejected before upload or task submission', async () => {
  assert.throws(() => pixAiSources(dualRecipe()), /暂不支持双角色/)
  const original = globalThis.fetch
  globalThis.fetch = async () => { assert.fail('must not send a request') }
  try { await assert.rejects(generateCharacterImage({ recipe: dualRecipe(), prompt: 'test', config: config('pixai') }), /暂不支持双角色/) }
  finally { globalThis.fetch = original }
})

test('ComfyUI rejects missing and overlapping B mappings before preflight requests', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => { assert.fail('must not send a request') }
  try {
    const settings = config('comfyui')
    await assert.rejects(generateCharacterImage({ recipe: dualRecipe(), prompt: 'test', config: settings }), /角色 B 人像/)
    settings.comfyuiParams.secondaryPortraitNodeId = '1'
    settings.comfyuiParams.secondaryCostumeNodeId = '4'
    await assert.rejects(generateCharacterImage({ recipe: dualRecipe(), prompt: 'test', config: settings }), /不同的图片节点/)
  } finally { globalThis.fetch = original }
})

test('ComfyUI rejects stale and non-image collage mappings before preflight', async () => {
  const settings = config('comfyui')
  const workflow = Object.fromEntries(['1', '2', '3', '4', '5'].map((id) => [id, { class_type: 'LoadImage', inputs: { image: 'placeholder.png' } }]))
  workflow['6'] = { class_type: 'CLIPTextEncode', inputs: { text: '' } }
  Object.assign(settings.comfyuiParams, { workflowJson: JSON.stringify(workflow), secondaryPortraitNodeId: '3', secondaryCostumeNodeId: '4' })
  const original = globalThis.fetch
  globalThis.fetch = async () => { assert.fail('must not send a request') }
  try {
    for (const nodeId of ['6', 'missing']) {
      settings.comfyuiParams.stitchedNodeId = nodeId
      await assert.rejects(generateCharacterImage({ recipe: dualRecipe(), prompt: 'test', config: settings }), /参考拼图节点映射已失效/)
    }
  } finally { globalThis.fetch = original }
})

test('ComfyUI prompt references exclude mapped roles and uploads outside the current workflow', () => {
  const settings = config('comfyui').comfyuiParams
  const workflow = Object.fromEntries(['1', '2', '3', '4', '5', '7'].map((id) => [id, { class_type: 'LoadImage', inputs: { image: 'placeholder.png' } }]))
  workflow['6'] = { class_type: 'CLIPTextEncode', inputs: { text: '' } }
  Object.assign(settings, { workflowJson: JSON.stringify(workflow), secondaryPortraitNodeId: '3', secondaryCostumeNodeId: '4' })
  const recipe = dualRecipe()
  recipe.workflowImagesIdentity = workflowIdentity(settings.workflowJson)
  recipe.workflowImages = Object.fromEntries(['3', '6', '7', 'missing'].map((id) => [id, { id, name: id, url: sources[0] }]))

  const activeImages = comfyRecipeWorkflowImages(recipe, settings)
  assert.deepEqual(Object.keys(activeImages), ['7'])
  assert.match(buildRecipePrompt(recipe, 'none', Object.values(activeImages)), /6 张参考图/)
  assert.deepEqual(Object.keys(comfyRecipeWorkflowImages({ ...recipe, characterMode: 'single' }, settings)), ['3', '7'])
  assert.deepEqual(comfyRecipeWorkflowImages({ ...recipe, workflowImagesIdentity: 'old' }, settings), {})
})

test('ComfyUI uploads A and B to distinct nodes before submitting a custom dual workflow', async () => {
  const settings = config('comfyui')
  const workflow = Object.fromEntries(['1', '2', '3', '4', '5'].map((id) => [id, { class_type: 'LoadImage', inputs: { image: 'placeholder.png' } }]))
  workflow['6'] = { class_type: 'CLIPTextEncode', inputs: { text: '' } }
  Object.assign(settings.comfyuiParams, { workflowJson: JSON.stringify(workflow), secondaryPortraitNodeId: '3', secondaryCostumeNodeId: '4' })
  const original = globalThis.fetch
  const uploads = []
  const sentinel = new Error('stop before task creation')
  globalThis.fetch = async (url, init) => {
    if (url.endsWith('/system_stats')) return Response.json({ system: { comfyui_version: 'test' } })
    if (url.endsWith('/object_info/LoadImage')) return Response.json({ LoadImage: { input: { required: { image: [['placeholder.png'], { image_upload: true }] } }, output: ['IMAGE'] } })
    if (url.endsWith('/object_info/CLIPTextEncode')) return Response.json({ CLIPTextEncode: { input: { required: { text: ['STRING', {}] } } } })
    if (url.endsWith('/upload/image')) { uploads.push(Buffer.from(await init.body.get('image').arrayBuffer())); return Response.json({ name: `upload-${uploads.length}.png` }) }
    assert.fail(`Unexpected request: ${url}`)
  }
  try {
    let prepared
    await assert.rejects(generateCharacterImage({ recipe: dualRecipe(), prompt: 'Two roles', config: settings, onSubmitting: async (value) => { prepared = value; throw sentinel } }), (error) => error === sentinel)
    assert.equal(uploads.length, 5)
    uploads.forEach((bytes, index) => assert.deepEqual(bytes, Buffer.from(sources[index].split(',')[1], 'base64')))
    for (let index = 1; index <= 5; index++) assert.equal(prepared.workflow[String(index)].inputs.image, `upload-${index}.png`)
  } finally { globalThis.fetch = original }
})

test('five-reference collage wraps at three columns and retains role labels', async () => {
  const originalImage = globalThis.Image, originalDocument = globalThis.document
  const loaded = [], drawn = [], labels = []
  let canvas
  globalThis.Image = class {
    width = 32; height = 32
    set src(value) { loaded.push(value); queueMicrotask(() => this.onload()) }
  }
  globalThis.document = { createElement: () => (canvas = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage(...args) { drawn.push(args) }, fillText(value) { labels.push(value) } }), toDataURL: () => `data:image/jpeg;base64,${png}` }) }
  try {
    await stitchRecipeCanvas(dualRecipe())
    assert.deepEqual(loaded, sources)
    assert.equal(canvas.width, 1520)
    assert.equal(canvas.height, 1492)
    assert.equal(drawn.length, 5)
    assert.ok(drawn[3][2] > drawn[0][2], 'fourth reference belongs on the second row')
    assert.ok(labels.some((label) => /图1.*角色 A.*画面左侧/.test(label)))
    assert.ok(labels.some((label) => /图3.*角色 B.*画面右侧/.test(label)))
    assert.ok(labels.some((label) => /图5.*共享姿势/.test(label)))
  } finally {
    if (originalImage === undefined) delete globalThis.Image; else globalThis.Image = originalImage
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument
  }
})
