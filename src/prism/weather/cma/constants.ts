/**
 * CMA (China Meteorological Administration) constants.
 *
 * WMO weather codes, CMA icon/text mappings, wind direction mappings,
 * and Beaufort scale midpoints.
 */

export const WMO_CLEAR = 0
export const WMO_MAINLY_CLEAR = 1
export const WMO_PARTLY_CLOUDY = 2
export const WMO_OVERCAST = 3
export const WMO_FOG = 45
export const WMO_DRIZZLE = 51
export const WMO_RAIN = 61
export const WMO_FREEZING_RAIN = 66
export const WMO_SNOW = 71
export const WMO_RAIN_SHOWER = 80
export const WMO_SNOW_SHOWER = 85
export const WMO_THUNDERSTORM = 95
export const WMO_SAND = 3

export const CMA_ICON_TO_CODE: Record<string, number> = {
  w0: WMO_CLEAR,
  w1: WMO_PARTLY_CLOUDY,
  w2: WMO_OVERCAST,
  w3: WMO_RAIN_SHOWER,
  w4: WMO_THUNDERSTORM,
  w5: WMO_RAIN_SHOWER,
  w6: WMO_RAIN,
  w7: WMO_RAIN,
  w8: WMO_FREEZING_RAIN,
  w9: WMO_DRIZZLE,
  w10: WMO_RAIN,
  w11: WMO_THUNDERSTORM,
  w12: WMO_SNOW,
  w13: WMO_SNOW_SHOWER,
  w14: WMO_FOG,
  w15: WMO_SAND,
  w16: WMO_SAND,
  w17: WMO_SAND,
  w18: WMO_FOG,
  w19: WMO_RAIN,
  w20: WMO_MAINLY_CLEAR,
  w21: WMO_RAIN_SHOWER,
  w22: WMO_SNOW,
  w23: WMO_SNOW,
  w24: WMO_SNOW,
  w25: WMO_SNOW,
  w26: WMO_SNOW,
  w27: WMO_SAND,
  w28: WMO_FOG,
  w29: WMO_RAIN,
  w30: WMO_MAINLY_CLEAR,
  w31: WMO_MAINLY_CLEAR,
  w32: WMO_RAIN,
}

export const CMA_TEXT_TO_CODE: Record<string, number> = {
  晴: WMO_CLEAR,
  多云: WMO_PARTLY_CLOUDY,
  阴: WMO_OVERCAST,
  阵雨: WMO_RAIN_SHOWER,
  雷阵雨: WMO_THUNDERSTORM,
  雨夹雪: WMO_FREEZING_RAIN,
  小雨: WMO_RAIN,
  中雨: WMO_RAIN,
  大雨: WMO_RAIN,
  暴雨: WMO_RAIN,
  雾: WMO_FOG,
  霾: WMO_FOG,
  小雪: WMO_SNOW,
  中雪: WMO_SNOW,
  大雪: WMO_SNOW,
  暴雪: WMO_SNOW,
  扬沙: WMO_SAND,
  沙尘暴: WMO_SAND,
  浮尘: WMO_SAND,
}

export const CMA_WIND_DIR_TO_DEG: Record<string, number> = {
  北风: 0,
  东北风: 45,
  东风: 90,
  东南风: 135,
  南风: 180,
  西南风: 225,
  西风: 270,
  西北风: 315,
  北东北风: 22.5,
  东北东风: 67.5,
  东东南风: 112.5,
  东南南风: 157.5,
  南西南风: 202.5,
  西南西风: 247.5,
  西西北风: 292.5,
  西北北风: 337.5,
}

export const BEAUFORT_MIDPOINT_MS: number[] = [
  0, 0.9, 2.45, 4.4, 6.7, 9.35, 12.3, 15.5, 18.95, 22.55, 26.45, 30.55, 34.85, 39.35, 44.05, 48.95,
  54.05,
]

export const MISSING_TEMP = 9999
