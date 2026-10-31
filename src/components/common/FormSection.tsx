import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// 设置页的分组卡片
export function Section({ title, desc, actions, children, className }: { title: string; desc?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className="rounded-[22px] bg-muted p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
        </div>
        {actions}
      </div>
      <div className={cn('mt-4 grid gap-4 md:grid-cols-2', className)}>{children}</div>
    </section>
  )
}

// 表单项：标签 + 输入框 + 提示
export function Field({ label, htmlFor, hint, badge, children }: { label: string; htmlFor?: string; hint?: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid content-start gap-2">
      <div className="flex h-5 items-center gap-2">
        <label htmlFor={htmlFor} className="text-sm leading-none font-medium select-none">
          {label}
        </label>
        {badge}
      </div>
      <div className="[&_button[role=combobox]]:bg-background [&_input]:bg-background">{children}</div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
