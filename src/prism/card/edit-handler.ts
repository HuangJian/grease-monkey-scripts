import type { Runtime } from '../../runtime'
import type { Source, SourceSettings, ShowEditorDialog } from '../types'
import { CONFIG_KEY, getSourceSettings } from '../types'

export type EditHandlerArgs = {
  source: Source<unknown>
  runtime: Runtime
  root: ShadowRoot
  onRevert: (sourceId: string) => void
  onRefresh: (sourceId: string) => Promise<void>
  /** Injected from the composition root (shell/editor's showEditorDialog). */
  showEditorDialog: ShowEditorDialog
}

/**
 * Builds the `onEdit` callback for a card. Lives in `card/` (not `shell/`)
 * so the card layer never imports shell — the dialog opener is injected via
 * `args.showEditorDialog`, breaking the card→shell dependency edge (§4.4).
 */
export function createEditHandler({
  source,
  runtime,
  root,
  onRevert,
  onRefresh,
  showEditorDialog,
}: EditHandlerArgs): (() => Promise<void>) | undefined {
  if (!source.createEditor) return undefined
  return async () => {
    const stored = await runtime.getValue<Record<string, unknown> | null>(CONFIG_KEY, null)
    const storedSettings =
      (stored?.sourceSettings as Record<string, SourceSettings> | undefined) ?? {}
    showEditorDialog(
      root,
      source.dialogTitle ?? `\u7F16\u8F91 - ${source.title}`,
      runtime,
      (container, close) => {
        const editor = source.createEditor!(getSourceSettings(storedSettings, source.id))
        return editor(container, {
          runtime,
          onRevert: () => onRevert(source.id),
          refresh: () => void onRefresh(source.id),
          close,
        })
      },
    )
  }
}
