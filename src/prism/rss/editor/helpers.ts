import type { Runtime } from '../../../runtime'
import { loadConfigSection } from '../../config'
import type { RssSourceOptions } from '../types'
import { coerceRssOptions } from './types'

export async function loadFreshOptions(
  runtime: Runtime,
  fallback: RssSourceOptions,
): Promise<RssSourceOptions> {
  return loadConfigSection(runtime, 'rss', fallback, (raw) => coerceRssOptions(raw, fallback))
}

export function hostnameFor(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}
