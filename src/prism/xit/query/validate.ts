import type { QueryNode } from './types'

export function validateNoMultipleStatusInAnd(node: QueryNode): string | null {
  if (node.type === 'and') {
    const statusCount = node.children.filter((c) => c.type === 'status').length
    if (statusCount > 1) {
      return 'Only one status term allowed (use OR for multiple statuses)'
    }
    for (const child of node.children) {
      const err = validateNoMultipleStatusInAnd(child)
      if (err) return err
    }
  }
  if (node.type === 'or') {
    for (const child of node.children) {
      const err = validateNoMultipleStatusInAnd(child)
      if (err) return err
    }
  }
  if (node.type === 'not') {
    return validateNoMultipleStatusInAnd(node.child)
  }
  return null
}
