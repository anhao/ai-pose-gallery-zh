import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Toaster as Sonner, useSonner, type ToasterProps } from 'sonner'
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon } from 'lucide-react'
import { adoptNotification, toast, type Notification } from '@/lib/notifications'
import { useTheme } from '@/components/theme/ThemeProvider'

function Lifetime({ notice, paused }: { notice: Notification; paused: boolean }) {
  const duration = notice.notificationDuration ?? 4000
  const remaining = useRef(duration)
  useEffect(() => { remaining.current = duration }, [duration, notice.type, notice.notificationRevision])
  useEffect(() => {
    if (paused || notice.type === 'loading' || duration === Infinity) return
    const started = performance.now()
    const timer = window.setTimeout(() => {
      if (notice.notificationAutoClosing) notice.notificationAutoClosing.current = true
      try { notice.onAutoClose?.(notice) }
      finally { toast.dismiss(notice.id) }
    }, Math.max(0, remaining.current))
    return () => {
      clearTimeout(timer)
      remaining.current = Math.max(0, remaining.current - (performance.now() - started))
    }
  }, [paused, duration, notice])
  return null
}

export function Toaster(props: ToasterProps) {
  const { theme } = useTheme()
  const { toasts } = useSonner()
  const region = useRef<HTMLElement>(null)
  const events = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [toggleFocused, setToggleFocused] = useState(false)
  const [toggleTop, setToggleTop] = useState(128)
  const [background, setBackground] = useState(document.hidden || !document.hasFocus())
  const [visibleCount, setVisibleCount] = useState(3)
  const [readable, setReadable] = useState<Set<Notification['id']>>(new Set())

  useLayoutEffect(() => { toasts.forEach(adoptNotification) }, [toasts])

  useLayoutEffect(() => {
    const root = region.current
    if (!root) return
    const measure = () => {
      const nodes = [...root.querySelectorAll<HTMLElement>('[data-sonner-toast]')]
      const active = nodes.filter((node) => node.dataset.removed !== 'true')
      const top = root.querySelector('[data-sonner-toaster]')?.getBoundingClientRect().top ?? 64
      const toggleSpace = toasts.length > 1 && matchMedia('(pointer: coarse)').matches ? 52 : 0
      const budget = Math.max(0, (window.visualViewport?.height ?? innerHeight) - top - 24 - toggleSpace)
      let count = 0, used = 0
      for (const node of active.slice(0, 3)) {
        const height = parseFloat(node.style.getPropertyValue('--initial-height')) || node.offsetHeight
        if (count && used + height + 8 > budget) break
        used += height + (count ? 8 : 0)
        count++
      }
      setVisibleCount(Math.max(1, count))
      const visible = active.filter((node) => node.dataset.visible === 'true')
      const frontHeight = visible[0]?.offsetHeight ?? 56
      const stackHeight = visible.reduce((height, node, index) => {
        const bottom = node.dataset.expanded === 'true'
          ? (parseFloat(node.style.getPropertyValue('--offset')) || 0) + node.offsetHeight
          : frontHeight + index * 8
        return Math.max(height, bottom)
      }, frontHeight)
      setToggleTop(top + stackHeight + 8)
      const next = new Set<Notification['id']>()
      for (const node of nodes) {
        const accessible = node.dataset.visible === 'true' && node.dataset.mounted === 'true' && node.dataset.removed !== 'true' && (node.dataset.front === 'true' || node.dataset.expanded === 'true')
        node.inert = !accessible
        node.setAttribute('aria-hidden', String(!accessible))
        if (accessible) {
          const marker = [...node.classList].find((name) => name.startsWith('app-notification-'))
          // A promise resolving directly to a React element bypasses Sonner's result options.
          const notice = marker ? toasts.find((item: Notification) => marker === `app-notification-${item.notificationRevision}`) : toasts[active.indexOf(node)]
          if (notice) next.add(notice.id)
        }
      }
      setReadable((current) => current.size === next.size && [...current].every((name) => next.has(name)) ? current : next)
    }
    measure()
    const observer = new MutationObserver(measure)
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-visible', 'data-mounted', 'data-expanded', 'data-removed', 'style', 'class'] })
    const resize = new ResizeObserver(measure)
    resize.observe(root)
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    return () => { observer.disconnect(); resize.disconnect(); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure) }
  }, [toasts])

  useEffect(() => {
    if (!toasts.length) { setExpanded(false); setHovered(false); setFocused(false); setToggleFocused(false) }
  }, [toasts.length])

  useEffect(() => {
    const reset = () => { setHovered(false); setExpanded(false); setFocused(false); setToggleFocused(false) }
    const visibility = () => { setBackground(document.hidden || !document.hasFocus()); if (document.hidden) reset() }
    const outside = (event: PointerEvent) => { if (!events.current?.contains(event.target as Node)) setExpanded(false) }
    const blur = () => { setBackground(true); reset() }
    window.addEventListener('blur', blur)
    window.addEventListener('focus', visibility)
    window.addEventListener('pointercancel', reset)
    document.addEventListener('visibilitychange', visibility)
    document.addEventListener('pointerdown', outside)
    return () => { window.removeEventListener('blur', blur); window.removeEventListener('focus', visibility); window.removeEventListener('pointercancel', reset); document.removeEventListener('visibilitychange', visibility); document.removeEventListener('pointerdown', outside) }
  }, [])

  return <>
    {toasts.map((notice: Notification) => <Lifetime key={notice.id} notice={notice} paused={notice.notificationRevision === undefined || background || hovered || focused || toggleFocused || expanded || !readable.has(notice.id)} />)}
    <div ref={events} className="app-notification-events"
      onPointerEnter={(event) => { if (event.pointerType !== 'touch') setHovered(true) }}
      onPointerLeave={() => setHovered(false)}
      onPointerDownCapture={(event) => { if (event.pointerType === 'touch' && !(event.target as HTMLElement).closest('.app-notification-toggle')) setExpanded(true) }}
      onFocusCapture={(event) => {
        const toggle = (event.target as HTMLElement).closest('.app-notification-toggle') !== null
        setToggleFocused(toggle); setFocused(!toggle)
      }}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { setFocused(false); setToggleFocused(false) } }}
      onKeyDownCapture={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        const target = (event.target as HTMLElement).closest('[data-sonner-toast]')
        const notice = toasts.find((item: Notification) => target?.classList.contains(`app-notification-${item.notificationRevision}`)) ?? toasts[0]
        if (notice && notice.dismissible !== false && notice.type !== 'loading') toast.dismiss(notice.id)
        setExpanded(false)
      }}>
      <Sonner {...props} ref={region} theme={theme} className="app-notifications" position="top-center"
        richColors={false} closeButton duration={Infinity} visibleToasts={visibleCount} expand={expanded || focused} gap={8}
        offset={{ top: 'calc(64px + env(safe-area-inset-top, 0px))', left: 12, right: 12 }}
        mobileOffset={{ top: 'calc(64px + env(safe-area-inset-top, 0px))', left: 12, right: 12 }}
        customAriaLabel="操作通知（Alt+T 聚焦，Esc 关闭）"
        hotkey={['altKey', 'KeyT']}
        toastOptions={{ ...props.toastOptions, closeButtonAriaLabel: '关闭此通知' }}
        icons={{ success: <CircleCheckIcon size={18} />, info: <InfoIcon size={18} />, warning: <TriangleAlertIcon size={18} />, error: <OctagonXIcon size={18} /> }} />
      {toasts.length > 1 && <button type="button" className="app-notification-toggle" style={{ top: toggleTop }}
        aria-expanded={expanded || focused} onClick={() => { setFocused(false); setExpanded((current) => !current) }}>
        {expanded || focused ? '收起通知' : '展开通知'}
      </button>}
    </div>
  </>
}
