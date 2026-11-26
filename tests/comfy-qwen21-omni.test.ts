import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseComfyWorkflowNodes, autoDetectComfyMappings, COMFYUI_WORKFLOW_TEMPLATES } from '../src/services/aiGenerator'

const root = join(import.meta.dirname, '..')

test('qwen21_omni_i2i preset parses and auto-maps prompt + three image nodes', () => {
  const tpl = COMFYUI_WORKFLOW_TEMPLATES['qwen21_omni_i2i']
  const json = JSON.stringify(tpl.workflow, null, 2)
  const parsed = parseComfyWorkflowNodes(json)
  assert.equal(parsed.valid, true)
  const mappings = autoDetectComfyMappings(json)
  assert.equal(mappings.promptNodeId, tpl.defaults.promptNodeId)
  assert.equal(mappings.portraitNodeId, tpl.defaults.portraitNodeId)
  assert.equal(mappings.costumeNodeId, tpl.defaults.costumeNodeId)
  assert.equal(mappings.poseNodeId, tpl.defaults.poseNodeId)
  assert.equal(mappings.stitchedNodeId, 'none')
  // 三个 LoadImage：人像/服装/姿势
  const loadImages = Object.entries(tpl.workflow).filter(([, node]: any) => node.class_type === 'LoadImage')
  assert.equal(loadImages.length, 3)
})

test('qwen21_omni_i2i node file names match install-qwen-image-2.1.sh', () => {
  const script = readFileSync(join(root, 'install-qwen-image-2.1.sh'), 'utf8')
  const wf = COMFYUI_WORKFLOW_TEMPLATES['qwen21_omni_i2i'].workflow
  const names = Object.values(wf).flatMap((node: any) =>
    ['unet_name', 'clip_name', 'vae_name', 'lora_name'].map((k) => node.inputs[k]).filter((v) => typeof v === 'string')
  ) as string[]
  assert.equal(names.length, 4)
  for (const name of names) assert.ok(script.includes(name), `install script missing ${name}`)
  // 负向提示词必须是单个空格（卡片要求）；默认提示词不得为空
  const te = Object.values(wf).find((node: any) => node.class_type === 'TextEncodeQwenImage21') as any
  assert.equal(te.inputs.negative_prompt, ' ')
  assert.ok(typeof te.inputs.prompt === 'string' && te.inputs.prompt.trim().length > 0)
  // 三张参考图接到 images.image_1/2/3
  assert.deepEqual([te.inputs['images.image_1'], te.inputs['images.image_2'], te.inputs['images.image_3']], [['1', 0], ['2', 0], ['3', 0]])
})

// 固定输出尺寸：EmptyLatentImage / ModelSamplingFlux 均为 832x1216（32 的倍数）
test('qwen21_omni_i2i uses fixed portrait latent size consistent with ModelSamplingFlux', () => {
  const wf = COMFYUI_WORKFLOW_TEMPLATES['qwen21_omni_i2i'].workflow as Record<string, any>
  assert.equal(wf['5'].class_type, 'EmptyLatentImage')
  assert.equal(wf['5'].inputs.width, 832)
  assert.equal(wf['5'].inputs.height, 1216)
  assert.equal(wf['5'].inputs.width % 32, 0)
  assert.equal(wf['5'].inputs.height % 32, 0)
  assert.equal(wf['9'].inputs.width, 832)
  assert.equal(wf['9'].inputs.height, 1216)
  // 不再从参考图尺寸派生：不应存在 GetImageSize / ComfyMathExpression
  for (const node of Object.values<any>(wf)) {
    assert.ok(!['GetImageSize', 'ComfyMathExpression'].includes(node.class_type), `unexpected ${node.class_type}`)
  }
})
