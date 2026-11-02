import type { CostumeItem } from '@/types/gallery'

const ACK_KEY = 'charadb-image-rules-v1'
export const CHARADB_NOTICE_URL = 'https://github.com/taki-ttt/charadb/blob/main/LICENSE'
export const CHARADB_RULES = 'CharaDB 图片仅作参考，禁止用于表现真实人物或未成年人，禁止原图及加工图再分发、转载或转售；图片不适用 MIT/CC0。向所选模型发送图片、远程展示及真人照片合成边界未取得额外授权，请自行确认符合作者条件。'

export function confirmCostumeSource(item: CostumeItem | null): boolean {
  if (item?.source !== 'charadb') return true
  try {
    if (localStorage.getItem(ACK_KEY) === 'accepted') return true
  } catch { /* 存储不可用时每次确认。 */ }
  if (!window.confirm(`${CHARADB_RULES}\n\n作者条款：${CHARADB_NOTICE_URL}\n\n确认已阅读，且仅用于符合条款的参考创作？`)) return false
  try { localStorage.setItem(ACK_KEY, 'accepted') } catch { /* 本次确认仍有效。 */ }
  return true
}
