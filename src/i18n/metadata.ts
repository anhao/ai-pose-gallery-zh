import { t } from './index'

export const METADATA = {
  title: 'POSE & CHARACTER Atlas｜AI 角色三合一参考库（姿势 · 服装 · 人像）',
  description: 'AI 角色三合一参考库收录 1439 张多角度人体姿势图、1407 套服装穿搭与 1499 张 CC0 人像发型参考。支持自由组装「脸 + 衣服 + 姿势」角色配方，配置 gpt-image-1 / Nano Banana 接口即可在线合成角色图。',
  keywords: 'AI 姿势,姿势参考,服装参考,人像参考,人体姿势,绘画参考,POSE 图库,Nano Banana,gpt-image-1,AI 捏人',
  ogDescription: '4,345 张高清参考图（288 组多角度人体姿势 + 1,407 套服装穿搭 + 1,499 张 CC0 人像），支持三合一角色配方与 AI 在线生图。',
  twitterTitle: 'POSE & CHARACTER Atlas｜AI 角色三合一参考库',
  twitterDescription: '4,345 张姿势 + 服装 + 人像参考图，支持三合一角色配方与 Nano Banana / gpt-image 在线合成。',
  alternateName: 'AI 角色三合一参考库',
  schemaDescription: '4345 张 AI 绘画角色参考图（多角度姿势 + 服装穿搭 + CC0 人像发型）。',
} as const

/** Runtime localization only; the static Chinese SEO document and URLs stay unchanged. */
export function updateMetadata() {
  document.title = t(METADATA.title)
  for (const [selector, value] of [
    ['meta[name="description"]', t(METADATA.description)],
    ['meta[name="keywords"]', t(METADATA.keywords)],
    ['meta[property="og:title"]', t(METADATA.title)],
    ['meta[property="og:description"]', t(METADATA.ogDescription)],
    ['meta[property="og:locale"]', 'vi_VN'],
    ['meta[name="twitter:title"]', t(METADATA.twitterTitle)],
    ['meta[name="twitter:description"]', t(METADATA.twitterDescription)],
  ]) document.querySelector(selector)?.setAttribute('content', value)
  const script = document.querySelector('script[type="application/ld+json"]')
  if (script?.textContent) {
    const schema = JSON.parse(script.textContent)
    const website = schema['@graph']?.find((item: { '@type': string }) => item['@type'] === 'WebSite')
    if (website) {
      website.alternateName = t(METADATA.alternateName)
      website.description = t(METADATA.schemaDescription)
      website.inLanguage = document.documentElement.lang
      script.textContent = JSON.stringify(schema)
    }
  }
}
