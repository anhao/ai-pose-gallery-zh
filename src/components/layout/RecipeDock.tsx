import { useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from '@tanstack/react-router'
import { CopyIcon, DicesIcon, LoaderCircleIcon, PersonStandingIcon, ShirtIcon, SparklesIcon, Trash2Icon, UserRoundIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { costumesQuery, portraitsQuery, posesQuery } from '@/api/gallery'
import { Button } from '@/components/ui/button'
import { buildRecipePrompt } from '@/services/aiGenerator'
import { useStudio } from '@/store/studioStore'

export function RecipeDock() {
  const { pathname } = useLocation()
  const { recipe, apiConfig, isGenerating, setPortrait, setCostume, setPose, clearRecipe, randomizeRecipe } = useStudio()
  const qc = useQueryClient()
  const extraCount = (recipe.extraImages || []).length
  const count = [recipe.portrait, recipe.costume, recipe.pose].filter(Boolean).length + extraCount

  // 在合成台、设置页、指南页隐藏底部悬浮栏，避免与页面内组件重复
  if (pathname.startsWith('/studio') || pathname.startsWith('/settings') || pathname.startsWith('/guide')) {
    return null
  }

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

  const handleCopyPrompt = async () => {
    const text = buildRecipePrompt(recipe, apiConfig.stylePreset)
    await navigator.clipboard.writeText(text)
    toast.success('已复制提示词')
  }

  return (
    <div className="sticky bottom-3 z-30 mx-auto mt-4 w-full max-w-5xl">
      <div className="flex flex-col gap-2 rounded-2xl border border-border/80 bg-card/95 p-2 shadow-lg backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-3.5 sm:py-2.5">
        <div className="grid flex-1 grid-cols-3 gap-1.5 sm:gap-2">
          {/* Slot 1: Portrait */}
          <div className="relative flex items-center gap-1.5 rounded-xl bg-muted/80 p-1.5 sm:gap-2 sm:p-2">
            {recipe.portrait ? (
              <>
                <img
                  src={`/${recipe.portrait.缩略图}`}
                  alt={recipe.portrait.标题}
                  className="h-8 w-7 shrink-0 rounded-md object-cover sm:h-10 sm:w-8"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium sm:text-xs">{recipe.portrait.发型名称}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setPortrait(null)}
                  className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="size-3" />
                </button>
              </>
            ) : (
              <Link to="/portraits" className="flex flex-1 items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <div className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md bg-background/80 sm:h-10 sm:w-8">
                  <UserRoundIcon className="size-3.5" />
                </div>
                <span className="truncate text-[11px] sm:text-xs">人像</span>
              </Link>
            )}
          </div>

          {/* Slot 2: Costume */}
          <div className="relative flex items-center gap-1.5 rounded-xl bg-muted/80 p-1.5 sm:gap-2 sm:p-2">
            {recipe.costume ? (
              <>
                <img
                  src={`/${recipe.costume.缩略图}`}
                  alt={recipe.costume.服装名称}
                  className="h-8 w-7 shrink-0 rounded-md object-cover sm:h-10 sm:w-8"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium sm:text-xs">{recipe.costume.服装名称}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setCostume(null)}
                  className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="size-3" />
                </button>
              </>
            ) : (
              <Link to="/costumes" className="flex flex-1 items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <div className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md bg-background/80 sm:h-10 sm:w-8">
                  <ShirtIcon className="size-3.5" />
                </div>
                <span className="truncate text-[11px] sm:text-xs">服装</span>
              </Link>
            )}
          </div>

          {/* Slot 3: Pose */}
          <div className="relative flex items-center gap-1.5 rounded-xl bg-muted/80 p-1.5 sm:gap-2 sm:p-2">
            {recipe.pose ? (
              <>
                <img
                  src={`/${recipe.pose.缩略图}`}
                  alt={recipe.pose.姿势名称}
                  className="h-8 w-7 shrink-0 rounded-md object-cover sm:h-10 sm:w-8"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium sm:text-xs">{recipe.pose.姿势名称}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setPose(null)}
                  className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="size-3" />
                </button>
              </>
            ) : (
              <Link to="/poses" className="flex flex-1 items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <div className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md bg-background/80 sm:h-10 sm:w-8">
                  <PersonStandingIcon className="size-3.5" />
                </div>
                <span className="truncate text-[11px] sm:text-xs">姿势</span>
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-1.5">
          <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={handleRandom}>
            <DicesIcon className="size-3.5" />
            随机
          </Button>
          {count > 0 && (
            <>
              <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={handleCopyPrompt}>
                <CopyIcon className="size-3.5" />
                <span className="hidden md:inline">复制词</span>
              </Button>
              <Button variant="ghost" size="icon" className="size-8" onClick={clearRecipe}>
                <Trash2Icon className="size-3.5" />
              </Button>
            </>
          )}
          <Button size="sm" className="h-8 px-3 text-xs" asChild>
            <Link to="/studio">
              {isGenerating ? (
                <>
                  <LoaderCircleIcon className="size-3.5 animate-spin" />
                  生成中…
                </>
              ) : (
                <>
                  <SparklesIcon className="size-3.5" />
                  合成 ({count})
                </>
              )}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
