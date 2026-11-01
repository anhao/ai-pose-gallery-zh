import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// 设置页的分组卡片
export function Section({ title, desc, actions, children, className }: { title: string; desc?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className="@container/section min-w-0 rounded-[22px] bg-muted p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <h2 className="text-base font-semibold">{title}</h2>
          {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
        </div>
        {actions && <div className="flex max-w-full flex-wrap items-center gap-1.5 [&>div]:flex-wrap">{actions}</div>}
      </div>
      <div className={cn('mt-4 grid min-w-0 gap-4 @lg/section:grid-cols-2', className)}>{children}</div>
    </section>
  )
}

// 表单项：标签 + 输入框 + 提示
export function Field({ label, htmlFor, hint, badge, children }: { label: string; htmlFor?: string; hint?: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      <div className="flex min-h-5 flex-wrap items-center gap-2">
        <label htmlFor={htmlFor} className="text-sm leading-snug font-medium select-none [overflow-wrap:anywhere]">
          {label}
        </label>
        {badge}
      </div>
      <div className="min-w-0 [&_button[role=combobox]]:min-w-0 [&_button[role=combobox]]:bg-background [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:overflow-hidden [&_input]:bg-background">{children}</div>
      {hint && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{hint}</p>}
    </div>
  )
}
