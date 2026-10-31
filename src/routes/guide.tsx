import { createFileRoute } from '@tanstack/react-router'
import { Section } from '@/components/common/FormSection'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'

export const Route = createFileRoute('/guide')({
  staticData: { title: '使用指南' },
  component: GuidePage,
})

function GuidePage() {
  return (
    <>
      <PageHeader title="使用指南与版权" />

      <Section title="角色合成流程" className="md:grid-cols-3">
        <div className="rounded-2xl bg-background p-4">
          <Badge>1. 人像</Badge>
          <h3 className="mt-2 text-sm font-semibold">人像颜值库 (1,499)</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            挑选五官与发型参考，锁定角色脸部特征。
          </p>
        </div>

        <div className="rounded-2xl bg-background p-4">
          <Badge>2. 服装</Badge>
          <h3 className="mt-2 text-sm font-semibold">服装穿搭库 (1,407)</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            按分类或标签挑选服饰，自带中英双语生图词条。
          </p>
        </div>

        <div className="rounded-2xl bg-background p-4">
          <Badge>3. 姿势 + 附图</Badge>
          <h3 className="mt-2 text-sm font-semibold">动作姿势库 (1,439)</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            挑选 5 视角姿势，或在合成台直接上传自定义附加参考图。
          </p>
        </div>
      </Section>

      <Section title="版权说明" className="md:grid-cols-1">
        <div className="space-y-2 rounded-2xl bg-background p-4 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">• 人像库 (Portrait)：</strong>源于{' '}
            <code>ai-portrait-gallery.pages.dev</code>，采用{' '}
            <strong className="text-emerald-600 dark:text-emerald-400">CC0 1.0 协议</strong>，可自由商用。
          </p>
          <p>
            <strong className="text-foreground">• 姿势库与服装库：</strong>源于{' '}
            <code>ai-pose-gallery.pages.dev</code> 与 <code>ai-costume-gallery.pages.dev</code>
            ，免费用于创作与生图参考，禁止将原始图片直接打包转售。
          </p>
        </div>
      </Section>
    </>
  )
}
