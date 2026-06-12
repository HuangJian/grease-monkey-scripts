import type { Runtime } from '../../runtime'
import { createDoubleShiftHandler, isEditableTarget } from '../shortcut'
import { isHostAllowed } from './host-allowlist'
import type { Config } from '../types'

export type ShortcutBootstrapDeps = {
  runtime: Runtime
  config: Config
  onOpen: () => void
}

export function bootstrapShortcut(deps: ShortcutBootstrapDeps): void {
  if (deps.config.shortcut.enabled && isHostAllowed(deps.config, deps.runtime.location.hostname)) {
    const onKeydown = createDoubleShiftHandler(() => deps.onOpen(), {
      windowMs: deps.config.shortcut.doublePressWindowMs,
      isFocusExempt: isEditableTarget,
    })
    deps.runtime.addEventListener(
      deps.runtime.document,
      'keydown',
      onKeydown as (e: Event) => void,
      {
        capture: true,
      },
    )
  }
}
