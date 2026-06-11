export function defaultConfigExample(): string {
  return JSON.stringify(
    {
      weather: {
        ttlMinutes: 30,
        cities: [
          { latitude: 39.9042, longitude: 116.4074, cityLabel: '北京' },
          { latitude: 31.2304, longitude: 121.4737, cityLabel: '上海' },
        ],
      },
    },
    null,
    2,
  )
}
