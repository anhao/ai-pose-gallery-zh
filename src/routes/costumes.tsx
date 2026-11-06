import { ZoomViewport } from '@/components/common/ZoomViewport'
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
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '@/lib/notifications'
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
import { referenceImageUrl } from '@/lib/recipeImages'
import { COSTUME_SOURCES, SHISEI_SOURCE_URLS, costumeSourceId, selectCostumeView } from '@/lib/costumeSources'
import { CHARADB_NOTICE_URL } from '@/lib/charadb'
import { useStudio } from '@/store/studioStore'
import type { CostumeItem } from '@/types/gallery'

export const Route = createFileRoute('/costumes')({
  staticData: { title: '服装穿搭库' },
  loader: ({ context }) => context.queryClient.ensureQueryData(costumesQuery),
  pendingComponent: () => <Skeleton className="h-[540px] rounded-[22px]" />,
  component: CostumesPage,
})

function CostumeThumbnail({ item, onOpen, picked, onToggle }: { item: CostumeItem; onOpen: () => void; picked: boolean; onToggle: () => void }) {
  const [failed, setFailed] = useState(false)
  const openButton = useRef<HTMLButtonElement>(null)
  return <div className="relative aspect-2/3 w-full shrink-0 overflow-hidden rounded-2xl bg-background">
    <button ref={openButton} type="button" aria-label={`查看 ${item.id} 大图`} onClick={onOpen} className="relative block h-full w-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      {!failed && <img src={referenceImageUrl(item.缩略图)} alt={item.服装名称} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-contain transition duration-300 group-hover:scale-105" />}
      <span className="absolute inset-x-2 top-2 flex items-center justify-between gap-1">
        <span className="rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">{item.id}</span>
        <span className="rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-900">{item.分类}</span>
      </span>
    </button>
    <button type="button" onClick={onToggle} className={cn(
      'absolute bottom-2 left-2 flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white shadow transition',
      picked ? 'bg-emerald-600' : 'bg-black/75 hover:bg-primary'
    )}>
      {picked ? <CheckIcon className="size-3" /> : <PlusIcon className="size-3" />}
      {picked ? '已选' : '加入配方'}
    </button>
    {failed && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/90 p-2 text-center">
      <p role="status" className="text-xs text-muted-foreground">图片加载失败</p>
      <Button type="button" variant="outline" className="pointer-events-auto min-h-11" aria-label={`重新加载 ${item.id} 缩略图`} onClick={() => { setFailed(false); openButton.current?.focus() }}>重新加载</Button>
    </div>}
  </div>
}

function CostumesPage() {
  const { data: costumes } = useSuspenseQuery(costumesQuery)
  const { recipe, toggleCostume, safeMode, requestUnlockNsfw } = useStudio()

  const [source, setSource] = useState('all')
  const [view, setView] = useState({ itemId: '', id: 'front' })
  const [category, setCategory] = useState('')
  const [kind, setKind] = useState('全部')
  const [tag, setTag] = useState('all')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(60)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  const activeCategory = safeMode && category && isNsfwCostumeCategory(category) ? '' : category

  const baseCostumes = useMemo(
    () => costumes.filter((x) => (source === 'all' || costumeSourceId(x) === source) && (kind === '全部' || (x.一级分类 || '现实') === kind) && (!safeMode || !isNsfwCostume(x))),
    [costumes, safeMode, kind, source]
  )
  const hiddenNsfwCount = costumes.filter((x) => (source === 'all' || costumeSourceId(x) === source) && (kind === '全部' || (x.一级分类 || '现实') === kind) && isNsfwCostume(x)).length
  const activeTag = tag === 'all' || baseCostumes.some((x) => (!activeCategory || x.分类 === activeCategory) && x.标签.includes(tag)) ? tag : 'all'

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
      if (activeTag !== 'all' && !(item.标签 || []).includes(activeTag)) return false
      if (q && !item.检索.toLowerCase().includes(q)) return false
      return true
    })
  }, [baseCostumes, activeCategory, activeTag, q])

  const viewedItem = viewerIndex !== null ? filtered[viewerIndex] : null
  const currentItem = viewedItem ? selectCostumeView(viewedItem, view.itemId === viewedItem.id ? view.id : 'front') : null

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

      <div className="flex flex-wrap items-center justify-between gap-2" aria-label="服装一级分类">
        <div className="flex flex-wrap gap-2">
          {['全部', '现实', '二次元'].map((value) => (
            <Button key={value} variant={kind === value ? 'default' : 'outline'} aria-pressed={kind === value} onClick={() => {
              setKind(value); setCategory(''); setTag('all'); setShown(60); setViewerIndex(null)
            }}>{value}</Button>
          ))}
        </div>
        <Select value={source} onValueChange={(value) => { setSource(value); setCategory(''); setTag('all'); setShown(60); setViewerIndex(null) }}>
          <SelectTrigger aria-label="服装来源" className="w-56"><SelectValue placeholder="全部来源" /></SelectTrigger>
          <SelectContent><SelectItem value="all">全部来源</SelectItem>{COSTUME_SOURCES.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        {COSTUME_SOURCES.filter((entry) => (source === 'all' || source === entry.id) && (kind === '全部' || (['gia-anime', 'charadb'].includes(entry.id) ? '二次元' : '现实') === kind)).map((entry) => <p key={entry.id}><a href={entry.url} target="_blank" rel="noopener noreferrer" className="underline">{entry.label}</a>：{entry.notice}</p>)}
      </div>
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
          const cnt = baseCostumes.filter((x) => x.分类 === c).length
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
                setCategory('')
                setTag('all')
                setShown(60)
              })
            }
            className="shrink-0 rounded-full border border-dashed border-rose-500/40 bg-rose-500/5 px-3.5 py-1.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400"
          >
            🔒 解锁 18+ 敏感服装 ({hiddenNsfwCount})
          </button>
        )}
      </div>

      {/* 搜索与单品筛选栏 */}
      <div className="grid gap-3 rounded-[22px] bg-muted p-4 @xl/main:grid-cols-2 @3xl/main:grid-cols-[minmax(0,1fr)_220px_auto]">
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
          value={activeTag}
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
            setKind('全部')
            setSource('all')
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
                <CostumeThumbnail key={item.缩略图} item={item} onOpen={() => setViewerIndex(idx)} picked={picked} onToggle={() => toggleCostume(item)} />

                <div className="flex flex-1 flex-col justify-between px-1.5 pt-2.5 pb-1">
                  <div>
                    <div className="line-clamp-2 text-xs leading-snug font-semibold">{item.服装名称}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{item.来源 || 'ギア · 现实服装'}</div>
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
        <DialogContent className="max-h-[90dvh] w-[95vw] max-w-4xl overflow-y-auto p-0 sm:max-w-4xl">
          {currentItem && viewerIndex !== null && (() => {
            const picked = recipe.costume?.id === currentItem.id && (recipe.costume.selectedView || 'front') === (currentItem.selectedView || 'front')
            return (
              <div className="grid md:grid-cols-[1fr_320px]">
                <div className="relative flex max-h-[78dvh] min-h-[min(380px,65dvh)] items-center justify-center bg-muted/60 p-4">
                  <ZoomViewport imageUrl={referenceImageUrl(currentItem.预览图 || currentItem.原图)} alt={currentItem.服装名称} className="min-h-0 h-[58dvh]" />
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label="上一张图片" className="absolute top-1/2 left-3 min-h-11 min-w-11 -translate-y-1/2 rounded-full shadow"
                    onClick={() => setViewerIndex((viewerIndex - 1 + filtered.length) % filtered.length)}
                  >
                    <ChevronLeftIcon className="size-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label="下一张图片" className="absolute top-1/2 right-3 min-h-11 min-w-11 -translate-y-1/2 rounded-full shadow"
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
                      <p className="text-xs text-muted-foreground">来源：{currentItem.来源 || 'ギア（@giaaibusi）'}</p>
                      {currentItem.source === 'shisei' && <div className="space-y-2 text-xs text-muted-foreground">
                        <p>Shisei / wquguru · CC0 · AI 生成服装参考，并非专业复原。</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-2" aria-label="Shisei 来源与许可">
                          <a className="underline" href={SHISEI_SOURCE_URLS.repository} target="_blank" rel="noopener noreferrer">原仓库</a>
                          <a className="underline" href={SHISEI_SOURCE_URLS.catalog} target="_blank" rel="noopener noreferrer">条目目录（{currentItem.id.replace('shisei-', '')}，固定版本）</a>
                          <a className="underline" href={SHISEI_SOURCE_URLS.license} target="_blank" rel="noopener noreferrer">图片许可证（CC0）</a>
                        </div>
                      </div>}
                      {currentItem.source === 'charadb' && <a className="text-xs underline" href={CHARADB_NOTICE_URL} target="_blank" rel="noopener noreferrer">图片仅作参考，禁止真人、未成年人及再分发；查看原作者条件</a>}
                    </DialogHeader>

                    {currentItem.views && <div className="flex flex-wrap gap-2" aria-label="服装视角">{currentItem.views.map((entry) => <Button key={entry.id} variant={currentItem.selectedView === entry.id ? 'default' : 'outline'} aria-pressed={currentItem.selectedView === entry.id} onClick={() => setView({ itemId: currentItem.id, id: entry.id })}>{entry.label}</Button>)}</div>}
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
                        <a href={referenceImageUrl(currentItem.原图)} download={['charadb', 'gia-anime'].includes(currentItem.source || '') ? undefined : `${currentItem.id}.webp`} target={['charadb', 'gia-anime'].includes(currentItem.source || '') ? '_blank' : undefined} rel="noopener noreferrer">
                          <DownloadIcon className="size-3.5" />
                          {['charadb', 'gia-anime'].includes(currentItem.source || '') ? '前往来源原图' : '下载高清原图'}
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <a href={currentItem.source === 'shisei' ? referenceImageUrl(currentItem.原图) : currentItem.来源地址 || referenceImageUrl(currentItem.原图)} target="_blank" rel="noopener noreferrer">
                          <ExternalLinkIcon className="size-3.5" />
                          {['charadb', 'gia-anime'].includes(currentItem.source || '') ? '原作者站点' : '新窗口原图'}
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
