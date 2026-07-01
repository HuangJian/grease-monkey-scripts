/**
 * Preact external shim.
 *
 * At runtime Preact is loaded via Tampermonkey @require (UMD build), which
 * sets `window.preact`. This shim re-exports that global so source files can
 * keep using normal ESM imports. The build script redirects every
 * `import … from 'preact'` to this file.
 */
import type * as Preact from 'preact'

const lib = globalThis as unknown as { preact: typeof Preact }
const g = lib.preact

export const h = g.h
export const render = g.render
export const hydrate = g.hydrate
export const Component = g.Component
export const Fragment = g.Fragment
export const cloneElement = g.cloneElement
export const createContext = g.createContext
export const createElement = g.createElement
export const createRef = g.createRef
export const toChildArray = g.toChildArray
export const isValidElement = g.isValidElement
export const options = g.options
