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
 * wholesale. The `as T` cast is safe because the merge preserves the shape of
 * `base` for any key not present in `override`, and `override` values are only
 * inserted when they are plain objects (recursively merged) or non-undefined
 * primitives/arrays (direct replacement).
 */
export function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : (override as T)
  }
  const result: Record<string, unknown> = { ...base }
  Object.keys(override).forEach((key) => {
    const baseVal = base[key as keyof T]
    const overrideVal = override[key]
    if (isPlainObject(baseVal) && isPlainObject(overrideVal)) {
      result[key] = deepMerge(baseVal, overrideVal)
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal
    }
  })
  return result as T
}
