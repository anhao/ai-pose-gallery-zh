import { isValidElement, type ReactNode } from 'react'
import { toast as sonner, type ExternalToast, type ToastT } from 'sonner'

export type Notification = ToastT & {
  notificationDuration?: number
  notificationRevision?: number
  notificationAutoClosing?: { current: boolean }
  notificationOnDismiss?: ToastT['onDismiss']
  notificationDismissHandler?: ToastT['onDismiss']
}
let revision = 0

// Sonner hides overflow toasts but still starts their clocks. Keep its renderer/store;
// the Toaster starts these clocks only after a notification can actually be read.
function managed(options: ExternalToast = {}) {
  const previous = options.id === undefined ? undefined : sonner.getToasts().find((item) => item.id === options.id) as Notification | undefined
  const nextRevision = ++revision
  const autoClosing = { current: false }
  const onDismiss = 'onDismiss' in options ? options.onDismiss : previous?.notificationOnDismiss
  const dismissHandler = (notice: ToastT) => { if (!autoClosing.current) onDismiss?.(notice) }
  return {
    ...options,
    duration: Infinity,
    notificationDuration: options.duration ?? previous?.notificationDuration ?? 4000,
    notificationRevision: nextRevision,
    notificationAutoClosing: autoClosing,
    notificationOnDismiss: onDismiss,
    notificationDismissHandler: dismissHandler,
    onDismiss: dismissHandler,
    className: `${(options.className ?? '').split(/\s+/).filter((name) => !/^app-notification-\d+$/.test(name)).join(' ')} app-notification-${nextRevision}`,
  }
}

// Other independently built features can keep importing Sonner directly.
export function adoptNotification(notice: Notification): boolean {
  if (notice.delete) return false
  const current = sonner.getToasts().find((item) => item.id === notice.id) as Notification | undefined
  if (!current || current.delete) return false
  if (current.notificationRevision !== undefined && current.duration === Infinity && current.onDismiss === current.notificationDismissHandler) return false
  const onDismiss = current.onDismiss === current.notificationDismissHandler ? current.notificationOnDismiss : current.onDismiss
  const duration = current.notificationRevision !== undefined && current.duration === Infinity ? current.notificationDuration : current.duration
  const options = managed({ ...current, duration, onDismiss })
  // Sonner's plain message method clears type; its typed methods preserve it.
  const publish = current.type === 'success' || current.type === 'info' || current.type === 'warning' || current.type === 'error' || current.type === 'loading'
    ? sonner[current.type] : sonner
  publish(current.title, options)
  return true
}

type PromiseOptions<T> = NonNullable<Parameters<typeof sonner.promise<T>>[1]>
function promiseResult(value: unknown, fallback: Omit<ExternalToast, 'description'>) {
  const extended = value && typeof value === 'object' && !isValidElement(value) && 'message' in value
    ? value as ExternalToast & { message: ReactNode }
    : { message: value as ReactNode }
  return { ...managed({ ...fallback, ...extended }), message: extended.message }
}

export const toast: typeof sonner = Object.assign(
  (message: Parameters<typeof sonner>[0], options?: ExternalToast) => sonner(message, managed(options)),
  {
    ...sonner,
    success: (message: Parameters<typeof sonner.success>[0], options?: ExternalToast) => sonner.success(message, managed(options)),
    info: (message: Parameters<typeof sonner.info>[0], options?: ExternalToast) => sonner.info(message, managed(options)),
    warning: (message: Parameters<typeof sonner.warning>[0], options?: ExternalToast) => sonner.warning(message, managed(options)),
    error: (message: Parameters<typeof sonner.error>[0], options?: ExternalToast) => sonner.error(message, managed(options)),
    loading: (message: Parameters<typeof sonner.loading>[0], options?: ExternalToast) => sonner.loading(message, managed(options)),
    message: (message: Parameters<typeof sonner.message>[0], options?: ExternalToast) => sonner.message(message, managed(options)),
    custom: (render: Parameters<typeof sonner.custom>[0], options?: ExternalToast) => sonner.custom(render, managed(options)),
    promise: <T>(promise: Parameters<typeof sonner.promise<T>>[0], data?: PromiseOptions<T>) => {
      if (!data) return sonner.promise(promise, data)
      const { description, ...options } = data
      return sonner.promise(promise, {
        ...data,
        ...managed(options),
        description,
        success: data.success === undefined ? undefined : async (value: T) => promiseResult(await (typeof data.success === 'function' ? data.success(value) : data.success), options),
        error: data.error === undefined ? undefined : async (error: unknown) => promiseResult(await (typeof data.error === 'function' ? data.error(error) : data.error), options),
      })
    },
  },
)
