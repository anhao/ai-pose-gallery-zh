import { useEffect, useEffectEvent, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { MinusIcon, PlusIcon, RotateCcwIcon, XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { comparisonReferences } from '@/lib/comparisonReferences'
import type { GenerationHistoryItem } from '@/types/gallery'

interface Props { result: GenerationHistoryItem | null; open: boolean; onOpenChange: (open: boolean) => void }
interface View { zoom: number; x: number; y: number }
interface Dimensions { width: number; height: number }
const initialView: View = { zoom: 1, x: 0, y: 0 }

export function ReferenceComparisonDialog({ result, open, onOpenChange }: Props) {
  const returnFocus = useRef<HTMLElement | null>(null)
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/60" />
      <DialogPrimitive.Content
        onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null }}
        onCloseAutoFocus={(event) => { if (returnFocus.current?.isConnected) { event.preventDefault(); returnFocus.current.focus() } }}
        className="fixed top-1/2 left-1/2 z-[101] flex h-[94dvh] w-[96vw] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-xl bg-background p-3 text-foreground shadow-xl outline-none sm:p-4">
        <div className="flex shrink-0 items-center gap-2">
          <DialogPrimitive.Title className="mr-auto text-lg font-semibold">对比参考</DialogPrimitive.Title>
          <DialogPrimitive.Close asChild><Button variant="ghost" className="min-h-11 min-w-11" aria-label="关闭参考对比"><XIcon className="size-4" /></Button></DialogPrimitive.Close>
        </div>
        <DialogPrimitive.Description className="shrink-0 text-xs text-muted-foreground">参考来自这次生成保存的提交快照。两图共同缩放与移动，按原比例显示。</DialogPrimitive.Description>
        {result && <ComparisonContent key={result.id} result={result} />}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
}

function ComparisonContent({ result }: { result: GenerationHistoryItem }) {
  const refs = comparisonReferences(result)
  const [selected, setSelected] = useState(refs[0]?.id || '')
  const [mode, setMode] = useState<'side' | 'slider'>('side')
  const [split, setSplit] = useState(50)
  const [requestedView, setView] = useState<View>(initialView)
  const [natural, setNatural] = useState<Record<string, Dimensions>>({})
  const [panes, setPanes] = useState<Record<string, Dimensions>>({})
  const current = useRef(initialView)
  const reference = refs.find((item) => item.id === selected) || refs[0]
  const clampView = (next: View) => {
    const zoom = Math.max(1, Math.min(8, next.zoom))
    const bounds = [[result.imageUrl, 'result'], ...(reference ? [[reference.url, 'reference']] : [])].flatMap(([url, paneId]) => {
      const image = natural[url], pane = panes[mode === 'slider' && reference ? 'slider' : paneId]
      if (!image || !pane || !pane.width || !pane.height) return []
      const fit = Math.min(pane.width / image.width, pane.height / image.height)
      return [{ x: Math.max(0, (image.width * fit * zoom / pane.width - 1) / 2), y: Math.max(0, (image.height * fit * zoom / pane.height - 1) / 2) }]
    })
    const maxX = bounds.length ? Math.min(...bounds.map((bound) => bound.x)) : 0
    const maxY = bounds.length ? Math.min(...bounds.map((bound) => bound.y)) : 0
    return { zoom, x: Math.max(-maxX, Math.min(maxX, next.x)), y: Math.max(-maxY, Math.min(maxY, next.y)) }
  }
  // Intersect the two contain-fitted image bounds, including after a responsive resize.
  const view = clampView(requestedView)
  const update = (next: View) => {
    current.current = clampView(next)
    setView(current.current)
  }
  const imageSize = (url: string, size: Dimensions) => setNatural((previous) => previous[url]?.width === size.width && previous[url]?.height === size.height ? previous : { ...previous, [url]: size })
  const paneSize = (id: string, size: Dimensions) => setPanes((previous) => previous[id]?.width === size.width && previous[id]?.height === size.height ? previous : { ...previous, [id]: size })
  const zoomAt = (zoom: number, x = 0, y = 0) => {
    const old = clampView(current.current), nextZoom = Math.max(1, Math.min(8, zoom)), ratio = nextZoom / old.zoom
    update({ zoom: nextZoom, x: x - (x - old.x) * ratio, y: y - (y - old.y) * ratio })
  }
  const transform: CSSProperties = { transform: `translate(${view.x * 100}%, ${view.y * 100}%) scale(${view.zoom})` }
  const controls = <div className="flex shrink-0 flex-wrap items-center justify-center gap-2" aria-label="共同缩放控制">
    <Button variant="outline" className="min-h-11 min-w-11" aria-label="共同缩小" disabled={view.zoom <= 1} onClick={() => zoomAt(current.current.zoom / 1.25)}><MinusIcon className="size-4" /></Button>
    <span className="min-w-14 text-center text-sm tabular-nums" aria-live="polite">{Math.round(view.zoom * 100)}%</span>
    <Button variant="outline" className="min-h-11 min-w-11" aria-label="共同放大" disabled={view.zoom >= 8} onClick={() => zoomAt(current.current.zoom * 1.25)}><PlusIcon className="size-4" /></Button>
    <Button variant="outline" className="min-h-11" onClick={() => update(initialView)}><RotateCcwIcon className="size-4" />复位</Button>
  </div>
  const gestureProps = { view, update, zoomAt }
  return <>
    {reference ? <div className="flex shrink-0 flex-wrap items-center gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">选择参考
        <select aria-label="选择本次生成的参考" value={reference.id} onChange={(e) => { setSelected(e.target.value); update(initialView) }} className="min-h-11 min-w-0 flex-1 rounded-md border bg-background px-2">
          {refs.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <div className="flex gap-2" aria-label="对比模式">
        <Button variant={mode === 'side' ? 'default' : 'outline'} className="min-h-11" aria-pressed={mode === 'side'} onClick={() => setMode('side')}>并排</Button>
        <Button variant={mode === 'slider' ? 'default' : 'outline'} className="min-h-11" aria-pressed={mode === 'slider'} onClick={() => setMode('slider')}>滑杆</Button>
      </div>
    </div> : <p role="status" className="shrink-0 rounded-lg bg-muted p-3 text-sm">{result.snapshot ? '这条提交快照没有可用的参考图。' : '这条旧记录没有生成快照，无法确定当时的参考图。'}仍可查看生成结果。</p>}
    {controls}
    {reference && mode === 'slider' ? <ComparisonSurface {...gestureProps} onSize={(size) => paneSize('slider', size)} label="滑杆对比" className="min-h-0 flex-1">
      <ComparisonImage key={`result:${result.imageUrl}`} url={result.imageUrl} label="生成结果" transform={transform} onSize={(size) => imageSize(result.imageUrl, size)} />
      <div className="absolute inset-0 bg-muted" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
        <ComparisonImage key={reference.url} url={reference.url} label={reference.label} transform={transform} onSize={(size) => imageSize(reference.url, size)} />
      </div>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary shadow" style={{ left: `${split}%` }} />
      <div className="pointer-events-none absolute inset-x-2 top-2 flex justify-between text-xs"><span className="rounded bg-background/90 px-2 py-1">参考图</span><span className="rounded bg-background/90 px-2 py-1">生成结果</span></div>
    </ComparisonSurface> : <div className={`grid min-h-0 flex-1 gap-2 ${reference ? 'grid-rows-2 md:grid-cols-2 md:grid-rows-1' : 'grid-cols-1'}`}>
      {reference && <ComparisonSurface {...gestureProps} onSize={(size) => paneSize('reference', size)} label={reference.label}><ComparisonImage key={reference.url} url={reference.url} label={reference.label} transform={transform} onSize={(size) => imageSize(reference.url, size)} /><PaneLabel label={reference.label} /></ComparisonSurface>}
      <ComparisonSurface {...gestureProps} onSize={(size) => paneSize('result', size)} label="生成结果"><ComparisonImage key={result.imageUrl} url={result.imageUrl} label="生成结果" transform={transform} onSize={(size) => imageSize(result.imageUrl, size)} /><PaneLabel label="生成结果" /></ComparisonSurface>
    </div>}
    {reference && mode === 'slider' && <label className="flex shrink-0 items-center gap-3 text-sm">参考占比<input type="range" min={0} max={100} value={split} aria-label="参考图显示比例" aria-valuetext={`${split}% 参考图`} onChange={(e) => setSplit(Number(e.target.value))} className="h-11 min-w-0 flex-1 accent-primary" /><span className="w-10 tabular-nums">{split}%</span></label>}
    <p className="shrink-0 text-center text-xs text-muted-foreground">滚轮或双指共同缩放 · 放大后拖动 · 加减键缩放、方向键移动、0 键复位</p>
  </>
}

function PaneLabel({ label }: { label: string }) { return <span className="pointer-events-none absolute top-2 left-2 max-w-[calc(100%-1rem)] truncate rounded bg-background/90 px-2 py-1 text-xs">{label}</span> }

function ComparisonImage({ url, label, transform, onSize }: { url: string; label: string; transform: CSSProperties; onSize: (size: Dimensions) => void }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading')
  return <>
    {state !== 'failed' && <img src={url} alt={label} draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain" style={transform} onLoad={(e) => { setState('loaded'); onSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight }) }} onError={() => setState('failed')} />}
    {state !== 'loaded' && <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-muted-foreground">{state === 'loading' ? '图片加载中…' : `${label}加载失败，可选择其他参考或稍后重试。`}</div>}
  </>
}

function ComparisonSurface({ children, label, className = '', view, update, zoomAt, onSize }: {
  children: ReactNode; label: string; className?: string; view: View; update: (next: View) => void; zoomAt: (zoom: number, x?: number, y?: number) => void; onSize: (size: Dimensions) => void
}) {
  const surface = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const previous = useRef<{ x: number; y: number; distance: number } | null>(null)
  const reportSize = useEffectEvent(onSize)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => { reportSize({ width: entry.contentRect.width, height: entry.contentRect.height }); pointers.current.clear(); previous.current = null })
    observer.observe(surface.current!)
    return () => observer.disconnect()
  }, [])
  const point = (clientX: number, clientY: number) => { const rect = surface.current!.getBoundingClientRect(); return { x: (clientX - rect.left) / rect.width - 0.5, y: (clientY - rect.top) / rect.height - 0.5 } }
  const handleWheel = useEffectEvent((e: WheelEvent) => { e.preventDefault(); const p = point(e.clientX, e.clientY); zoomAt(view.zoom * Math.exp(-e.deltaY * 0.002), p.x, p.y) })
  useEffect(() => { const el = surface.current!; const wheel = (e: WheelEvent) => handleWheel(e); el.addEventListener('wheel', wheel, { passive: false }); return () => el.removeEventListener('wheel', wheel) }, [])
  const gesture = () => {
    const points = [...pointers.current.values()]
    if (!points.length) return null
    const a = points[0], b = points[1] || a
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) }
  }
  const release = (e: PointerEvent<HTMLDivElement>) => { pointers.current.delete(e.pointerId); previous.current = gesture() }
  return <div ref={surface} role="region" tabIndex={0} aria-label={`${label}；共同缩放和移动`} className={`relative min-h-0 overflow-hidden rounded-lg bg-muted outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring ${className}`} style={{ touchAction: 'none', cursor: view.zoom > 1 ? 'grab' : 'default' }}
    onKeyDown={(e) => {
      const old = view
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(old.zoom * 1.25) }
      if (e.key === '-') { e.preventDefault(); zoomAt(old.zoom / 1.25) }
      if (e.key === '0' || e.key === 'Home') { e.preventDefault(); update(initialView) }
      const delta: Record<string, [number, number]> = { ArrowLeft: [0.05, 0], ArrowRight: [-0.05, 0], ArrowUp: [0, 0.05], ArrowDown: [0, -0.05] }
      if (delta[e.key]) { e.preventDefault(); const [x, y] = delta[e.key]; update({ ...old, x: old.x + x, y: old.y + y }) }
    }}
    onPointerDown={(e) => { if (e.button !== 0) return; e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); previous.current = gesture() }}
    onPointerMove={(e) => {
      if (!pointers.current.has(e.pointerId)) return
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const next = gesture(), old = previous.current, state = view
      if (next && old) {
        const p = point(next.x, next.y), before = point(old.x, old.y)
        const zoom = next.distance && old.distance ? Math.max(1, Math.min(8, state.zoom * next.distance / old.distance)) : state.zoom
        const ratio = zoom / state.zoom
        update({ zoom, x: p.x - (before.x - state.x) * ratio, y: p.y - (before.y - state.y) * ratio })
      }
      previous.current = next
    }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>{children}</div>
}
