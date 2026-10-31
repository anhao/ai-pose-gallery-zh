import type { ReactNode } from 'react'

// 统计卡片，样式参考 linux-do/cdk 的 DataCards
export function StatCard({ title, value, icon, desc }: { title: string; value: ReactNode; icon: ReactNode; desc?: string }) {
  return (
    <div className="min-h-[96px] rounded-[20px] bg-muted px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="truncate text-xs font-medium text-muted-foreground">{title}</div>
        <div className="flex size-6 items-center justify-center rounded-full bg-background/70 text-muted-foreground [&_svg]:size-3.5">
          {icon}
        </div>
      </div>
      <div className="mt-3 truncate text-2xl leading-none font-semibold tracking-[-0.03em]">{value}</div>
      <div className="mt-2 truncate text-xs text-muted-foreground">{desc || '\u00a0'}</div>
    </div>
  )
}
