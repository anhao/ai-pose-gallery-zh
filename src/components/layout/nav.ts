import type { LinkProps } from '@tanstack/react-router'
import {
  BookOpenIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  PersonStandingIcon,
  ShirtIcon,
  SparklesIcon,
  UserRoundIcon,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  title: string
  to: NonNullable<LinkProps['to']>
  icon: LucideIcon
  badge?: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: '工作台',
    items: [
      { title: '图库总览', to: '/', icon: LayoutDashboardIcon },
      { title: 'AI 角色合成台', to: '/studio', icon: SparklesIcon, badge: 'PRO' },
    ],
  },
  {
    label: '三大参考图库',
    items: [
      { title: '动作姿势库', to: '/poses', icon: PersonStandingIcon, badge: '1,439' },
      { title: '服装穿搭库', to: '/costumes', icon: ShirtIcon, badge: '1,407' },
      { title: '人像颜值库', to: '/portraits', icon: UserRoundIcon, badge: '1,499' },
    ],
  },
  {
    label: '配置与说明',
    items: [
      { title: 'API 接口配置', to: '/settings', icon: KeyRoundIcon },
      { title: '使用说明与免责声明', to: '/guide', icon: BookOpenIcon },
    ],
  },
]

const allItems = navGroups.flatMap((g) => g.items)

export function activeNavTo(pathname: string): string | undefined {
  let best: string | undefined
  for (const { to } of allItems) {
    const hit = to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`)
    if (hit && (!best || to.length > best.length)) best = to
  }
  return best
}
