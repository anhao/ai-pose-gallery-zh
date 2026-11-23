import { Button } from '@/components/ui/button'
import { isDualCharacter } from '@/lib/recipeCharacters'
import { useStudio } from '@/store/studioStore'

export function CharacterTargetPicker({ compact = false }: { compact?: boolean }) {
  const { recipe, activeCharacter, setActiveCharacter, setCharacterMode } = useStudio()
  const dual = isDualCharacter(recipe)
  return <div className={`flex min-w-0 flex-wrap items-center gap-2 ${compact ? '' : 'rounded-xl border border-border/60 bg-background px-3 py-2'}`}>
    <div role="group" aria-label="角色数量" className="flex shrink-0 items-center gap-1">
      <Button type="button" variant={!dual ? 'secondary' : 'ghost'} className="min-h-11 px-3 text-xs" aria-pressed={!dual} onClick={() => setCharacterMode('single')}>单人</Button>
      <Button type="button" variant={dual ? 'secondary' : 'ghost'} className="min-h-11 px-3 text-xs" aria-pressed={dual} onClick={() => setCharacterMode('dual')}>双人</Button>
    </div>
    {dual && <div role="group" aria-label="当前编辑角色" className="flex shrink-0 items-center gap-1 border-l pl-2">
      <Button type="button" variant={activeCharacter === 'a' ? 'default' : 'outline'} className="min-h-11 px-3 text-xs" aria-pressed={activeCharacter === 'a'} onClick={() => setActiveCharacter('a')}>编辑角色 A</Button>
      <Button type="button" variant={activeCharacter === 'b' ? 'default' : 'outline'} className="min-h-11 px-3 text-xs" aria-pressed={activeCharacter === 'b'} onClick={() => setActiveCharacter('b')}>编辑角色 B</Button>
    </div>}
    {!compact && <p role="status" className="min-w-0 text-xs leading-relaxed text-muted-foreground">{dual ? `正在为角色 ${activeCharacter.toUpperCase()} 选择人像和服装，另一个角色保持不变。` : '为当前人物选择人像和服装。双人姿势会自动开启双人模式。'}</p>}
  </div>
}
