export interface WeatherLocation {
  name: string
  country?: string
  admin1?: string
  latitude: number
  longitude: number
}

export interface CurrentWeather {
  temperature: number
  apparentTemperature: number
  humidity: number
  windSpeed: number
  weatherCode: number
  isDay: boolean
  conditionText: string
  conditionIcon: WeatherIconType
}

export interface HourlyForecast {
  time: string // formatted e.g. "2 PM"
  rawTime: string
  temperature: number
  weatherCode: number
  conditionIcon: WeatherIconType
  precipitationProbability: number
}

export interface DailyForecast {
  date: string // e.g. "2026-10-06"
  dayName: string // e.g. "Today", "Tue", "Wed"
  maxTemp: number
  minTemp: number
  weatherCode: number
  conditionText: string
  conditionIcon: WeatherIconType
  precipitationProbability: number
}

export interface WeatherData {
  location: WeatherLocation
  current: CurrentWeather
  hourly: HourlyForecast[]
  daily: DailyForecast[]
  updatedAt: string
}

export type WeatherIconType =
  | 'sun'
  | 'moon'
  | 'cloud-sun'
  | 'cloud-moon'
  | 'cloud'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'thunderstorm'

export type TempUnit = 'C' | 'F'

const LOCATION_STORAGE_KEY = 'portfolio_weather_location_v1'
const UNIT_STORAGE_KEY = 'portfolio_weather_unit_v1'

export const DEFAULT_LOCATION: WeatherLocation = {
  name: 'Manila',
  country: 'Philippines',
  latitude: 14.5995,
  longitude: 120.9842,
}

export function getSavedLocation(): WeatherLocation {
  if (typeof window === 'undefined') return DEFAULT_LOCATION
  try {
    const raw = localStorage.getItem(LOCATION_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as WeatherLocation
  } catch {
    // ignore
  }
  return DEFAULT_LOCATION
}

export function saveLocation(loc: WeatherLocation): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(loc))
  } catch {
    // ignore
  }
}

export function getSavedUnit(): TempUnit {
  if (typeof window === 'undefined') return 'C'
  try {
    const raw = localStorage.getItem(UNIT_STORAGE_KEY)
    if (raw === 'F' || raw === 'C') return raw
  } catch {
    // ignore
  }
  return 'C'
}

export function saveUnit(unit: TempUnit): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(UNIT_STORAGE_KEY, unit)
  } catch {
    // ignore
  }
}

export function formatTemp(tempC: number, unit: TempUnit): string {
  const value = unit === 'F' ? (tempC * 9) / 5 + 32 : tempC
  return `${Math.round(value)}°`
}

export function formatTempWithUnit(tempC: number, unit: TempUnit): string {
  const value = unit === 'F' ? (tempC * 9) / 5 + 32 : tempC
  return `${Math.round(value)}°${unit}`
}

export function getWeatherCondition(code: number, isDay = true): { text: string; icon: WeatherIconType } {
  switch (code) {
    case 0:
      return { text: isDay ? 'Clear Sky' : 'Clear Night', icon: isDay ? 'sun' : 'moon' }
    case 1:
      return { text: 'Mainly Clear', icon: isDay ? 'sun' : 'moon' }
    case 2:
      return { text: 'Partly Cloudy', icon: isDay ? 'cloud-sun' : 'cloud-moon' }
    case 3:
      return { text: 'Overcast', icon: 'cloud' }
    case 45:
    case 48:
      return { text: 'Foggy', icon: 'fog' }
    case 51:
    case 53:
    case 55:
    case 56:
    case 57:
      return { text: 'Drizzle', icon: 'drizzle' }
    case 61:
    case 63:
    case 65:
    case 66:
    case 67:
      return { text: 'Rain', icon: 'rain' }
    case 71:
    case 73:
    case 75:
    case 77:
      return { text: 'Snow', icon: 'snow' }
    case 80:
    case 81:
    case 82:
      return { text: 'Rain Showers', icon: 'rain' }
    case 85:
    case 86:
      return { text: 'Snow Showers', icon: 'snow' }
    case 95:
    case 96:
    case 99:
      return { text: 'Thunderstorm', icon: 'thunderstorm' }
    default:
      return { text: 'Clear', icon: isDay ? 'sun' : 'moon' }
  }
}

export async function fetchWeatherData(loc: WeatherLocation): Promise<WeatherData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Weather fetch failed: ${res.statusText}`)
  }

  const data = await res.json()
  const currentCondition = getWeatherCondition(data.current.weather_code, Boolean(data.current.is_day))

  // Hourly (next 24 hours starting from current hour)
  const now = new Date()
  const hourly: HourlyForecast[] = []
  const times: string[] = data.hourly.time || []
  const temps: number[] = data.hourly.temperature_2m || []
  const codes: number[] = data.hourly.weather_code || []
  const precipProbs: number[] = data.hourly.precipitation_probability || []

  let startIndex = times.findIndex((t) => new Date(t) >= now)
  if (startIndex === -1) startIndex = 0

  for (let i = startIndex; i < Math.min(startIndex + 24, times.length); i++) {
    const d = new Date(times[i])
    const hours = d.getHours()
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const formattedHour = i === startIndex ? 'Now' : `${hours % 12 || 12} ${ampm}`
    const isDayHour = hours >= 6 && hours < 18
    const condition = getWeatherCondition(codes[i], isDayHour)

    hourly.push({
      time: formattedHour,
      rawTime: times[i],
      temperature: temps[i],
      weatherCode: codes[i],
      conditionIcon: condition.icon,
      precipitationProbability: precipProbs[i] ?? 0,
    })
  }

  // Daily (7 days)
  const daily: DailyForecast[] = []
  const dailyDates: string[] = data.daily.time || []
  const dailyCodes: number[] = data.daily.weather_code || []
  const dailyMax: number[] = data.daily.temperature_2m_max || []
  const dailyMin: number[] = data.daily.temperature_2m_min || []
  const dailyPrecip: number[] = data.daily.precipitation_probability_max || []

  for (let i = 0; i < dailyDates.length; i++) {
    const d = new Date(dailyDates[i] + 'T00:00:00')
    let dayName = d.toLocaleDateString(undefined, { weekday: 'short' })
    if (i === 0) dayName = 'Today'

    const condition = getWeatherCondition(dailyCodes[i], true)

    daily.push({
      date: dailyDates[i],
      dayName,
      maxTemp: dailyMax[i],
      minTemp: dailyMin[i],
      weatherCode: dailyCodes[i],
      conditionText: condition.text,
      conditionIcon: condition.icon,
      precipitationProbability: dailyPrecip[i] ?? 0,
    })
  }

  return {
    location: loc,
    current: {
      temperature: data.current.temperature_2m,
      apparentTemperature: data.current.apparent_temperature,
      humidity: data.current.relative_humidity_2m,
      windSpeed: data.current.wind_speed_10m,
      weatherCode: data.current.weather_code,
      isDay: Boolean(data.current.is_day),
      conditionText: currentCondition.text,
      conditionIcon: currentCondition.icon,
    },
    hourly,
    daily,
    updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }
}

export interface GeocodingResult {
  id: number
  name: string
  country?: string
  admin1?: string
  latitude: number
  longitude: number
}

export async function searchLocations(query: string): Promise<WeatherLocation[]> {
  const trimmed = query.trim()
  if (!trimmed || trimmed.length < 2) return []

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    trimmed,
  )}&count=5&language=en&format=json`

  const res = await fetch(url)
  if (!res.ok) return []

  const data = await res.json()
  if (!data.results || !Array.isArray(data.results)) return []

  return data.results.map((r: GeocodingResult) => ({
    name: r.name,
    country: r.country,
    admin1: r.admin1,
    latitude: r.latitude,
    longitude: r.longitude,
  }))
}
