import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ANGLES, isNsfwPose, isNsfwPoseSystem, posesQuery } from '@/api/gallery'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useStudio } from '@/store/studioStore'
import type { PoseGroup, PoseItem } from '@/types/gallery'

export const Route = createFileRoute('/poses')({
  staticData: { title: '动作姿势库' },
  loader: ({ context }) => context.queryClient.ensureQueryData(posesQuery),
  pendingComponent: () => <Skeleton className="h-[540px] rounded-[22px]" />,
  component: PosesPage,
})

function PosesPage() {
  const { data } = useSuspenseQuery(posesQuery)
  const { recipe, togglePose, safeMode, requestUnlockNsfw } = useStudio()

  const [line, setLine] = useState('')
  const [category, setCategory] = useState('all')
  const [angle, setAngle] = useState('')
  const [viewMode, setViewMode] = useState<'group' | 'single'>('group')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(60)
  const [hoverAngles, setHoverAngles] = useState<Record<string, string>>({})
  const [viewer, setViewer] = useState<{ groupIndex: number; item: PoseItem } | null>(null)

  const activeLine = safeMode && line && isNsfwPoseSystem(line) ? '' : line

  const baseItems = useMemo(
    () => (safeMode ? data.items.filter((x) => !isNsfwPose(x)) : data.items),
    [data.items, safeMode]
  )
  const baseGroups = useMemo(
    () => (safeMode ? data.groups.filter((g) => !isNsfwPose(g)) : data.groups),
    [data.groups, safeMode]
  )
  const visibleLines = useMemo(
    () => (safeMode ? data.lines.filter((l) => !isNsfwPoseSystem(l)) : data.lines),
    [data.lines, safeMode]
  )
  const hiddenNsfwCount = data.items.length - baseItems.length

  const categories = useMemo(() => {
    const filtered = baseItems.filter((x) => !activeLine || x.体系 === activeLine)
    return [...new Set(filtered.map((x) => x.分类).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [baseItems, activeLine])

  const q = query.trim().toLowerCase()

  const filteredGroups = useMemo(() => {
    return baseGroups.filter((g) => {
      if (activeLine && g.system !== activeLine) return false
      if (category !== 'all' && g.category !== category) return false
      return g.items.some((it) => {
        if (angle && it.角度 !== angle) return false
        if (q && !`${it.姿势名称} ${it.id} ${it.分类} ${it.姿势编号} ${it.体系}`.toLowerCase().includes(q)) return false
        return true
      })
    })
  }, [baseGroups, activeLine, category, angle, q])

  const filteredSingles = useMemo(() => {
    return baseItems.filter((it) => {
      if (activeLine && it.体系 !== activeLine) return false
      if (category !== 'all' && it.分类 !== category) return false
      if (angle && it.角度 !== angle) return false
      if (q && !`${it.姿势名称} ${it.id} ${it.分类} ${it.姿势编号} ${it.体系}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [baseItems, activeLine, category, angle, q])

  const resetFilters = () => {
    setLine('')
    setCategory('all')
    setAngle('')
    setQuery('')
    setShown(60)
  }

  // Keyboard navigation in dialog
  useEffect(() => {
    if (!viewer) return
    const onKey = (e: KeyboardEvent) => {
      const grp = filteredGroups[viewer.groupIndex]
      if (!grp) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const dir = e.key === 'ArrowRight' ? 1 : -1
        const idx = grp.order.findIndex((x) => x.id === viewer.item.id)
        const nextItem = grp.order[(idx + dir + grp.order.length) % grp.order.length]
        if (nextItem) setViewer({ groupIndex: viewer.groupIndex, item: nextItem })
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const dir = e.key === 'ArrowDown' ? 1 : -1
        const nextIdx = viewer.groupIndex + dir
        if (nextIdx >= 0 && nextIdx < filteredGroups.length) {
          const nextGrp = filteredGroups[nextIdx]
          const nextItem = nextGrp.angles[viewer.item.角度] || nextGrp.order[0]
          setViewer({ groupIndex: nextIdx, item: nextItem })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewer, filteredGroups])

  const getActiveGroupItem = (group: PoseGroup): PoseItem => {
    const overrideAngle = hoverAngles[group.key]
    if (overrideAngle && group.angles[overrideAngle]) return group.angles[overrideAngle]
    if (angle && group.angles[angle]) return group.angles[angle]
    return group.order[0]
  }

  const totalCount = viewMode === 'group' ? filteredGroups.length : filteredSingles.length

  return (
    <>
      <PageHeader
        title="动作姿势库"
        actions={
          <div className="flex items-center gap-1.5">
            <Button
              variant={viewMode === 'group' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setViewMode('group')
                setShown(60)
              }}
            >
              分组
            </Button>
            <Button
              variant={viewMode === 'single' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setViewMode('single')
                setShown(96)
              }}
            >
              单张
            </Button>
          </div>
        }
      />

      {/* 体系切换药丸 */}
      <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:pb-0">
        <button
          type="button"
          onClick={() => {
            setLine('')
            setCategory('all')
            setShown(60)
          }}
          className={cn(
            'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
            activeLine === '' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
          )}
        >
          全部 ({baseItems.length})
        </button>
        {visibleLines.map((l) => {
          const cnt = data.items.filter((x) => x.体系 === l).length
          const isNsfw = isNsfwPoseSystem(l)
          return (
            <button
              key={l}
              type="button"
              onClick={() => {
                setLine(l)
                setCategory('all')
                setShown(60)
              }}
              className={cn(
                'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                activeLine === l ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              {l} ({cnt}){isNsfw ? ' · 18+' : ''}
            </button>
          )
        })}
        {safeMode && hiddenNsfwCount > 0 && (
          <button
            type="button"
            onClick={() =>
              requestUnlockNsfw(() => {
                setLine('全身单人・性感系')
                setCategory('all')
                setShown(60)
              })
            }
            className="shrink-0 rounded-full border border-dashed border-rose-500/40 bg-rose-500/5 px-3.5 py-1.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400"
          >
            🔒 解锁 18+ 性感/双人系 ({hiddenNsfwCount})
          </button>
        )}
      </div>

      {/* 搜索与筛选面板 */}
      <div className="grid gap-3 rounded-[22px] bg-muted p-4 md:grid-cols-[1fr_200px_auto_auto]">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setShown(60)
            }}
            placeholder="搜索姿势名称、编号 (如 P001)、分类或 ID…"
            className="bg-background pl-9"
          />
        </div>

        <Select
          value={category}
          onValueChange={(v) => {
            setCategory(v)
            setShown(60)
          }}
        >
          <SelectTrigger className="w-full bg-background">
            <SelectValue placeholder="动作分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部动作分类</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-background p-1">
          {['', ...ANGLES].map((a) => (
            <button
              key={a || 'all'}
              type="button"
              onClick={() => {
                setAngle(a)
                setShown(60)
              }}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition',
                angle === a ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {a || '全部视角'}
            </button>
          ))}
        </div>

        <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9">
          <RotateCcwIcon className="size-3.5" />
          重置
        </Button>
      </div>

      {/* 列表区 */}
      {totalCount === 0 ? (
        <EmptyState title="没有找到匹配的姿势" description="试试更换搜索词或重置筛选条件" />
      ) : viewMode === 'group' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filteredGroups.slice(0, shown).map((group, gIdx) => {
            const item = getActiveGroupItem(group)
            const picked = recipe.pose?.id === item.id
            return (
              <div
                key={group.key}
                className="group flex flex-col overflow-hidden rounded-[20px] bg-muted p-2 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div
                  onClick={() => setViewer({ groupIndex: gIdx, item })}
                  className="relative aspect-3/4 cursor-zoom-in overflow-hidden rounded-2xl bg-background"
                >
                  <img
                    src={`/${item.缩略图}`}
                    alt={`${group.name} · ${item.角度}`}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-x-2 top-2 flex items-center justify-between gap-1">
                    <span className="rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {group.number}
                    </span>
                    <span className="rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-900 shadow-xs">
                      {item.角度}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      togglePose(item)
                    }}
                    className={cn(
                      'absolute bottom-2 left-2 flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white shadow transition',
                      picked ? 'bg-emerald-600' : 'bg-black/75 hover:bg-primary'
                    )}
                  >
                    {picked ? <CheckIcon className="size-3" /> : <PlusIcon className="size-3" />}
                    {picked ? '已选' : '加入配方'}
                  </button>
                </div>

                <div className="px-1.5 pt-2.5 pb-1.5">
                  <div className="line-clamp-2 min-h-[36px] text-xs leading-snug font-semibold">{group.name}</div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="truncate">{group.system}</span>
                    <span className="shrink-0 font-medium text-foreground/80">{group.category}</span>
                  </div>
                </div>

                {/* 5 角度缩略图切换条 */}
                <div className="mt-auto grid grid-cols-5 gap-1 pt-1">
                  {ANGLES.map((ang) => {
                    const angItem = group.angles[ang]
                    if (!angItem) return <div key={ang} />
                    const isCurrent = angItem.id === item.id
                    return (
                      <button
                        key={ang}
                        type="button"
                        onMouseEnter={() => setHoverAngles((prev) => ({ ...prev, [group.key]: ang }))}
                        onClick={() => setHoverAngles((prev) => ({ ...prev, [group.key]: ang }))}
                        className={cn(
                          'overflow-hidden rounded-lg border p-0.5 transition',
                          isCurrent ? 'border-primary bg-background' : 'border-transparent opacity-75 hover:opacity-100'
                        )}
                      >
                        <img
                          src={`/${angItem.缩略图}`}
                          alt={ang}
                          loading="lazy"
                          className="aspect-square w-full rounded-md object-cover"
                        />
                        <span className="mt-0.5 block text-center text-[9px] text-muted-foreground">{ang}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {filteredSingles.slice(0, shown).map((item) => {
            const picked = recipe.pose?.id === item.id
            const gIdx = filteredGroups.findIndex((g) => g.items.some((x) => x.id === item.id))
            return (
              <div
                key={item.id}
                className="group flex flex-col overflow-hidden rounded-[20px] bg-muted p-2 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div
                  onClick={() => setViewer({ groupIndex: Math.max(0, gIdx), item })}
                  className="relative aspect-3/4 cursor-zoom-in overflow-hidden rounded-2xl bg-background"
                >
                  <img
                    src={`/${item.缩略图}`}
                    alt={item.姿势名称}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-x-2 top-2 flex items-center justify-between gap-1">
                    <span className="rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {item.姿势编号}
                    </span>
                    <span className="rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-900">
                      {item.角度}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      togglePose(item)
                    }}
                    className={cn(
                      'absolute bottom-2 left-2 flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white shadow transition',
                      picked ? 'bg-emerald-600' : 'bg-black/75 hover:bg-primary'
                    )}
                  >
                    {picked ? <CheckIcon className="size-3" /> : <PlusIcon className="size-3" />}
                    {picked ? '已选' : '加入配方'}
                  </button>
                </div>
                <div className="px-1.5 pt-2 pb-1">
                  <div className="line-clamp-2 text-xs font-semibold">{item.姿势名称}</div>
                  <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{item.id}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {shown < totalCount && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={() => setShown((s) => s + 60)}>
            加载更多（剩余 {totalCount - shown} {viewMode === 'group' ? '组' : '张'}）
          </Button>
        </div>
      )}

      {/* 高清大图预览弹窗 */}
      <Dialog open={Boolean(viewer)} onOpenChange={(o) => !o && setViewer(null)}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-4xl overflow-y-auto p-0 sm:max-w-4xl">
          {viewer && (() => {
            const grp = filteredGroups[viewer.groupIndex]
            const it = viewer.item
            const picked = recipe.pose?.id === it.id
            return (
              <div className="grid md:grid-cols-[1fr_300px]">
                <div className="relative flex max-h-[78vh] min-h-[360px] items-center justify-center bg-muted/60 p-4">
                  <img src={`/${it.原图}`} alt={it.姿势名称} className="max-h-[72vh] w-auto rounded-lg object-contain" />
                  {grp && grp.order.length > 1 && (
                    <>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full shadow"
                        onClick={() => {
                          const idx = grp.order.findIndex((x) => x.id === it.id)
                          const next = grp.order[(idx - 1 + grp.order.length) % grp.order.length]
                          setViewer({ groupIndex: viewer.groupIndex, item: next })
                        }}
                      >
                        <ChevronLeftIcon className="size-4" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full shadow"
                        onClick={() => {
                          const idx = grp.order.findIndex((x) => x.id === it.id)
                          const next = grp.order[(idx + 1) % grp.order.length]
                          setViewer({ groupIndex: viewer.groupIndex, item: next })
                        }}
                      >
                        <ChevronRightIcon className="size-4" />
                      </Button>
                    </>
                  )}
                </div>

                <div className="flex flex-col justify-between gap-4 border-t p-5 md:border-t-0 md:border-l">
                  <div className="space-y-4">
                    <DialogHeader>
                      <div className="flex items-center gap-2">
                        <Badge>{it.姿势编号}</Badge>
                        <Badge variant="outline">{it.角度}</Badge>
                      </div>
                      <DialogTitle className="mt-2 text-lg leading-snug">{it.姿势名称}</DialogTitle>
                    </DialogHeader>

                    <div className="flex items-center justify-between rounded-lg bg-muted px-2.5 py-1.5 font-mono text-xs">
                      <span className="truncate">{it.id}</span>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(it.id)
                          toast.success('已复制姿势 ID')
                        }}
                        className="ml-2 shrink-0 text-primary hover:underline"
                      >
                        <CopyIcon className="size-3.5" />
                      </button>
                    </div>

                    {grp && (
                      <div>
                        <div className="mb-1.5 text-xs font-medium text-muted-foreground">切换视角（← / →）</div>
                        <div className="grid grid-cols-5 gap-1.5">
                          {ANGLES.map((ang) => {
                            const angItem = grp.angles[ang]
                            if (!angItem) return null
                            return (
                              <button
                                key={ang}
                                type="button"
                                onClick={() => setViewer({ groupIndex: viewer.groupIndex, item: angItem })}
                                className={cn(
                                  'overflow-hidden rounded-lg border p-0.5',
                                  angItem.id === it.id ? 'border-primary bg-muted' : 'border-transparent opacity-70'
                                )}
                              >
                                <img src={`/${angItem.缩略图}`} alt={ang} className="aspect-square w-full rounded object-cover" />
                                <span className="mt-0.5 block text-center text-[10px]">{ang}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <dl className="grid grid-cols-[68px_1fr] gap-y-1.5 text-xs">
                      <dt className="text-muted-foreground">所属体系</dt>
                      <dd className="font-medium">{it.体系}</dd>
                      <dt className="text-muted-foreground">动作分类</dt>
                      <dd className="font-medium">{it.分类}</dd>
                      <dt className="text-muted-foreground">原图尺寸</dt>
                      <dd className="font-medium">900 × 1200 PNG</dd>
                    </dl>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button onClick={() => togglePose(it)} variant={picked ? 'secondary' : 'default'}>
                      {picked ? <CheckIcon className="size-4" /> : <PlusIcon className="size-4" />}
                      {picked ? '已在角色配方中（点击移除）' : '加入角色配方'}
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <a href={`/${it.原图}`} download={`${it.id}.png`}>
                          <DownloadIcon className="size-3.5" />
                          下载 PNG
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <a href={`/${it.原图}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLinkIcon className="size-3.5" />
                          新窗口原图
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </>
  )
}
