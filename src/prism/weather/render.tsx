import { render } from 'preact'
import type { Runtime } from '../../runtime'
import { WeatherComponent } from './component'
import type { WeatherData } from './types'

export function renderWeather(
  container: HTMLElement,
  data: WeatherData | null,
  runtime: Runtime,
): void {
  render(null, container)
  render(
    <WeatherComponent data={data} root={container} runtime={runtime} activeIndex={0} />,
    container,
  )
}

export function customizeWeatherHeader(
  _titleContainer: HTMLElement,
  _data: WeatherData | null,
): void {
  // No-op: WeatherComponent handles its own tabs via RenderComponent path
}
