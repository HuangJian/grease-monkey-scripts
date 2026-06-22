export type WeatherCity = {
  latitude: number
  longitude: number
  cityLabel: string
  cmaStationId?: string
}

export type WeatherCurrent = {
  time: string
  temperature_2m: number
  apparent_temperature: number
  weather_code: number
  wind_speed_10m: number
  wind_direction_10m: number
  air_quality: WeatherAirQuality | null
  humidity?: number
  pressure?: number
  precipitation?: number
  source?: 'open-meteo' | 'cma'
}

export type WeatherAirQuality = {
  us_aqi: number
  pm2_5: number
  pm10: number
}

export type WeatherHourly = {
  time: string[]
  temperature_2m: number[]
  weather_code: number[]
  precipitation_probability: number[]
  pressure?: number[]
  humidity?: number[]
  cloud_cover?: number[]
  precipitation_amount?: number[]
  wind_speed_10m?: number[]
  wind_direction_10m?: number[]
}

export type WeatherDaily = {
  time: string[]
  temperature_2m_max: number[]
  temperature_2m_min: number[]
  weather_code: number[]
  precipitation_probability_max: number[]
  precipitation_sum?: number[]
}

export type WeatherCityData = {
  current: WeatherCurrent
  hourly: WeatherHourly
  daily: WeatherDaily
  cmaUrl?: string
  cmaFailed?: boolean
}

export type WeatherCityEntry =
  | { status: 'ok'; cityLabel: string; data: WeatherCityData }
  | { status: 'error'; cityLabel: string; error: string }

export type WeatherData = {
  entries: WeatherCityEntry[]
}

export type AqiLevel = {
  label: string
  color: string
}

export type WeatherSourceOptions = {
  cities: WeatherCity[]
  ttlMinutes: number
}
