import { useEffect, useState } from 'react'
import WeatherIcon from './WeatherIcon'
import { WEATHER_OPEN_EVENT } from './WeatherModal'
import {
  fetchWeatherData,
  getSavedLocation,
  getSavedUnit,
  formatTemp,
  type CurrentWeather,
  type TempUnit,
} from '@/lib/weather'

export default function WeatherRailButton() {
  const [current, setCurrent] = useState<CurrentWeather | null>(null)
  const [unit, setUnit] = useState<TempUnit>(getSavedUnit)

  useEffect(() => {
    let isMounted = true
    const loc = getSavedLocation()

    fetchWeatherData(loc)
      .then((data) => {
        if (isMounted) {
          setCurrent(data.current)
          setUnit(getSavedUnit())
        }
      })
      .catch(() => {
        // Silently fallback if offline
      })

    return () => {
      isMounted = false
    }
  }, [])

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    window.dispatchEvent(
      new CustomEvent(WEATHER_OPEN_EVENT, { detail: e.currentTarget }),
    )
  }

  const tooltip = current
    ? `Weather: ${formatTemp(current.temperature, unit)} · ${current.conditionText} (Click for forecast)`
    : 'Weather forecast'

  return (
    <button
      type="button"
      className="rail__weather"
      onClick={handleClick}
      title={tooltip}
      aria-label={tooltip}
    >
      <span className="rail__weather-icon">
        <WeatherIcon
          type={current ? current.conditionIcon : 'cloud-sun'}
          size={21}
          weight="duotone"
          aria-hidden="true"
        />
      </span>
      {current && (
        <span className="rail__weather-badge" aria-hidden="true">
          {formatTemp(current.temperature, unit)}
        </span>
      )}
    </button>
  )
}
