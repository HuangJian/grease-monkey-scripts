/**
 * Novels editor helper functions.
 */
import { loadConfigSection } from '../../config'
import { adapterByHostname } from '../adapters/registry'
import type { NovelSourceOptions } from '../types'
import type { Runtime } from '../../../runtime'
import { coerceNovelsOptions } from './types'

export async function loadFreshOptions(
  runtime: Runtime,
  fallback: NovelSourceOptions,
): Promise<NovelSourceOptions> {
  return loadConfigSection(runtime, 'novels', fallback, (raw) => coerceNovelsOptions(raw, fallback))
}

export function hostnameFor(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

export function isUnknownHost(url: string): boolean {
  const host = hostnameFor(url)
  return !host || !adapterByHostname(host)
}
