import { Link } from '@tanstack/react-router'
import { ImagePlusIcon, LoaderCircleIcon, ShirtIcon, UserRoundIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CHARACTER_LAYOUTS, recipeCharacters } from '@/lib/recipeCharacters'
import { selectCostumeView } from '@/lib/costumeSources'
import { referenceImageUrl, uploadedReferences } from '@/lib/recipeImages'
import { toast } from '@/lib/notifications'
import { fileToDataUrl } from '@/services/aiGenerator'
import { useStudio } from '@/store/studioStore'
import type { CharacterLayout, CharacterSlot } from '@/types/gallery'

type ImageKind = 'portrait' | 'costume'

export function DualCharacterPanel({ disabled, onPreview, onUploadingChange, showErrors, renderRandomControls }: {
  disabled: boolean
  onPreview: (url: string) => void
  onUploadingChange: (value: string | null) => void
  showErrors: boolean
  renderRandomControls: (slot: ImageKind, label: string, character: CharacterSlot) => ReactNode
}) {
  const { recipe, activeCharacter, setActiveCharacter, setCharacterLayout, setPortrait, setCostume } = useStudio()
  const input = useRef<HTMLInputElement | null>(null)
  const target = useRef<{ slot: CharacterSlot; kind: ImageKind }>({ slot: 'a', kind: 'portrait' })
  const [uploading, setUploading] = useState<string | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; onUploadingChange(null) }
  }, [onUploadingChange])

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || disabled) return
    const { slot, kind } = target.current
    if (!file.type.startsWith('image/')) { toast.error('请选择图片文件'); return }
    const id = slot + '-' + kind
    setUploading(id)
    onUploadingChange(id)
    try {
      const url = await fileToDataUrl(file)
      const image = new Image()
      image.src = url
      await image.decode()
      if (!mounted.current) return
      const name = file.name.replace(/\.[^.]+$/, '') || '上传图片'
      const items = uploadedReferences(name, url, image.width, image.height, file.size)
      if (kind === 'portrait') setPortrait(items.portrait, slot)
      else setCostume(items.costume, slot)
    } catch (error) {
      if (mounted.current) toast.error(error instanceof Error ? error.message : '图片读取失败')
    } finally {
      if (mounted.current) { setUploading(null); onUploadingChange(null) }
    }
  }

  return <div className="min-w-0 space-y-3">
    <div className="grid min-w-0 gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
      <label id="character-layout-label" className="text-sm font-medium">白模人物对应</label>
      <Select value={recipe.characterLayout || 'a-left'} onValueChange={(value) => setCharacterLayout(value as CharacterLayout)} disabled={disabled}>
        <SelectTrigger aria-labelledby="character-layout-label" className="min-h-11 w-full bg-background"><SelectValue /></SelectTrigger>
        <SelectContent>{CHARACTER_LAYOUTS.map((layout) => <SelectItem key={layout.value} value={layout.value}>{layout.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <p className="text-xs text-muted-foreground">按共享姿势图中的位置指定 A、B。未选服装时，保留对应人像原有穿搭。</p>
    <input ref={input} hidden type="file" accept="image/*" onChange={(event) => void upload(event)} aria-label="上传角色参考图" />
    <div className="grid min-w-0 gap-3 @min-[34rem]/section:grid-cols-2">
      {recipeCharacters(recipe).map((character) => <div key={character.slot} className={'min-w-0 rounded-xl border bg-background p-3 ' + (activeCharacter === character.slot ? 'border-foreground/40' : 'border-border')}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{character.label}<span className="ml-2 text-xs font-normal text-muted-foreground">{character.position}</span></h3>
          <Button type="button" variant={activeCharacter === character.slot ? 'secondary' : 'ghost'} size="sm" className="min-h-11 px-2 text-xs" disabled={disabled} aria-pressed={activeCharacter === character.slot} onClick={() => setActiveCharacter(character.slot)}>{activeCharacter === character.slot ? '当前选图角色' : '为此角色选图'}</Button>
        </div>
        <div className="space-y-3">{(['portrait', 'costume'] as const).map((kind) => {
          const item = character[kind]
          const label = kind === 'portrait' ? '人像' : '服装'
          const name = item ? ('标题' in item ? item.标题 : item.服装名称) : ''
          const views = kind === 'costume' ? character.costume?.views?.filter((view) => view.原图 && view.缩略图) || [] : []
          const id = character.slot + '-' + kind
          const missing = showErrors && kind === 'portrait' && !item
          return <div key={kind} className={'min-w-0 rounded-lg bg-muted/60 p-2 ' + (missing ? 'ring-1 ring-destructive' : '')}>
            <div className="flex min-w-0 items-start gap-2">
              {item ? <button type="button" aria-label={'放大' + character.label + label + '参考图'} className="shrink-0 cursor-zoom-in overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-ring" onClick={() => onPreview(referenceImageUrl(kind === 'costume' && character.costume ? character.costume.预览图 || character.costume.原图 || character.costume.缩略图 : item.原图 || item.缩略图))}><img src={referenceImageUrl(item.缩略图)} alt={name} className="h-20 w-16 object-cover" /></button>
                : <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">{kind === 'portrait' ? <UserRoundIcon className="size-5" /> : <ShirtIcon className="size-5" />}</div>}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-1"><span className="text-xs font-medium">{label}{kind === 'costume' && <span className="font-normal text-muted-foreground">（可选）</span>}</span>{item && <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0" disabled={disabled} aria-label={'清除' + character.label + label + '参考图'} onClick={() => kind === 'portrait' ? setPortrait(null, character.slot) : setCostume(null, character.slot)}><XIcon className="size-3.5" /></Button>}</div>
                <p className={'line-clamp-2 break-words text-xs ' + (missing ? 'text-destructive' : 'text-muted-foreground')}>{name || (kind === 'portrait' ? '请选择或上传人像' : '沿用此人像的穿搭')}</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Button type="button" variant="outline" size="sm" className="min-h-11 flex-1 px-2 text-xs" asChild disabled={disabled}><Link to={kind === 'portrait' ? '/portraits' : '/costumes'} aria-label={'为' + character.label + '选择' + label} onClick={(event) => { if (disabled) event.preventDefault(); else setActiveCharacter(character.slot) }}>{item ? '更换' : '选择'}{label}</Link></Button>
              <Button type="button" variant="ghost" size="sm" className="min-h-11 px-2 text-xs" disabled={disabled} aria-label={'上传' + character.label + label + '参考图'} aria-busy={uploading === id} onClick={() => { target.current = { slot: character.slot, kind }; input.current?.click() }}>{uploading === id ? <LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none" /> : <ImagePlusIcon className="size-3.5" />}上传</Button>
            </div>
            {views.length > 0 && <Select value={views.find((view) => view.id === character.costume?.selectedView)?.id || views.find((view) => view.id === 'front')?.id || views[0].id} disabled={disabled} onValueChange={(value) => { if (character.costume) setCostume(selectCostumeView(character.costume, value), character.slot) }}><SelectTrigger aria-label={character.label + '服装视角'} className="mt-2 min-h-11 w-full bg-background text-xs"><SelectValue /></SelectTrigger><SelectContent>{views.map((view) => <SelectItem key={view.id} value={view.id}>{view.label}</SelectItem>)}</SelectContent></Select>}
            <div className="mt-2">{renderRandomControls(kind, character.label + label, character.slot)}</div>
          </div>
        })}</div>
      </div>)}
    </div>
  </div>
}
