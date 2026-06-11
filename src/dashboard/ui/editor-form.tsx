import { render } from 'preact'

export type EditorFieldDef = {
  prop: string
  label: string
  min: number
  max?: number
  placeholder?: string
  errorMsg: string
  defaultValue?: number | string
}

export type EditorFormResult = {
  container: HTMLElement
  fieldContainer: HTMLElement
  errorEl: HTMLElement
}

export function renderEditorForm(
  container: HTMLElement,
  fields: ReadonlyArray<EditorFieldDef>,
  initialValues: Record<string, unknown>,
): EditorFormResult {
  render(
    <div class="gm-sp-editor">
      <div class="gm-sp-editor-form">
        {fields.map((f) => (
          <label class="gm-sp-editor-row">
            <span>{f.label}</span>
            <input
              type="number"
              class="gm-sp-input"
              min={f.min}
              max={f.max}
              placeholder={f.placeholder}
            />
          </label>
        ))}
      </div>
      <div class="gm-sp-editor-error" hidden />
    </div>,
    container,
  )

  const fieldContainer = container.querySelector('.gm-sp-editor-form') as HTMLElement
  const errorEl = container.querySelector('.gm-sp-editor-error') as HTMLDivElement

  const inputs = fieldContainer.querySelectorAll<HTMLInputElement>('input[type="number"]')
  for (let i = 0; i < fields.length && i < inputs.length; i++) {
    inputs[i].value = String(initialValues[fields[i].prop] ?? '')
  }

  return { container, fieldContainer, errorEl }
}
