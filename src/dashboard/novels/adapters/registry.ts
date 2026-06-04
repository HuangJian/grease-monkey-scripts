import { suduguAdapter } from './sudugu'
import type { NovelAdapter } from './types'

export const ADAPTERS: ReadonlyArray<NovelAdapter> = [suduguAdapter]

export function adapterByHostname(hostname: string): NovelAdapter | undefined {
  return ADAPTERS.find((a) => a.hostnames.includes(hostname))
}

export function adapterByUrl(url: string): NovelAdapter | undefined {
  try {
    return adapterByHostname(new URL(url).hostname)
  } catch {
    return undefined
  }
}
