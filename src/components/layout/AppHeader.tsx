import { Link, useMatches } from '@tanstack/react-router'
import { DicesIcon, ShieldCheckIcon, SparklesIcon } from 'lucide-react'
import { Fragment } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { costumesQuery, portraitsQuery, posesQuery } from '@/api/gallery'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useStudio } from '@/store/studioStore'

export function AppHeader() {
  const { recipe, randomizeRecipe, safeMode, toggleSafeMode } = useStudio()
  const qc = useQueryClient()
  const crumbs = useMatches({
    select: (matches) =>
      matches.filter((m) => m.staticData.title).map((m) => ({ title: m.staticData.title!, path: m.pathname })),
  })

  const selectedCount = [recipe.portrait, recipe.costume, recipe.pose].filter(Boolean).length

  const handleRandom = async () => {
    const [posesRes, costumes, portraits] = await Promise.all([
      qc.ensureQueryData(posesQuery),
      qc.ensureQueryData(costumesQuery),
      qc.ensureQueryData(portraitsQuery),
    ])
    randomizeRecipe({
      poses: posesRes.items,
      costumes,
      portraits,
    })
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4 data-vertical:self-center" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((c, i) => (
            <Fragment key={c.path}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {i === crumbs.length - 1 ? (
                  <BreadcrumbPage>{c.title}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={c.path}>{c.title}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant={safeMode ? 'outline' : 'secondary'}
          size="sm"
          onClick={toggleSafeMode}
          title={safeMode ? '当前已开启安全模式（已隐藏 18+ 敏感内容），点击可解锁完整图库' : '当前已显示 18+ 完整图库，点击可切回安全模式'}
          className={
            safeMode
              ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-400'
          }
        >
          <ShieldCheckIcon className="size-3.5" />
          <span className="hidden sm:inline">{safeMode ? '安全模式 (SFW)' : '18+ 完整模式'}</span>
          <span className="sm:hidden">{safeMode ? 'SFW' : '18+'}</span>
        </Button>
        <Button variant="outline" size="sm" onClick={handleRandom} className="hidden sm:inline-flex">
          <DicesIcon className="size-3.5" />
          随机捏人
        </Button>
        <Button size="sm" asChild>
          <Link to="/studio">
            <SparklesIcon className="size-3.5" />
            AI 合成台
            {selectedCount > 0 && (
              <span className="ml-1 rounded-full bg-primary-foreground/20 px-1.5 py-0.2 text-[11px] font-bold">
                {selectedCount}/3
              </span>
            )}
          </Link>
        </Button>
        <ThemeToggle />
      </div>
    </header>
  )
}
