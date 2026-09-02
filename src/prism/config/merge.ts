export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  if (Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Deep-merge two plain objects. Objects are recursively merged; arrays and
 * primitives are replaced.
 *
 * The return type is `T` (same as `base`) for ergonomic chaining at call sites.
 * The runtime `isPlainObject` guard ensures only structurally compatible values
 * are recursively merged; non-object values from `override` replace `base`
 * wholesale. Values whose type differs from the existing base value are skipped
 * (with a warning) instead of being written through and mislabeled as `T`.
 */
export function deepMerge<T extends Record<string, unknown>>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : (override as T)
  }
  const result: Record<string, unknown> = { ...base }
  Object.keys(override).forEach((key) => {
    const baseVal = base[key]
    const overrideVal = override[key]
    if (isPlainObject(baseVal) && isPlainObject(overrideVal)) {
      result[key] = deepMerge(baseVal, overrideVal)
    } else if (overrideVal !== undefined) {
      if (baseVal !== undefined && typeof baseVal !== typeof overrideVal) {
        console.warn(`[gm-dashboard] deepMerge type mismatch for "${key}": ignoring override`)
        return
      }
      result[key] = overrideVal
    }
  })
  return result as T
}
