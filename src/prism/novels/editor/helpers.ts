/**
 * Novels editor helper functions.
 */
import { loadConfigSection } from '../../config'
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

/**
 * Domains rotate; support is decided from page structure after fetching.
 * The editor only rejects syntactically invalid URLs, never an unfamiliar host.
 */
export function isInvalidUrl(url: string): boolean {
  return hostnameFor(url) === null
}
