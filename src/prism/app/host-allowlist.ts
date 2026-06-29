import type { Config } from '../types'

export function isHostAllowed(config: Config, hostname: string): boolean {
  if (config.hostAllowlist.length === 0) return true
  return config.hostAllowlist.some((entry) => hostname === entry || hostname.endsWith(`.${entry}`))
}
