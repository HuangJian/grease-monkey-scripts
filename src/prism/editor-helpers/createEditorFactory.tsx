import { render } from 'preact'
import type { ComponentType } from 'preact'
import type { Runtime } from '../../runtime'
import type { SourceEditor, SourceEditorContext, SourceEditorResult } from '../types'

export type EditorFormProps = {
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

/**
 * Generic editor factory that eliminates the async (container, ctx) => { ... }
 * boilerplate shared by all 8 dashboard editors.
 *
 * Usage:
 *   export function createXxxEditor(options, settings): SourceEditor {
 *     return createEditorFactory(
 *       (runtime) => loadFreshOptions(runtime, options),
 *       XxxEditorForm,
 *       (fresh, settings) => ({ fresh, settings }),
 *     )
 *   }
 */
export function createEditorFactory<Fresh, FormProps extends EditorFormProps>(
  loadOptions: (runtime: Runtime) => Promise<Fresh>,
  FormComponent: ComponentType<FormProps>,
  buildProps: (fresh: Fresh, ctx: SourceEditorContext) => Omit<FormProps, 'ctx' | 'handleRef'>,
): SourceEditor {
  return async (container, ctx): Promise<SourceEditorResult> => {
    const fresh = await loadOptions(ctx.runtime)
    const handleRef: { current: SourceEditorResult | null } = { current: null }
    const extra = buildProps(fresh, ctx)
    const props = { ctx, handleRef, ...extra } as FormProps
    render(<FormComponent {...props} />, container)
    return {
      render: () => handleRef.current?.render?.(),
      save: () => handleRef.current?.save?.(),
      cancel: () => handleRef.current?.cancel?.(),
    }
  }
}
