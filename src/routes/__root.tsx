import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { AppHeader } from '@/components/layout/AppHeader'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { RecipeDock } from '@/components/layout/RecipeDock'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
})

function RootLayout() {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <AppHeader />
          <main className="@container/main flex flex-1 flex-col px-4 pt-4 pb-10 sm:px-6 md:px-8">
            <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 md:gap-6">
              <Outlet />
            </div>
            <RecipeDock />
          </main>
        </SidebarInset>
      </SidebarProvider>
      <Toaster position="top-center" richColors />
    </TooltipProvider>
  )
}
