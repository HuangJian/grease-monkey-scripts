import { render } from 'preact'
import type { Runtime } from '../../../runtime'
import { XitBody } from '../component/body'
import type { XitData } from '../types'
import { createXitHeaderState } from '../component/header'

export { renderXitPreview } from './preview'
export { XitList } from './list'

export function renderXit(container: HTMLElement, data: XitData | null, runtime: Runtime): void {
  render(null, container)
  const headerStore = createXitHeaderState()
  render(
    <XitBody data={data} root={container} runtime={runtime} headerStore={headerStore} />,
    container,
  )
}
