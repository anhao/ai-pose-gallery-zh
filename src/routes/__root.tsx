import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { AppHeader } from '@/components/layout/AppHeader'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { RecipeDock } from '@/components/layout/RecipeDock'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { t, useLang } from '@/i18n'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
})

function NotFound() {
  useLang()
  return <div role="status" className="space-y-3"><h1>{t('页面不存在')}</h1><Link to="/">{t('返回首页')}</Link></div>
}

function RouteError({ error, reset }: { error: unknown; reset: () => void }) {
  useLang()
  return <div role="alert" className="space-y-3"><h1>{t('页面加载失败')}</h1>{error instanceof Error && <p>{error.message}</p>}<div className="flex flex-wrap items-center gap-3"><Button type="button" variant="outline" className="min-h-11" onClick={reset}>{t('重试')}</Button><Link to="/">{t('返回首页')}</Link></div></div>
}

function RootLayout() {
  // 切换语言时以语言为 key 重新渲染界面
  const lang = useLang()
  return (
    <TooltipProvider key={lang}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <AppHeader />
          <main className="@container/main flex min-w-0 flex-1 flex-col px-4 pt-4 pb-10 sm:px-6 md:px-8">
            <div className="mx-auto flex min-w-0 w-full max-w-7xl flex-1 flex-col gap-4 md:gap-6">
              <Outlet />
            </div>
            <RecipeDock />
          </main>
        </SidebarInset>
      </SidebarProvider>
      <Toaster />
    </TooltipProvider>
  )
}
