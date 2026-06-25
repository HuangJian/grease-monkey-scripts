import { render } from 'preact'
import { WeatherComponent } from './component'
import type { WeatherData } from './types'

export function renderWeather(container: HTMLElement, data: WeatherData | null): void {
  render(null, container)
  render(
    <WeatherComponent
      data={data}
      root={undefined as any}
      runtime={undefined as any}
      onHeaderChange={() => {}}
      activeIndex={0}
    />,
    container,
  )
}

export function customizeWeatherHeader(
  _titleContainer: HTMLElement,
  _data: WeatherData | null,
): void {
  // No-op: WeatherComponent handles its own tabs via RenderComponent path
}
