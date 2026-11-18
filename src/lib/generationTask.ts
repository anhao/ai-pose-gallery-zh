import type { ComfyTaskHandle } from '@/services/aiGenerator'
import type { PixAiTaskHandle } from '@/services/pixai'
import type { GenerationSnapshot, ImageProviderId } from '@/types/gallery'

export type TaskHandle = ComfyTaskHandle | PixAiTaskHandle
export interface ActiveTask {
  task?: TaskHandle
  paused?: boolean
  provider?: ImageProviderId
  baseUrl?: string
  prompt: string
  summary: string
  unknown?: boolean
  snapshot?: GenerationSnapshot
}
export function migrateActiveTask(record: ActiveTask): ActiveTask {
  if (!record.task || record.task.provider) return record
  return { ...record, provider: 'comfyui', task: { ...record.task, provider: 'comfyui' } }
}
export function taskHistoryId(task?: TaskHandle): string {
  if (!task) return crypto.randomUUID()
  return task.provider === 'pixai' ? `pixai:${task.baseUrl}:${task.taskId}` : `comfy:${task.baseUrl}:${task.promptId}`
}
