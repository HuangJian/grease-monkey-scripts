import type { Runtime } from '../../runtime'
import type { Config } from '../types'
import { deepMerge } from '../config'
import { validateConfig } from '../config'
import { defaultConfigExample } from '../config'

export function editConfig(runtime: Runtime, config: Config): void {
  let input: string | null
  try {
    input = runtime.prompt(`粘贴 JSON 覆盖配置（参考示例）：\n${defaultConfigExample()}`, '')
  } catch {
    alert(runtime, '当前页面禁用了 prompt，无法编辑配置。')
    return
  }
  if (input === null) return
  const trimmed = input.trim()
  if (!trimmed) return
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (e) {
    alert(runtime, '配置 JSON 解析失败：' + (e instanceof Error ? e.message : String(e)))
    return
  }
  const merged = deepMerge(config, parsed)
  const validation = validateConfig(merged)
  if (!validation.ok) {
    alert(runtime, '配置校验失败：' + validation.error)
    return
  }
  void runtime.setValue('dashboard:v1:config', merged)
  alert(runtime, '配置已保存，刷新页面后生效。')
}

function alert(runtime: Runtime, message: string): void {
  try {
    runtime.prompt(message, '')
  } catch {
    window.alert(message)
  }
}
