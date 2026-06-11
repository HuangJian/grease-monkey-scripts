import type { Runtime } from '../../runtime'
import { tagPanelCss } from '../../shared/tag-panel'

export function addStyles(runtime: Runtime): void {
  runtime.addStyle(tagPanelCss)
  runtime.addStyle(`/*{{V2EX_TIME_SAVER_CSS}}*/`)
}
