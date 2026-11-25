import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LANGS, LANG_LABELS, setLang, useLang, type Lang } from '@/i18n'
import { cn } from '@/lib/utils'

// 内联 SVG 国旗（Windows 不渲染国旗 emoji，只显示字母）
function FlagCN() {
  return (
    <svg viewBox="0 0 30 20" aria-hidden="true" className="h-full w-full">
      <rect width="30" height="20" fill="#de2910" />
      <g fill="#ffde00">
        <polygon points="5,2 5.9,4.8 8.8,4.8 6.5,6.5 7.4,9.3 5,7.6 2.6,9.3 3.5,6.5 1.2,4.8 4.1,4.8" />
        <circle cx="10" cy="2" r="0.7" />
        <circle cx="12" cy="4" r="0.7" />
        <circle cx="12" cy="7" r="0.7" />
        <circle cx="10" cy="9" r="0.7" />
      </g>
    </svg>
  )
}

function FlagGB() {
  return (
    <svg viewBox="0 0 60 30" aria-hidden="true" preserveAspectRatio="none" className="h-full w-full">
      <clipPath id="flag-gb-clip">
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#flag-gb-clip)" stroke="#c8102e" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
    </svg>
  )
}

function FlagTH() {
  return (
    <svg viewBox="0 0 30 20" aria-hidden="true" className="h-full w-full">
      <rect width="30" height="20" fill="#a51931" />
      <rect y="3.33" width="30" height="13.34" fill="#f4f5f8" />
      <rect y="6.67" width="30" height="6.66" fill="#2d2a4a" />
    </svg>
  )
}

const FLAGS: Record<Lang, () => React.JSX.Element> = { zh: FlagCN, en: FlagGB, th: FlagTH }

function FlagBox({ lang }: { lang: Lang }) {
  const Flag = FLAGS[lang]
  return (
    <span className="block h-3.5 w-5 shrink-0 overflow-hidden rounded-[2px] shadow-[0_0_0_0.5px_rgba(0,0,0,0.25)]">
      <Flag />
    </span>
  )
}

/** 窄屏：只显示当前语言的国旗，点击展开三种语言 */
export function LanguageMenu({ className }: { className?: string }) {
  const lang = useLang()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Language / 语言 / ภาษา: ${LANG_LABELS[lang]}`}
          className={cn('flex size-8 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring', className)}
        >
          <FlagBox lang={lang} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={lang} onValueChange={(v) => void setLang(v as Lang)}>
          {LANGS.map((value) => (
            <DropdownMenuRadioItem key={value} value={value} lang={value === 'zh' ? 'zh-CN' : value}>
              <FlagBox lang={value} /> {LANG_LABELS[value]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function LanguageSwitch({ className }: { className?: string }) {
  const lang = useLang()
  return (
    <div role="group" aria-label="Language / 语言 / ภาษา" className={cn('flex items-center gap-0.5 rounded-lg p-0.5', className)}>
      {LANGS.map((value) => {
        const active = value === lang
        return (
          <Tooltip key={value}>
            <TooltipTrigger asChild>
              <button
                type="button"
                lang={value === 'zh' ? 'zh-CN' : value}
                aria-label={LANG_LABELS[value]}
                aria-pressed={active}
                onClick={() => void setLang(value)}
                className={cn(
                  'flex size-8 items-center justify-center rounded-md transition focus-visible:outline-2 focus-visible:outline-ring',
                  active ? 'bg-accent ring-1 ring-primary/60' : 'opacity-60 hover:bg-accent/60 hover:opacity-100'
                )}
              >
                <FlagBox lang={value} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{LANG_LABELS[value]}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
