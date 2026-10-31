import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  CheckIcon,
  FlameIcon,
  LayersIcon,
  PersonStandingIcon,
  PlusIcon,
  ShirtIcon,
  UserRoundIcon,
} from 'lucide-react'
import { costumesQuery, portraitsQuery, posesQuery } from '@/api/gallery'
import { PageHeader } from '@/components/common/PageHeader'
import { StatCard } from '@/components/common/StatCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useStudio } from '@/store/studioStore'

export const Route = createFileRoute('/')({
  staticData: { title: '图库总览' },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(posesQuery),
      context.queryClient.ensureQueryData(costumesQuery),
      context.queryClient.ensureQueryData(portraitsQuery),
    ]),
  pendingComponent: () => <Skeleton className="h-[520px] rounded-[22px]" />,
  component: DashboardPage,
})

function DashboardPage() {
  const { data: posesData } = useSuspenseQuery(posesQuery)
  const { data: costumes } = useSuspenseQuery(costumesQuery)
  const { data: portraits } = useSuspenseQuery(portraitsQuery)
  const { recipe, togglePortrait } = useStudio()

  const topPortraits = portraits.filter((p) => p.热门).slice(0, 10)
  const totalImages = posesData.items.length + costumes.length + portraits.length

  return (
    <>
      <PageHeader title="AI 角色参考库" />

      {/* 核心数据指标卡片 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          title="总参考图"
          value={totalImages.toLocaleString('zh-CN')}
          icon={<LayersIcon />}
          desc="8,690 本地高清图"
        />
        <StatCard
          title="动作姿势 (Pose)"
          value={`${posesData.groups.length} 组`}
          icon={<PersonStandingIcon />}
          desc={`${posesData.items.length} 张 · 5 视角`}
        />
        <StatCard
          title="服装穿搭 (Costume)"
          value={`${costumes.length.toLocaleString('zh-CN')} 套`}
          icon={<ShirtIcon />}
          desc="8 大分类 · 双语标签"
        />
        <StatCard
          title="人像颜值 (Portrait)"
          value={`${portraits.length.toLocaleString('zh-CN')} 张`}
          icon={<UserRoundIcon />}
          desc="CC0 协议 · 51 款发型"
        />
      </div>

      {/* 三大核心图库入口卡片 */}
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <Link
          to="/poses"
          className="group flex flex-col justify-between rounded-[20px] bg-muted p-4 transition hover:bg-muted/70"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">🕺 动作姿势库</h2>
            <Badge variant="secondary">1,439</Badge>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {posesData.groups.slice(0, 4).map((g) => (
              <img
                key={g.key}
                src={`/${g.order[0].缩略图}`}
                alt={g.name}
                loading="lazy"
                className="aspect-3/4 w-full rounded-lg bg-background object-cover"
              />
            ))}
          </div>
        </Link>

        <Link
          to="/costumes"
          className="group flex flex-col justify-between rounded-[20px] bg-muted p-4 transition hover:bg-muted/70"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">👗 服装穿搭库</h2>
            <Badge variant="secondary">1,407</Badge>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {costumes.slice(0, 4).map((c) => (
              <img
                key={c.id}
                src={`/${c.缩略图}`}
                alt={c.服装名称}
                loading="lazy"
                className="aspect-3/4 w-full rounded-lg bg-background object-cover"
              />
            ))}
          </div>
        </Link>

        <Link
          to="/portraits"
          className="group flex flex-col justify-between rounded-[20px] bg-muted p-4 transition hover:bg-muted/70"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">👤 人像颜值库</h2>
            <Badge variant="secondary">1,499</Badge>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {portraits.slice(0, 4).map((p) => (
              <img
                key={p.id}
                src={`/${p.缩略图}`}
                alt={p.标题}
                loading="lazy"
                className="aspect-3/4 w-full rounded-lg bg-background object-cover"
              />
            ))}
          </div>
        </Link>
      </div>

      {/* 热门人像 Top10 速选区 */}
      <section className="rounded-[20px] bg-muted p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold sm:text-base">
            <FlameIcon className="size-4 text-orange-500" />
            热门人像 Top 10
          </h2>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/portraits">
              全部
              <ArrowRightIcon className="size-3.5" />
            </Link>
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-5 lg:grid-cols-10">
          {topPortraits.map((item, idx) => {
            const picked = recipe.portrait?.id === item.id
            return (
              <div
                key={item.id}
                onClick={() => togglePortrait(item)}
                className="group relative cursor-pointer overflow-hidden rounded-xl bg-background transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="relative aspect-4/5 overflow-hidden">
                  <img
                    src={`/${item.缩略图}`}
                    alt={item.标题}
                    loading="lazy"
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                  <span className="absolute top-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    #{idx + 1}
                  </span>
                  <span
                    className={`absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-full text-white shadow ${
                      picked ? 'bg-emerald-600' : 'bg-black/65 group-hover:bg-primary'
                    }`}
                  >
                    {picked ? <CheckIcon className="size-3.5" /> : <PlusIcon className="size-3.5" />}
                  </span>
                </div>
                <div className="p-1.5">
                  <div className="truncate text-[11px] font-medium">{item.发型名称}</div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* 底部免责声明提示条 */}
      <footer className="rounded-[18px] border border-border/60 bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <strong className="text-foreground">⚠️ 免责声明：</strong>
        本站姿势与服饰参考图源自 X 创作者{' '}
        <a
          href="https://x.com/giaaibusi"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          ギア (@giaaibusi)
        </a>{' '}
        公开分享，版权归原作者所有，严禁商业倒卖。默认已开启「安全模式 (SFW)」隐藏 18+ 敏感分类，未满 18 周岁请勿关闭。本工具与素材
        <strong className="text-foreground">仅供个人学习与合法艺术创作使用，严禁用于任何违法违规或侵害他人肖像权用途</strong>。{' '}
        <Link to="/guide" className="font-medium text-primary underline">
          查看完整免责声明 →
        </Link>
      </footer>
    </>
  )
}
