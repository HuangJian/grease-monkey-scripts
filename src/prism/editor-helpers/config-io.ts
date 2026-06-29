import type { Runtime } from '../../runtime'
import { CONFIG_KEY } from '../types'
import type { ConfigValidation } from '../config'
import type { SourceSettings } from '../types'

export type SaveConfigSectionArgs<T> = {
  runtime: Runtime
  sectionKey: string
  section: T
  validate: (merged: Record<string, unknown>) => ConfigValidation
  onError: (message: string) => void
  onSuccess: () => void
}

export async function saveConfigSection<T>(args: SaveConfigSectionArgs<T>): Promise<void> {
  const validation = args.validate({ [args.sectionKey]: args.section })
  if (!validation.ok) {
    args.onError(validation.error)
    return
  }
  const existing = await args.runtime.getValue<Record<string, unknown> | null>(CONFIG_KEY, null)
  await args.runtime.setValue(CONFIG_KEY, {
    ...(existing ?? {}),
    [args.sectionKey]: args.section,
  })
  args.onSuccess()
}

export async function saveSourceSettings(
  runtime: Runtime,
  sourceId: string,
  settings: SourceSettings,
): Promise<void> {
  const existing = await runtime.getValue<Record<string, unknown> | null>(CONFIG_KEY, null)
  const prev = (existing?.sourceSettings as Record<string, SourceSettings> | undefined) ?? {}
  await runtime.setValue(CONFIG_KEY, {
    ...(existing ?? {}),
    sourceSettings: { ...prev, [sourceId]: settings },
  })
}
