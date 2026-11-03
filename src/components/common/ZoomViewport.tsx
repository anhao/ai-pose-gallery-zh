import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { MinusIcon, PlusIcon, RotateCcwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ZoomViewportProps {
  imageUrl?: string
  alt?: string
  children?: ReactNode
  contentWidth?: number
  contentHeight?: number
  resetKey?: string | number
  className?: string
}

/** Zoom is relative to fit, so 100% always shows the complete image. */
export function ZoomViewport(props: ZoomViewportProps) {
  return <ZoomSurface key={`${props.imageUrl}|${props.resetKey}|${props.contentWidth}|${props.contentHeight}`} {...props} />
}

function ZoomSurface({ imageUrl, alt = '图片预览', children, contentWidth = 1000, contentHeight = 1400, className }: ZoomViewportProps) {
  const viewport = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 1, height: 1 })
  const [natural, setNatural] = useState({ width: contentWidth, height: contentHeight })
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })
  const current = useRef(view)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const previous = useRef<{ x: number; y: number; distance: number } | null>(null)
  const fit = Math.min(size.width / natural.width, size.height / natural.height)
  const clamp = (zoom: number, x: number, y: number) => {
    const maxX = Math.max(0, (natural.width * fit * zoom - size.width) / 2)
    const maxY = Math.max(0, (natural.height * fit * zoom - size.height) / 2)
    return { zoom, x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) }
  }
  const update = (next: typeof view) => { current.current = next; setView(next) }
  const reset = () => { pointers.current.clear(); previous.current = null; update({ zoom: 1, x: 0, y: 0 }) }
  const zoomAt = (zoom: number, x = 0, y = 0) => {
    const old = current.current
    const nextZoom = Math.max(1, Math.min(8, zoom))
    const ratio = nextZoom / old.zoom
    update(clamp(nextZoom, x - (x - old.x) * ratio, y - (y - old.y) * ratio))
  }
  useEffect(() => {
    const el = viewport.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      pointers.current.clear(); previous.current = null
      current.current = { zoom: 1, x: 0, y: 0 }; setView(current.current)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const handleWheel = useEffectEvent((event: WheelEvent) => {
    event.preventDefault()
    const rect = viewport.current!.getBoundingClientRect()
    zoomAt(current.current.zoom * Math.exp(-event.deltaY * 0.002), event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2)
  })
  useEffect(() => {
    const el = viewport.current
    if (!el) return
    const wheel = (event: WheelEvent) => handleWheel(event)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])
  const gesture = () => {
    const points = [...pointers.current.values()]
    if (!points.length) return null
    if (points.length === 1) return { ...points[0], distance: 0 }
    return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2, distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) }
  }
  return <div className={cn('flex min-h-0 w-full flex-col gap-2', className)}>
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-2" aria-label="图片缩放控制">
      <Button type="button" variant="outline" className="min-h-11 min-w-11" aria-label="缩小图片" disabled={view.zoom <= 1} onClick={() => zoomAt(current.current.zoom / 1.25)}><MinusIcon className="size-4" /></Button>
      <span className="min-w-16 text-center text-sm tabular-nums" aria-live="polite">{Math.round(view.zoom * 100)}%</span>
      <Button type="button" variant="outline" className="min-h-11 min-w-11" aria-label="放大图片" disabled={view.zoom >= 8} onClick={() => zoomAt(current.current.zoom * 1.25)}><PlusIcon className="size-4" /></Button>
      <Button type="button" variant="outline" className="min-h-11" onClick={reset}><RotateCcwIcon className="size-4" />适应窗口</Button>
    </div>
    <div ref={viewport} tabIndex={0} role="region" aria-label={`${alt}；加减键缩放，方向键移动，0 键复位`}
      className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-muted/60 outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
      style={{ touchAction: 'none', cursor: view.zoom > 1 ? 'grab' : 'default' }}
      onKeyDown={(e) => {
        if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(current.current.zoom * 1.25) }
        if (e.key === '-') { e.preventDefault(); zoomAt(current.current.zoom / 1.25) }
        if (e.key === '0' || e.key === 'Home') { e.preventDefault(); reset() }
        const delta: Record<string, [number, number]> = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }
        if (delta[e.key] && current.current.zoom > 1) { e.preventDefault(); e.stopPropagation(); const [x, y] = delta[e.key]; update(clamp(current.current.zoom, current.current.x + x, current.current.y + y)) }
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId)
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); previous.current = gesture()
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId)) return
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        const next = gesture(), old = previous.current
        if (next && old) {
          const rect = e.currentTarget.getBoundingClientRect()
          if (next.distance > 0 && old.distance > 0) zoomAt(current.current.zoom * next.distance / old.distance, old.x - rect.left - rect.width / 2, old.y - rect.top - rect.height / 2)
          update(clamp(current.current.zoom, current.current.x + next.x - old.x, current.current.y + next.y - old.y))
        }
        previous.current = next
      }}
      onPointerUp={(e) => { pointers.current.delete(e.pointerId); previous.current = gesture() }}
      onPointerCancel={(e) => { pointers.current.delete(e.pointerId); previous.current = gesture() }}
      onLostPointerCapture={(e) => { pointers.current.delete(e.pointerId); previous.current = gesture() }}>
      <div className="pointer-events-none absolute top-1/2 left-1/2 origin-center select-none" style={{ width: natural.width, height: natural.height, transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${fit * view.zoom})` }}>
        {children ?? (imageUrl && <img src={imageUrl} alt={alt} draggable={false} className="h-full w-full object-contain" onLoad={(e) => { setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight }); reset() }} />)}
      </div>
    </div>
    <p className="shrink-0 text-center text-xs text-muted-foreground">滚轮或双指缩放 · 放大后拖动 · 100% 为适应窗口</p>
  </div>
}
