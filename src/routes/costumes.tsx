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
import { costumesQuery, isNsfwCostume, isNsfwCostumeCategory } from '@/api/gallery'
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

export const Route = createFileRoute('/costumes')({
  staticData: { title: '服装穿搭库' },
  loader: ({ context }) => context.queryClient.ensureQueryData(costumesQuery),
  pendingComponent: () => <Skeleton className="h-[540px] rounded-[22px]" />,
  component: CostumesPage,
})

function CostumesPage() {
  const { data: costumes } = useSuspenseQuery(costumesQuery)
  const { recipe, toggleCostume, safeMode, requestUnlockNsfw } = useStudio()

  const [category, setCategory] = useState('')
  const [tag, setTag] = useState('all')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(60)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  const activeCategory = safeMode && category && isNsfwCostumeCategory(category) ? '' : category

  const baseCostumes = useMemo(
    () => (safeMode ? costumes.filter((x) => !isNsfwCostume(x)) : costumes),
    [costumes, safeMode]
  )
  const hiddenNsfwCount = costumes.length - baseCostumes.length

  const categories = useMemo(
    () => [...new Set(baseCostumes.map((x) => x.分类))],
    [baseCostumes]
  )

  const allTags = useMemo(() => {
    const subset = baseCostumes.filter((x) => !activeCategory || x.分类 === activeCategory)
    return [...new Set(subset.flatMap((x) => x.标签 || []))]
  }, [baseCostumes, activeCategory])

  const q = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    return baseCostumes.filter((item) => {
      if (activeCategory && item.分类 !== activeCategory) return false
      if (tag !== 'all' && !(item.标签 || []).includes(tag)) return false
      if (q && !item.检索.toLowerCase().includes(q)) return false
      return true
    })
  }, [baseCostumes, activeCategory, tag, q])

  const currentItem = viewerIndex !== null ? filtered[viewerIndex] : null

  useEffect(() => {
    if (viewerIndex === null || !filtered.length) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setViewerIndex((viewerIndex + 1) % filtered.length)
      } else if (e.key === 'ArrowLeft') {
        setViewerIndex((viewerIndex - 1 + filtered.length) % filtered.length)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewerIndex, filtered.length])

  return (
    <>
      <PageHeader title="服装穿搭库" />

      {/* 分类筛选药丸 */}
      <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:pb-0">
        <button
          type="button"
          onClick={() => {
            setCategory('')
            setTag('all')
            setShown(60)
          }}
          className={cn(
            'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
            activeCategory === '' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
          )}
        >
          全部穿搭 ({baseCostumes.length})
        </button>
        {categories.map((c) => {
          const cnt = costumes.filter((x) => x.分类 === c).length
          const isNsfw = isNsfwCostumeCategory(c)
          return (
            <button
              key={c}
              type="button"
              onClick={() => {
                setCategory(c)
                setTag('all')
                setShown(60)
              }}
              className={cn(
                'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                activeCategory === c ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              {c} ({cnt}){isNsfw ? ' · 18+' : ''}
            </button>
          )
        })}
        {safeMode && hiddenNsfwCount > 0 && (
          <button
            type="button"
            onClick={() =>
              requestUnlockNsfw(() => {
                setCategory('性感穿搭')
                setTag('all')
                setShown(60)
              })
            }
            className="shrink-0 rounded-full border border-dashed border-rose-500/40 bg-rose-500/5 px-3.5 py-1.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400"
          >
            🔒 解锁 18+ 内衣/性感穿搭 ({hiddenNsfwCount})
          </button>
        )}
      </div>

      {/* 搜索与单品筛选栏 */}
      <div className="grid gap-3 rounded-[22px] bg-muted p-4 md:grid-cols-[1fr_220px_auto]">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setShown(60)
            }}
            placeholder="搜索服装款式、颜色、材质、英文词条 (如 denim, lace, 针织, 迷你裙)…"
            className="bg-background pl-9"
          />
        </div>

        <Select
          value={tag}
          onValueChange={(v) => {
            setTag(v)
            setShown(60)
          }}
        >
          <SelectTrigger className="w-full bg-background">
            <SelectValue placeholder="单品/颜色标签" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部单品与颜色标签</SelectItem>
            {allTags.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => {
            setCategory('')
            setTag('all')
            setQuery('')
            setShown(60)
          }}
        >
          <RotateCcwIcon className="size-3.5" />
          重置
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="没有找到匹配的服装穿搭" description="试试更换搜索词或切换分类" />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.slice(0, shown).map((item, idx) => {
            const picked = recipe.costume?.id === item.id
            return (
              <div
                key={item.id}
                className="group flex flex-col overflow-hidden rounded-[20px] bg-muted p-2 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div
                  onClick={() => setViewerIndex(idx)}
                  className="relative aspect-2/3 cursor-zoom-in overflow-hidden rounded-2xl bg-background"
                >
                  <img
                    src={`/${item.缩略图}`}
                    alt={item.服装名称}
                    loading="lazy"
                    className="h-full w-full object-contain transition duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-x-2 top-2 flex items-center justify-between gap-1">
                    <span className="rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                      {item.id}
                    </span>
                    <span className="rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-900">
                      {item.分类}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleCostume(item)
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

                <div className="flex flex-1 flex-col justify-between px-1.5 pt-2.5 pb-1">
                  <div>
                    <div className="line-clamp-2 text-xs leading-snug font-semibold">{item.服装名称}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {(item.标签 || []).slice(0, 5).map((t) => (
                        <span key={t} className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-2 truncate font-mono text-[10px] text-muted-foreground">{item.关键词}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {shown < filtered.length && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={() => setShown((s) => s + 60)}>
            加载更多（剩余 {filtered.length - shown} 套）
          </Button>
        </div>
      )}

      {/* 服装详情弹窗 */}
      <Dialog open={viewerIndex !== null} onOpenChange={(o) => !o && setViewerIndex(null)}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-4xl overflow-y-auto p-0 sm:max-w-4xl">
          {currentItem && viewerIndex !== null && (() => {
            const picked = recipe.costume?.id === currentItem.id
            return (
              <div className="grid md:grid-cols-[1fr_320px]">
                <div className="relative flex max-h-[78vh] min-h-[380px] items-center justify-center bg-muted/60 p-4">
                  <img
                    src={`/${currentItem.预览图 || currentItem.原图}`}
                    alt={currentItem.服装名称}
                    className="max-h-[72vh] w-auto rounded-lg object-contain"
                  />
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full shadow"
                    onClick={() => setViewerIndex((viewerIndex - 1 + filtered.length) % filtered.length)}
                  >
                    <ChevronLeftIcon className="size-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full shadow"
                    onClick={() => setViewerIndex((viewerIndex + 1) % filtered.length)}
                  >
                    <ChevronRightIcon className="size-4" />
                  </Button>
                </div>

                <div className="flex flex-col justify-between gap-4 border-t p-5 md:border-t-0 md:border-l">
                  <div className="space-y-4">
                    <DialogHeader>
                      <div className="flex items-center gap-2">
                        <Badge>{currentItem.分类}</Badge>
                        <Badge variant="outline">{currentItem.id}</Badge>
                      </div>
                      <DialogTitle className="mt-2 text-base leading-snug">{currentItem.服装名称}</DialogTitle>
                    </DialogHeader>

                    <div>
                      <div className="mb-1.5 text-xs font-medium text-muted-foreground">中文单品与色彩标签</div>
                      <div className="flex flex-wrap gap-1.5">
                        {(currentItem.标签 || []).map((t) => (
                          <Badge key={t} variant="secondary" className="text-xs">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
                        <span>英文 Prompt 词条</span>
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(currentItem.关键词)
                            toast.success('已复制英文服装 Prompt')
                          }}
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <CopyIcon className="size-3" />
                          复制
                        </button>
                      </div>
                      <div className="rounded-xl bg-muted p-2.5 font-mono text-xs leading-relaxed">
                        {currentItem.关键词}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button onClick={() => toggleCostume(currentItem)} variant={picked ? 'secondary' : 'default'}>
                      {picked ? <CheckIcon className="size-4" /> : <PlusIcon className="size-4" />}
                      {picked ? '已在角色配方中（点击移除）' : '加入角色配方'}
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <a href={`/${currentItem.原图}`} download={`${currentItem.id}.webp`}>
                          <DownloadIcon className="size-3.5" />
                          下载高清原图
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <a href={`/${currentItem.原图}`} target="_blank" rel="noopener noreferrer">
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
