import { useState } from 'react'
import { toast } from '@/lib/notifications'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { resolveH3ModelSelection } from '@/services/sdcpp'

type ModelFile = { id: string; name: string; category: string }
type RecipeSlot = { id: string; label?: string; required: boolean; categories?: string[]; category?: string }
type ModelRecipe = { id: string; name: string; description?: string; slots: RecipeSlot[]; models?: Record<string, string> }
type RuntimeStatus = { state?: string; recipe?: string | null; models?: Record<string, string>; error?: string | null }

async function api<T>(baseUrl: string, path: string, apiKey: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (apiKey.trim()) headers.set('Authorization', `Bearer ${apiKey.trim()}`)
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, { ...init, headers })
  const text = await response.text()
  let data: any
  try { data = text ? JSON.parse(text) : {} } catch { data = { error: text } }
  if (!response.ok) throw new Error(data?.error?.message || data?.error || data?.message || `HTTP ${response.status}`)
  return data as T
}

export function SdCppModelManager({ baseUrl, apiKey, preferredRecipe, onLoaded }: { baseUrl: string; apiKey: string; preferredRecipe: string; onLoaded: (recipe: string) => void }) {
  const [open, setOpen] = useState(false)
  const [recipes, setRecipes] = useState<ModelRecipe[]>([])
  const [files, setFiles] = useState<ModelFile[]>([])
  const [runtime, setRuntime] = useState<RuntimeStatus>({})
  const [recipeId, setRecipeId] = useState('minimax-h3-image')
  const [selection, setSelection] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try {
      await api(baseUrl, '/sdcpp/v1/models/refresh', apiKey, { method: 'POST' })
      const [recipeData, fileData, status] = await Promise.all([
        api<{ recipes: ModelRecipe[] }>(baseUrl, '/sdcpp/v1/recipes', apiKey),
        api<{ files: ModelFile[] }>(baseUrl, '/sdcpp/v1/model-files', apiKey),
        api<RuntimeStatus>(baseUrl, '/sdcpp/v1/models/status', apiKey),
      ])
      const supported = (recipeData.recipes || []).filter((item) => ['minimax-h3-image', 'p-h3-image'].includes(item.id))
      setRecipes(supported)
      setFiles(fileData.files || [])
      setRuntime(status)
      const current = supported.find((item) => item.id === status.recipe) || supported.find((item) => item.id === preferredRecipe) || supported.find((item) => item.id === recipeId) || supported[0]
      if (current) {
        setRecipeId(current.id)
        let defaults: Record<string, string> = {}
        try { defaults = resolveH3ModelSelection(current.id as 'minimax-h3-image' | 'p-h3-image', fileData.files || []) } catch { /* Keep the dialog usable so missing files can be selected or diagnosed manually. */ }
        setSelection({ ...defaults, ...(current.models || {}), ...(status.recipe === current.id ? status.models : {}) })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '讀取 sd-server 模型目錄失敗')
    } finally { setLoading(false) }
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) void refresh()
  }

  const selectedRecipe = recipes.find((item) => item.id === recipeId)
  const loadModel = async () => {
    if (!selectedRecipe) return
    const missing = selectedRecipe.slots.filter((slot) => slot.required && !selection[slot.id])
    if (missing.length) { toast.error(`尚未選擇必要模型：${missing.map((slot) => slot.label || slot.id).join('、')}`); return }
    setBusy(true)
    try {
      const models = Object.fromEntries(Object.entries(selection).filter(([, value]) => value && value !== '__none__'))
      const status = await api<RuntimeStatus>(baseUrl, '/sdcpp/v1/models/load', apiKey, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipe: recipeId, models }),
      })
      setRuntime(status)
      onLoaded(recipeId)
      toast.success(`已載入 ${selectedRecipe.name}`)
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '模型載入失敗', { duration: 12000 })
    } finally { setBusy(false) }
  }

  const unloadModel = async () => {
    setBusy(true)
    try {
      const status = await api<RuntimeStatus>(baseUrl, '/sdcpp/v1/models/unload', apiKey, { method: 'POST' })
      setRuntime(status)
      toast.success('H3 模型已卸載')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '模型卸載失敗', { duration: 10000 })
    } finally { setBusy(false) }
  }

  const modelReady = runtime.state === 'ready' && Boolean(runtime.recipe)
  const statusLabel = modelReady
    ? `已載入：${runtime.recipe}`
    : runtime.state === 'loading'
      ? '模型載入中…'
      : runtime.state === 'error'
        ? '模型載入失敗'
        : '尚未載入 H3 模型'
  const statusColor = modelReady ? 'text-emerald-500' : runtime.state === 'loading' ? 'text-amber-500' : 'text-red-500'

  return <>
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-semibold ${statusColor}`} role="status" aria-live="polite">{statusLabel}</div>
        <div className="text-xs text-muted-foreground">sd-server · {runtime.state || 'unknown'}{runtime.error ? ` · ${runtime.error}` : ''} · Generate 時自動載入</div>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={() => handleOpenChange(true)}>Model / 模型設定</Button>
      <Button type="button" size="sm" variant="outline" onClick={() => void unloadModel()} disabled={!modelReady || busy}>Unload</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading}>{loading ? '刷新中…' : '刷新模型目錄'}</Button>
    </div>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>stable-diffusion.cpp · Model</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground">目前狀態：{runtime.state || 'unknown'} · {runtime.recipe || 'No model loaded'}</div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Recipe</label>
            <Select value={recipeId} onValueChange={(value) => {
              setRecipeId(value)
              const recipe = recipes.find((item) => item.id === value)
              setSelection(recipe?.models || {})
            }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="選擇 Built-in Recipe" /></SelectTrigger>
              <SelectContent>{recipes.map((recipe) => <SelectItem key={recipe.id} value={recipe.id}>{recipe.name} · builtin</SelectItem>)}</SelectContent>
            </Select>
            {selectedRecipe?.description && <p className="text-xs text-muted-foreground">{selectedRecipe.description}</p>}
          </div>
          {selectedRecipe?.slots.map((slot) => {
            const categories = slot.categories || (slot.category ? [slot.category] : [])
            const choices = files.filter((file) => categories.includes(file.category))
            return <div key={slot.id} className="grid gap-2 sm:grid-cols-2 sm:items-center">
              <label className="text-sm font-medium">{slot.label || slot.id}{slot.required ? ' *' : ''}</label>
              <Select value={selection[slot.id] || (slot.required ? '' : '__none__')} onValueChange={(value) => setSelection((prev) => ({ ...prev, [slot.id]: value === '__none__' ? '' : value }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="選擇模型檔案" /></SelectTrigger>
                <SelectContent>
                  {!slot.required && <SelectItem value="__none__">None</SelectItem>}
                  {choices.map((file) => <SelectItem key={file.id} value={file.id}>{file.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          })}
          <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>Refresh files & recipes</Button>
            <Button onClick={() => void loadModel()} disabled={busy || loading || !selectedRecipe}>{busy ? 'Loading models…' : 'Load models'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </>
}
