import type { Runtime } from '../../runtime'
import type { Config } from '../types'
import { CONFIG_KEY } from '../types'
import { deepMerge } from '../config'
import { validateConfig } from '../config'
import { defaultConfigExample } from '../config'

export function editConfig(runtime: Runtime, config: Config): void {
  let input: string | null
  try {
    input = runtime.prompt(`粘贴 JSON 覆盖配置（参考示例）：\n${defaultConfigExample()}`, '')
  } catch {
    runtime.alert('当前页面禁用了 prompt，无法编辑配置。')
    return
  }
  if (input === null) return
  const trimmed = input.trim()
  if (!trimmed) return
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (e) {
    runtime.alert('配置 JSON 解析失败：' + (e instanceof Error ? e.message : String(e)))
    return
  }
  const merged = deepMerge(config, parsed)
  const validation = validateConfig(merged)
  if (!validation.ok) {
    runtime.alert('配置校验失败：' + validation.error)
    return
  }
  void runtime.setValue(CONFIG_KEY, merged)
  runtime.alert('配置已保存，刷新页面后生效。')
}
