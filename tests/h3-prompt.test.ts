import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildH3RecipePrompt, H3_CHARACTER_SWAP_PROMPT } from '../src/services/h3Prompt'
import { buildH3LoraPayload, dimensionsFor, H3_CHARACTER_SWAP_LORA, resolveH3CharacterSwapLora, resolveH3ModelSelection, sourceImages } from '../src/services/sdcpp'
import type { RecipeState } from '../src/types/gallery'

const fullRecipe = {
  portrait: { source: 'upload', 原图: 'portrait.png', 缩略图: 'portrait.png', 发型名称: '上传人物', 标题: '上传人物', 发长: '' },
  costume: { source: 'upload', 原图: 'outfit.png', 预览图: 'outfit.png', 缩略图: 'outfit.png', 服装名称: '黑色長外套', 分类: '上传', 标签: [], 关键词: '' },
  pose: { source: 'upload', 原图: 'pose.png', 缩略图: 'pose.png', 姿势名称: '側身站姿', 角度: '正面', useDepth: false },
  extraImages: [{ id: 'extra-1', name: '背景光線', url: 'extra.png' }],
} as unknown as RecipeState

test('H3 uses the exact requested character-swap prompt for both built-in recipes', () => {
  assert.equal(buildH3RecipePrompt(fullRecipe, 'realistic'), H3_CHARACTER_SWAP_PROMPT)
  assert.equal(buildH3RecipePrompt(fullRecipe, 'anime'), H3_CHARACTER_SWAP_PROMPT)
  assert.match(H3_CHARACTER_SWAP_PROMPT, /<Picture 1>.*<Picture 2>.*<Picture 3>/s)
  assert.match(H3_CHARACTER_SWAP_PROMPT, /Natural biological skin, realistic pores/)
})

test('H3 keeps Studio slots intact but sends references as Pose, Costume, Portrait, then extras', () => {
  assert.deepEqual(sourceImages(fullRecipe), ['pose.png', 'outfit.png', 'portrait.png', 'extra.png'])
})

test('H3 resolves the exact character-swap LoRA from the server catalog', () => {
  const lora = { name: 'h3_image_character_swap_v1', path: 'Minimax-H3-image/h3_image_character_swap_v1.safetensors', display_path: 'Minimax-H3-image/h3_image_character_swap_v1.safetensors' }
  assert.equal(H3_CHARACTER_SWAP_LORA, 'h3_image_character_swap_v1.safetensors')
  assert.deepEqual(resolveH3CharacterSwapLora([lora]), lora)
  assert.deepEqual(buildH3LoraPayload([lora]), [{ path: lora.path, multiplier: 1, is_high_noise: false }])
  assert.deepEqual(buildH3LoraPayload([lora], 0.75), [{ path: lora.path, multiplier: 0.75, is_high_noise: false }])
  assert.throws(() => resolveH3CharacterSwapLora([]), /找不到必要 LoRA/)
})

test('MiniMax H3 auto-load selection resolves compatible installed files from the sd-server catalog', () => {
  const files = [
    { category: 'diffusion_models', id: 'diffusion_models/MiniMax-H3-Image/minimax_h3_image_pruned_bf16.safetensors', name: 'minimax_h3_image_pruned_bf16.safetensors' },
    { category: 'diffusion_models', id: 'diffusion_models/MiniMax-H3-Image/minimax_h3_image_pruned_int8_convrot.safetensors', name: 'minimax_h3_image_pruned_int8_convrot.safetensors' },
    { category: 'text_encoders', id: 'text_encoders/p-h3-image_text_encoder_int8_convrot.safetensors', name: 'p-h3-image_text_encoder_int8_convrot.safetensors' },
    { category: 'vae', id: 'vae/MiniMax-H3/minimax_h3_image_vae_fp16.safetensors', name: 'minimax_h3_image_vae_fp16.safetensors' },
  ]
  assert.deepEqual(resolveH3ModelSelection('minimax-h3-image', files), {
    diffusion_model: files[1].id,
    llm: files[2].id,
    vae: files[3].id,
  })
})

test('P-H3 auto-load selection uses its own diffusion model and VAE', () => {
  const files = [
    { category: 'diffusion_models', id: 'diffusion_models/MiniMax-H3-Image/p-h3-image_int8_convrot.safetensors', name: 'p-h3-image_int8_convrot.safetensors' },
    { category: 'text_encoders', id: 'text_encoders/p-h3-image_text_encoder_int8_convrot.safetensors', name: 'p-h3-image_text_encoder_int8_convrot.safetensors' },
    { category: 'vae', id: 'vae/p-h3-image_vae_int8_convrot.safetensors', name: 'p-h3-image_vae_int8_convrot.safetensors' },
  ]
  assert.deepEqual(resolveH3ModelSelection('p-h3-image', files), {
    diffusion_model: files[0].id,
    llm: files[1].id,
    vae: files[2].id,
  })
})

test('auto-load selection fails clearly when a required model component is missing', () => {
  assert.throws(() => resolveH3ModelSelection('p-h3-image', []), /diffusion_model, llm, vae/)
})

test('SD.cpp resolution presets support 1, 2, 4, 6, 8, 12 and 16 MP targets', () => {
  for (const mp of ['1', '2', '4', '6', '8', '12', '16']) {
    const dimensions = dimensionsFor('9:16', mp, { max_width: 8192, max_height: 8192 })
    assert.ok(dimensions.width % 32 === 0)
    assert.ok(dimensions.height % 32 === 0)
    assert.ok(Math.abs(dimensions.actualMegapixels - Number(mp)) / Number(mp) < 0.04)
  }
})

test('SD.cpp dimensions respect the live sd-server side limits and report the capped pixel area', () => {
  const dimensions = dimensionsFor('9:16', '16', { max_width: 4096, max_height: 4096 })
  assert.equal(dimensions.width, 2304)
  assert.equal(dimensions.height, 4096)
  assert.equal(dimensions.capped, true)
  assert.ok(dimensions.actualMegapixels < 10)
})

test('SD.cpp default preset is 4 MP portrait and migrates the previous square model-default preset', async () => {
  const { DEFAULT_API_CONFIG, mergeStoredConfig } = await import('../src/store/studioConfig')
  assert.equal(DEFAULT_API_CONFIG.sdcppParams.aspectRatio, '9:16')
  assert.equal(DEFAULT_API_CONFIG.sdcppParams.resolution, '4')
  const migrated = mergeStoredConfig({ sdcppParams: { aspectRatio: '1:1', resolution: 'model' } })
  assert.equal(migrated.sdcppParams.aspectRatio, '9:16')
  assert.equal(migrated.sdcppParams.resolution, '4')
})
