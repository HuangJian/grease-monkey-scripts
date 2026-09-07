import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { createWeatherSource } from '../../../src/prism/weather/source'
import { createV2exSource } from '../../../src/prism/v2ex/source'
import { findSource } from '../../../src/prism/app/source-registry'
import { readSourceData } from '../../../src/prism/source-types'
import type { AnySource } from '../../../src/prism/source-types'
import type { V2exTopic } from '../../../src/prism/v2ex/types'
import type { WeatherData } from '../../../src/prism/weather/types'

// §2.6 regression: the registry holds a discriminated union `AnySource`; each
// member keeps its concrete data type `T` and literal `id`. `findSource` returns
// `AnySource`, and narrowing on `source.id` recovers `T`.
describe('S8 §2.6 — AnySource discriminated union', () => {
  const sources: AnySource[] = [
    createWeatherSource({ cities: [], ttlMinutes: 10 }),
    createV2exSource({
      ttlMinutes: 5,
      retentionDays: 30,
      todayMinReplies: 1,
      olderMinReplies: 1,
      ageHalfLifeDays: 7,
    }),
  ]

  it('findSource returns the member matching the id', () => {
    expect(findSource(sources, 'weather')?.id).toBe('weather')
    expect(findSource(sources, 'v2ex')?.id).toBe('v2ex')
    expect(findSource(sources, 'does-not-exist')).toBeUndefined()
  })

  it('narrowing on id recovers the concrete data type T (compile-time guard)', () => {
    const weather = findSource(sources, 'weather')
    if (weather && weather.id === 'weather') {
      // If narrowing failed, `readSourceData` would return the whole union and
      // this assignment would not typecheck — so this guards §2.6 at compile time.
      const data: WeatherData | null = readSourceData(weather, null)
      expect(data).toBeNull()
    } else {
      throw new Error('expected weather source after id narrowing')
    }

    const v2ex = findSource(sources, 'v2ex')
    if (v2ex && v2ex.id === 'v2ex') {
      const data: V2exTopic[] | null = readSourceData(v2ex, null)
      expect(data).toBeNull()
    } else {
      throw new Error('expected v2ex source after id narrowing')
    }
  })

  it('source-registry.ts no longer performs double-cast erasure (static lock)', () => {
    const registryPath = fileURLToPath(
      new URL('../../../src/prism/app/source-registry.ts', import.meta.url),
    )
    const content = readFileSync(registryPath, 'utf8')
    expect(content).not.toContain('as unknown as')
  })
})
