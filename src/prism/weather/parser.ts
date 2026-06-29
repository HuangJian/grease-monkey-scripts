import type { WeatherCityData } from './types'

export function parseWeather(json: unknown): WeatherCityData | null {
  if (!json || typeof json !== 'object') return null
  const obj = json as Record<string, unknown>
  const current = obj.current as Record<string, unknown> | undefined
  const daily = obj.daily as Record<string, unknown> | undefined
  const hourly = obj.hourly as Record<string, unknown> | undefined
  if (!current || !daily || !hourly) return null
  if (
    typeof current.temperature_2m !== 'number' ||
    typeof current.apparent_temperature !== 'number' ||
    typeof current.weather_code !== 'number' ||
    typeof current.wind_speed_10m !== 'number' ||
    typeof current.wind_direction_10m !== 'number' ||
    typeof current.time !== 'string'
  ) {
    return null
  }
  if (
    !Array.isArray(daily.time) ||
    !Array.isArray(daily.temperature_2m_max) ||
    !Array.isArray(daily.temperature_2m_min) ||
    !Array.isArray(daily.weather_code) ||
    !Array.isArray(daily.precipitation_probability_max)
  ) {
    return null
  }
  if (
    !Array.isArray(hourly.time) ||
    !Array.isArray(hourly.temperature_2m) ||
    !Array.isArray(hourly.weather_code) ||
    !Array.isArray(hourly.precipitation_probability)
  ) {
    return null
  }
  return {
    current: {
      time: current.time,
      temperature_2m: current.temperature_2m,
      apparent_temperature: current.apparent_temperature,
      weather_code: current.weather_code,
      wind_speed_10m: current.wind_speed_10m,
      wind_direction_10m: current.wind_direction_10m,
      air_quality: null,
      humidity: 0,
      pressure: 0,
      precipitation: 0,
      source: 'open-meteo',
    },
    hourly: {
      time: hourly.time as string[],
      temperature_2m: hourly.temperature_2m as number[],
      weather_code: hourly.weather_code as number[],
      precipitation_probability: hourly.precipitation_probability as number[],
      pressure: [],
      humidity: [],
      cloud_cover: [],
      precipitation_amount: [],
      wind_speed_10m: [],
      wind_direction_10m: [],
    },
    daily: {
      time: daily.time as string[],
      temperature_2m_max: daily.temperature_2m_max as number[],
      temperature_2m_min: daily.temperature_2m_min as number[],
      weather_code: daily.weather_code as number[],
      precipitation_probability_max: daily.precipitation_probability_max as number[],
      precipitation_sum: [],
    },
    cmaUrl: '',
    cmaFailed: false,
  }
}
