/**
 * Preact hooks external shim.
 *
 * At runtime Preact hooks are loaded via Tampermonkey @require (UMD build),
 * which sets `window.preactHooks`. This shim re-exports that global so source
 * files can keep using normal ESM imports. The build script redirects every
 * `import … from 'preact/hooks'` to this file.
 */
import type * as PreactHooks from 'preact/hooks'

const lib = globalThis as unknown as { preactHooks: typeof PreactHooks }
const g = lib.preactHooks

export const useState = g.useState
export const useEffect = g.useEffect
export const useLayoutEffect = g.useLayoutEffect
export const useRef = g.useRef
export const useMemo = g.useMemo
export const useCallback = g.useCallback
export const useReducer = g.useReducer
export const useContext = g.useContext
export const useId = g.useId
export const useImperativeHandle = g.useImperativeHandle
export const useDebugValue = g.useDebugValue
