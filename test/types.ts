/** Type helpers for happy-dom compatibility */
export function asElement<T extends Node>(node: T | null): T {
  return node as T
}

export function asHTMLElement(el: Element | null): HTMLElement {
  return el as unknown as HTMLElement
}
