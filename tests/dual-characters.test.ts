import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHARACTER_LAYOUTS, characterRecipeErrors, characterReferences, isDualCharacter, recipeCharacters, recipeReferences, restoreRecipe, withCharacterReferences, withRecipePose } from '../src/lib/recipeCharacters'
import { recipeBackup } from '../src/lib/recipeImages'
import { durableRecipe } from '../src/lib/persistentImages'
import { comparisonReferences } from '../src/lib/comparisonReferences'
import type { ApiConfig, CostumeItem, GenerationHistoryItem, PortraitItem, PoseItem, RecipeState } from '../src/types/gallery'

const portrait = (id: string): PortraitItem => ({ id, 分区: '正脸', 发长: '短发', 发型名称: id, 标题: id, 宽: 100, 高: 120, 字节数: 1000, 精选: false, 热门: false, 原图: `img/portrait/${id}.webp`, 缩略图: `thumbs/portrait/${id}.webp`, 检索: id })
const costume = (id: string): CostumeItem => ({ id, 分类: '春季', 服装名称: id, 标签: [], 关键词: '', 原图: `img/costume/${id}.webp`, 预览图: `img/costume/${id}-front.webp`, 缩略图: `thumbs/costume/${id}.webp`, 检索: id })
const pose = (system = '全身单人・标准系'): PoseItem => ({ id: 'pose', 体系: system, 姿势编号: 'P001', 分类: '站立', 姿势名称: '拥抱', 角度: '正面', 原图: 'img/pair.png', 缩略图: 'thumbs/pair.jpg', 检索: '' })
const single: RecipeState = { portrait: portrait('alice'), costume: costume('red'), pose: pose(), extraImages: [] }
const dual = (): RecipeState => ({ ...structuredClone(single), characterMode: 'dual', characterLayout: 'a-left', secondaryCharacter: { portrait: portrait('bob'), costume: costume('blue') }, pose: pose('双人缠绵') })

test('legacy single recipes retain their references, numbering and mode', () => {
  const restored = restoreRecipe(single)
  assert.equal(isDualCharacter(restored), false)
  assert.deepEqual(recipeReferences(restored).map((ref) => [ref.number, ref.kind, ref.src]), [
    [1, 'portrait', 'img/portrait/alice.webp'], [2, 'costume', 'img/costume/red-front.webp'], [3, 'pose', 'img/pair.png'],
  ])
  assert.deepEqual(restoreRecipe(null).secondaryCharacter, { portrait: null, costume: null })
})

test('choosing a pair pose opens dual mode without replacing either character', () => {
  const before = { ...dual(), characterMode: 'single' as const }
  const next = withRecipePose(before, pose('双人缠绵'))
  assert.equal(next.characterMode, 'dual')
  assert.deepEqual(next.secondaryCharacter, before.secondaryCharacter)
  assert.deepEqual(next.portrait, before.portrait)
  assert.equal(withRecipePose(next, null).characterMode, 'dual')
  assert.equal(withRecipePose(next, pose()).characterMode, 'dual')
  assert.equal(restoreRecipe({ ...single, pose: pose('双人缠绵') }).characterMode, 'dual')
  assert.equal(restoreRecipe({ ...before, pose: pose('双人缠绵') }).characterMode, 'single')
})

test('updating B never replaces A; inactive B references stay out of single requests', () => {
  const original = dual()
  const changed = withCharacterReferences(original, 'b', { portrait: portrait('charlie'), costume: null })
  assert.equal(changed.portrait?.id, 'alice')
  assert.equal(changed.costume?.id, 'red')
  assert.equal(characterReferences(changed, 'b').portrait?.id, 'charlie')
  assert.equal(original.secondaryCharacter?.portrait?.id, 'bob')
  assert.equal(changed.secondaryCharacter?.costume, null)
  const singleAgain = { ...changed, characterMode: 'single' as const }
  assert.deepEqual(recipeReferences(singleAgain).map((ref) => ref.character), ['a', 'a', undefined])
  assert.equal(singleAgain.secondaryCharacter?.portrait?.id, 'charlie')
})

test('one reference plan gives five ordered images and stable actor bindings', () => {
  const recipe = dual()
  const refs = recipeReferences(recipe)
  assert.deepEqual(refs.map((ref) => [ref.number, ref.kind, ref.character]), [
    [1, 'portrait', 'a'], [2, 'costume', 'a'], [3, 'portrait', 'b'], [4, 'costume', 'b'], [5, 'pose', undefined],
  ])
  assert.match(refs[0].label, /角色 A.*左侧/)
  assert.match(refs[2].label, /角色 B.*右侧/)
  for (const layout of CHARACTER_LAYOUTS) {
    const [a, b] = recipeCharacters({ ...recipe, characterLayout: layout.value })
    assert.equal(a.position, layout.a)
    assert.equal(b.position, layout.b)
    assert.notEqual(a.position, b.position)
  }
})

test('optional costumes, workflow references and extras share contiguous numbering', () => {
  const recipe = dual()
  recipe.secondaryCharacter!.costume = null
  recipe.extraImages = [{ id: 'extra', name: '背景', url: 'data:image/png;base64,Ag==' }]
  const refs = recipeReferences(recipe, [
    { id: 'background', name: '灯光', url: 'data:image/png;base64,Aw==' },
    { id: 'sheet', name: '设定集', role: 'character_sheet', url: 'data:image/png;base64,BA==' },
  ])
  assert.deepEqual(refs.map((ref) => ref.number), [1, 2, 3, 4, 5, 6, 7])
  assert.equal(refs[0].id, 'workflow-sheet')
  assert.equal(refs[4].kind, 'pose')
  assert.equal(refs[5].id, 'workflow-background')
  assert.equal(refs[6].id, 'extra-extra')
})

test('dual validation catches missing identities and fixed-three-image providers', () => {
  assert.deepEqual(characterRecipeErrors(single), [])
  assert.deepEqual(characterRecipeErrors(dual()), [])
  const missing = { ...dual(), portrait: null, secondaryCharacter: { portrait: null, costume: null } }
  assert.deepEqual(characterRecipeErrors(missing), ['请为角色 A选择或上传人像', '请为角色 B选择或上传人像'])
  assert.match(characterRecipeErrors(dual(), { activeProvider: 'pixai' } as ApiConfig)[0], /PixAI.*双角色/)
})

test('custom Comfy dual recipes require distinct A/B mappings and all selected inputs', () => {
  const config = { activeProvider: 'comfyui', comfyuiParams: { portraitNodeId: '1', costumeNodeId: '2', secondaryPortraitNodeId: '3', secondaryCostumeNodeId: '4', poseNodeId: '5', stitchedNodeId: 'none' } } as ApiConfig
  assert.deepEqual(characterRecipeErrors(dual(), config), [])
  assert.match(characterRecipeErrors(dual(), { ...config, comfyuiParams: { ...config.comfyuiParams, secondaryPortraitNodeId: 'none' } }).join(' '), /角色 B 人像/)
  assert.match(characterRecipeErrors(dual(), { ...config, comfyuiParams: { ...config.comfyuiParams, secondaryCostumeNodeId: '1' } }).join(' '), /不同的图片节点/)
  assert.deepEqual(characterRecipeErrors({ ...dual(), secondaryCharacter: { portrait: portrait('bob'), costume: null } }, { ...config, comfyuiParams: { ...config.comfyuiParams, secondaryCostumeNodeId: 'none' } }), [])
})

test('lightweight backups strip uploads from both actors and preserve layout and catalog choices', () => {
  const recipe = dual()
  recipe.characterLayout = 'a-front'
  recipe.portrait = { ...recipe.portrait!, source: 'upload', 原图: 'data:image/png;base64,AA==' }
  recipe.secondaryCharacter!.costume = { ...recipe.secondaryCharacter!.costume!, source: 'upload', 原图: 'data:image/png;base64,AQ==' }
  const backup = recipeBackup(recipe)
  assert.equal(backup.characterMode, 'dual')
  assert.equal(backup.characterLayout, 'a-front')
  assert.equal(backup.portrait, null)
  assert.equal(backup.secondaryCharacter?.costume, null)
  assert.equal(backup.secondaryCharacter?.portrait?.id, 'bob')
  assert.equal(recipe.secondaryCharacter!.costume!.source, 'upload')
})

test('durable snapshots retain B uploaded images without mutating the editor', async () => {
  const recipe = dual()
  const source = 'data:image/png;base64,AA=='
  recipe.secondaryCharacter = { portrait: { ...portrait('bob'), source: 'upload', 原图: source }, costume: null }
  const saved = await durableRecipe(recipe)
  assert.equal(saved.secondaryCharacter?.portrait?.原图, source)
  assert.equal(saved.secondaryCharacter?.portrait?.缩略图, source)
  assert.equal(recipe.secondaryCharacter.portrait?.缩略图, 'thumbs/portrait/bob.webp')
  assert.notEqual(saved.secondaryCharacter, recipe.secondaryCharacter)
})

test('history comparison includes the saved A/B identities, outfits and position labels', () => {
  const recipe = dual()
  const refs = comparisonReferences({ provider: 'gpt', snapshot: { recipe } } as GenerationHistoryItem)
  assert.equal(refs.length, 5)
  assert.equal(refs[0].url, '/img/portrait/alice.webp')
  assert.equal(refs[2].url, '/img/portrait/bob.webp')
  assert.match(refs[0].label, /角色 A/)
  assert.match(refs[2].label, /角色 B/)
})
