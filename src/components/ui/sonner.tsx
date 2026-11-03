import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toast, useSonner, type Action, type ToastT, type ToasterProps } from 'sonner'
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon, XIcon } from 'lucide-react'

// 排队时仍保留计时器组件，只暂停倒计时，避免隐藏消息提前过期或重置剩余时间。
function NoticeLifetime({ notice, paused, onExpire }: { notice: ToastT; paused: boolean; onExpire: () => void }) {
  const duration = notice.duration === Infinity || notice.type === 'loading' ? Infinity : Number.isFinite(notice.duration) ? Math.max(0, notice.duration!) : 4000
  const remaining = useRef(duration)
  const callback = useRef(onExpire)
  callback.current = onExpire
  useEffect(() => { remaining.current = duration }, [duration, notice.title, notice.type])
  useEffect(() => {
    if (paused || duration === Infinity) return
    const started = performance.now()
    const timer = window.setTimeout(() => callback.current(), remaining.current)
    return () => { clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (performance.now() - started)) }
  }, [paused, duration, notice.title, notice.type])
  return null
}

function Notice({ notice, closing, front, expanded, dismiss }: { notice: ToastT; closing: boolean; front: boolean; expanded: boolean; dismiss: () => void }) {
  const action = notice.action && typeof notice.action === 'object' && 'label' in notice.action ? notice.action as Action : null
  const Icon = ({success: CircleCheckIcon, error: OctagonXIcon, warning: TriangleAlertIcon, loading: Loader2Icon} as const)[notice.type as 'success' | 'error' | 'warning' | 'loading'] || InfoIcon
  return <div className="app-notice" data-notice-id={String(notice.id)} data-closing={closing} data-kind={notice.type || 'normal'} role={notice.type === 'error' ? 'alert' : 'status'} aria-hidden={!front && !expanded} inert={!front && !expanded}>
    <span className="app-notice-icon" aria-hidden="true">{notice.icon || <Icon className={notice.type === 'loading' ? 'size-4 animate-spin' : 'size-4'} />}</span>
    <div className="app-notice-content">
      <div>{typeof notice.title === 'function' ? notice.title() : notice.title}</div>
      {notice.description && <div className="app-notice-description">{typeof notice.description === 'function' ? notice.description() : notice.description}</div>}
      {notice.action && <div>{action ? <button onClick={(e) => { action.onClick(e); dismiss() }}>{action.label}</button> : notice.action as React.ReactNode}</div>}
    </div>
    <button type="button" className="app-notice-close" aria-label="关闭此通知" tabIndex={front || expanded ? 0 : -1} disabled={closing} onClick={dismiss}><XIcon className="size-3.5" /></button>
  </div>
}

export function Toaster(_props: ToasterProps) {
  const { toasts } = useSonner()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hidden, setHidden] = useState(document.hidden)
  const [visibleCount, setVisibleCount] = useState(3)
  const [closing, setClosing] = useState<Set<ToastT['id']>>(new Set())
  const closeTimers = useRef(new Map<ToastT['id'], number>())
  const heights = useRef(new Map<string, number>())
  const region = useRef<HTMLDivElement>(null)
  const expanded = hovered || focused
  const dismiss = useCallback((notice: ToastT, automatic = false) => {
    if (closeTimers.current.has(notice.id)) return
    setClosing((current) => new Set(current).add(notice.id))
    const delay = document.documentElement.dataset.galleryMotion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160
    closeTimers.current.set(notice.id, window.setTimeout(() => {
      try { if (automatic) notice.onAutoClose?.(notice); else notice.onDismiss?.(notice) }
      finally { toast.dismiss(notice.id) }
    }, delay))
  }, [])
  useEffect(() => () => { closeTimers.current.forEach(clearTimeout) }, [])
  useEffect(() => {
    const live = new Set(toasts.map((notice) => notice.id))
    for (const [id, timer] of closeTimers.current) if (!live.has(id)) { clearTimeout(timer); closeTimers.current.delete(id) }
    setClosing((current) => [...current].some((id) => !live.has(id)) ? new Set([...current].filter((id) => live.has(id))) : current)
    for (const id of heights.current.keys()) if (!toasts.some((notice) => String(notice.id) === id)) heights.current.delete(id)
    if (!toasts.length) setHovered(false)
    if (!region.current?.contains(document.activeElement)) setFocused(false)
  }, [toasts])
  useLayoutEffect(() => {
    const measure = () => {
      const element = region.current
      if (!element) return
      element.querySelectorAll<HTMLElement>('[data-notice-id]').forEach((node) => heights.current.set(node.dataset.noticeId!, node.offsetHeight))
      const budget = Math.max(100, Math.min(360, innerHeight * .45, innerHeight - element.getBoundingClientRect().top - 24))
      let used = 0, count = 0
      for (const notice of toasts.slice(0, 3)) {
        const height = heights.current.get(String(notice.id)) ?? 72
        if (count && used + height + 8 > budget) break
        used += height + (count ? 8 : 0); count++
      }
      setVisibleCount(Math.max(1, count))
    }
    measure()
    const observer = new ResizeObserver(measure)
    region.current?.querySelectorAll('[data-notice-id]').forEach((node) => observer.observe(node))
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [toasts, visibleCount, expanded])
  useEffect(() => {
    const reset = () => { setHovered(false); setFocused(false) }
    const visibility = () => { setHidden(document.hidden); reset() }
    const outside = (e: PointerEvent) => { if (region.current && !region.current.contains(e.target as Node)) reset() }
    window.addEventListener('blur', reset); window.addEventListener('pointercancel', reset)
    document.addEventListener('visibilitychange', visibility); document.addEventListener('pointerdown', outside)
    return () => { window.removeEventListener('blur', reset); window.removeEventListener('pointercancel', reset); document.removeEventListener('visibilitychange', visibility); document.removeEventListener('pointerdown', outside) }
  }, [])
  return <>
    {toasts.map((notice, index) => <NoticeLifetime key={notice.id} notice={notice} paused={index >= visibleCount || expanded || hidden || closing.has(notice.id)} onExpire={() => dismiss(notice, true)} />)}
    <div ref={region} className="app-notices" data-expanded={expanded} data-queued={Math.max(0, toasts.length - visibleCount)} role="region" aria-label="操作通知" onPointerEnter={(e) => {if (e.pointerType !== 'touch') setHovered(true)}} onPointerLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={(e) => {if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false)}} onKeyDown={(e) => {if (e.key === 'Escape' && toasts[0]) { e.stopPropagation(); dismiss(toasts[0]) }}}>
      {toasts.slice(0, visibleCount).map((notice, index) => <div key={notice.id} className="app-notice-layer" data-front={index === 0} style={{'--notice-index': index, zIndex: 3 - index} as React.CSSProperties} onPointerDown={(e) => {if (e.pointerType === 'touch' && !(e.target as HTMLElement).closest('button')) setHovered(true)}}>
        <Notice notice={notice} closing={closing.has(notice.id)} front={index === 0} expanded={expanded} dismiss={() => dismiss(notice)} />
      </div>)}
    </div>
  </>
}
