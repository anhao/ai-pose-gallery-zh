import type { ReactNode } from 'react'

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-bold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">{actions}</div>}
    </div>
  )
}
