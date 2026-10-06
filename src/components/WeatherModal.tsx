import { useCallback, useEffect, useRef, useState } from 'react'
import {
  X,
  ArrowClockwise,
  MapPin,
  MagnifyingGlass,
  Drop,
  Wind,
  Thermometer,
  Umbrella,
  Clock,
  Calendar,
} from '@/components/slab'
import WeatherIcon from './WeatherIcon'
import {
  fetchWeatherData,
  getSavedLocation,
  saveLocation,
  getSavedUnit,
  saveUnit,
  formatTemp,
  formatTempWithUnit,
  searchLocations,
  type WeatherData,
  type WeatherLocation,
  type TempUnit,
} from '@/lib/weather'
import { useDismiss, type DismissReason } from '@/hooks/useDismiss'

export const WEATHER_OPEN_EVENT = 'weather:open'

const POPULAR_CITIES: WeatherLocation[] = [
  { name: 'Manila', country: 'Philippines', latitude: 14.5995, longitude: 120.9842 },
  { name: 'Tokyo', country: 'Japan', latitude: 35.6895, longitude: 139.6917 },
  { name: 'Singapore', country: 'Singapore', latitude: 1.3521, longitude: 103.8198 },
  { name: 'London', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278 },
  { name: 'New York', country: 'United States', latitude: 40.7128, longitude: -74.006 },
]

export default function WeatherModal() {
  const [open, setOpen] = useState(false)
  const [location, setLocation] = useState<WeatherLocation>(getSavedLocation)
  const [unit, setUnit] = useState<TempUnit>(getSavedUnit)
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<WeatherLocation[]>([])
  const [searching, setSearching] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const returnRef = useRef<HTMLElement | null>(null)
  const searchTimeoutRef = useRef<number | null>(null)

  const loadWeather = useCallback(async (loc: WeatherLocation, isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const data = await fetchWeatherData(loc)
      setWeather(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fetch weather data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Initial fetch on mount or when location changes
  useEffect(() => {
    if (open && (!weather || weather.location.latitude !== location.latitude)) {
      void loadWeather(location)
    }
  }, [open, location, weather, loadWeather])

  // Custom event listener to open modal from anywhere
  useEffect(() => {
    const handleOpen = (e: Event) => {
      returnRef.current = (e as CustomEvent<HTMLElement | null>).detail
      setOpen(true)
    }
    window.addEventListener(WEATHER_OPEN_EVENT, handleOpen)
    return () => window.removeEventListener(WEATHER_OPEN_EVENT, handleOpen)
  }, [])

  const close = useCallback(
    (reason: DismissReason | 'button') => {
      setOpen(false)
      setSearchOpen(false)
      setSearchQuery('')
      setSearchResults([])
      if (reason !== 'outside') {
        returnRef.current?.focus()
      }
      returnRef.current = null
    },
    [],
  )

  useDismiss(open, rootRef, close)

  // Focus panel on open
  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  // Search autocomplete handler with debounce
  const handleSearchInput = (value: string) => {
    setSearchQuery(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)

    if (value.trim().length < 2) {
      setSearchResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    searchTimeoutRef.current = window.setTimeout(async () => {
      try {
        const results = await searchLocations(value)
        setSearchResults(results)
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 350)
  }

  const selectLocation = (loc: WeatherLocation) => {
    setLocation(loc)
    saveLocation(loc)
    setSearchOpen(false)
    setSearchQuery('')
    setSearchResults([])
    void loadWeather(loc)
  }

  const toggleUnit = (next: TempUnit) => {
    setUnit(next)
    saveUnit(next)
  }

  // Min and max for 7-day temperature bar scale
  const globalMin = weather ? Math.min(...weather.daily.map((d) => d.minTemp)) : 0
  const globalMax = weather ? Math.max(...weather.daily.map((d) => d.maxTemp)) : 40
  const tempRange = Math.max(globalMax - globalMin, 1)

  return (
    <div
      className={`weather-overlay${open ? ' is-open' : ''}`}
      ref={rootRef}
      aria-hidden={!open}
    >
      <div
        className="weather-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Weather forecast"
        tabIndex={-1}
        ref={panelRef}
      >
        {/* Header */}
        <header className="weather-modal__head">
          <button
            type="button"
            className="weather-modal__loc"
            onClick={() => setSearchOpen((prev) => !prev)}
            title="Change city"
          >
            <MapPin size={18} weight="fill" className="weather-modal__loc-icon" aria-hidden="true" />
            <span>{location.name}</span>
            {location.country && (
              <span className="weather-modal__loc-country">({location.country})</span>
            )}
          </button>

          <div className="weather-modal__controls">
            {/* Unit Switcher */}
            <div className="weather-unit-switch" role="group" aria-label="Temperature unit">
              <button
                type="button"
                className={`weather-unit-btn${unit === 'C' ? ' is-active' : ''}`}
                onClick={() => toggleUnit('C')}
              >
                °C
              </button>
              <button
                type="button"
                className={`weather-unit-btn${unit === 'F' ? ' is-active' : ''}`}
                onClick={() => toggleUnit('F')}
              >
                °F
              </button>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              className={`weather-btn-icon${refreshing ? ' is-spinning' : ''}`}
              onClick={() => void loadWeather(location, true)}
              title="Refresh weather"
              aria-label="Refresh weather data"
            >
              <ArrowClockwise size={16} weight="bold" aria-hidden="true" />
            </button>

            {/* Close Button */}
            <button
              type="button"
              className="weather-btn-icon"
              onClick={() => close('button')}
              aria-label="Close weather modal"
            >
              <X size={16} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Search Bar / Quick Cities */}
        {searchOpen && (
          <div className="weather-search-bar">
            <div className="weather-search-box">
              <MagnifyingGlass size={16} weight="bold" color="var(--muted)" aria-hidden="true" />
              <input
                type="text"
                className="weather-search-input"
                placeholder="Search city (e.g. Manila, Tokyo, Paris)..."
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                autoFocus
              />
              {searching ? (
                <span className="weather-search-spinner" aria-label="Searching locations">
                  <ArrowClockwise size={14} weight="bold" />
                </span>
              ) : (
                searchQuery && (
                  <button
                    type="button"
                    className="weather-search-clear"
                    onClick={() => {
                      setSearchQuery('')
                      setSearchResults([])
                    }}
                    aria-label="Clear search"
                  >
                    <X size={14} weight="bold" />
                  </button>
                )
              )}
            </div>

            {/* Autocomplete dropdown */}
            {searchResults.length > 0 && (
              <ul className="weather-suggestions" role="listbox">
                {searchResults.map((r, i) => (
                  <li key={`${r.name}-${r.latitude}-${i}`}>
                    <button
                      type="button"
                      className="weather-suggestion-item"
                      onClick={() => selectLocation(r)}
                    >
                      <span>
                        <b>{r.name}</b>
                        {r.admin1 && `, ${r.admin1}`}
                      </span>
                      <span className="weather-suggestion-sub">{r.country}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Quick Cities chips */}
            <div className="weather-chips">
              <span className="weather-chip-label">Quick:</span>
              {POPULAR_CITIES.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className="weather-chip"
                  onClick={() => selectLocation(c)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Body content */}
        <div className="weather-modal__body">
          {loading && !weather ? (
            <div className="weather-loading">
              <div className="weather-loading-spinner" />
              <p>Fetching weather for {location.name}...</p>
            </div>
          ) : error && !weather ? (
            <div className="weather-error">
              <p>Failed to load weather: {error}</p>
              <button
                type="button"
                className="weather-error-retry"
                onClick={() => void loadWeather(location)}
              >
                Try Again
              </button>
            </div>
          ) : weather ? (
            <>
              {/* Hero current condition */}
              <section className="weather-hero">
                <div className="weather-hero__left">
                  <span className="weather-hero__temp">
                    {formatTempWithUnit(weather.current.temperature, unit)}
                  </span>
                  <div className="weather-hero__meta">
                    <span className="weather-hero__condition">
                      {weather.current.conditionText}
                    </span>
                    {weather.daily[0] && (
                      <span className="weather-hero__range">
                        <span className="weather-hero__range-high" title="High temperature">
                          ↑ {formatTemp(weather.daily[0].maxTemp, unit)}
                        </span>
                        <span className="weather-hero__range-low" title="Low temperature">
                          ↓ {formatTemp(weather.daily[0].minTemp, unit)}
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="weather-hero__right">
                  <div className="weather-hero__icon-halo" aria-hidden="true" />
                  <WeatherIcon
                    type={weather.current.conditionIcon}
                    size={80}
                    weight="duotone"
                    className="weather-hero__icon"
                  />
                </div>
              </section>

              {/* Key Metrics */}
              <section className="weather-metrics">
                <div className="weather-metric-card">
                  <div className="weather-metric-top">
                    <Thermometer size={14} weight="bold" />
                    <span>Feels Like</span>
                  </div>
                  <span className="weather-metric-val">
                    {formatTemp(weather.current.apparentTemperature, unit)}
                  </span>
                </div>

                <div className="weather-metric-card">
                  <div className="weather-metric-top">
                    <Drop size={14} weight="bold" />
                    <span>Humidity</span>
                  </div>
                  <span className="weather-metric-val">{weather.current.humidity}%</span>
                </div>

                <div className="weather-metric-card">
                  <div className="weather-metric-top">
                    <Wind size={14} weight="bold" />
                    <span>Wind</span>
                  </div>
                  <span className="weather-metric-val">
                    {Math.round(weather.current.windSpeed)} km/h
                  </span>
                </div>

                <div className="weather-metric-card">
                  <div className="weather-metric-top">
                    <Umbrella size={14} weight="bold" />
                    <span>Rain</span>
                  </div>
                  <span className="weather-metric-val">
                    {weather.daily[0]?.precipitationProbability ?? 0}%
                  </span>
                </div>
              </section>

              {/* Hourly Forecast */}
              <section>
                <div className="weather-section-title">
                  <Clock size={15} weight="bold" />
                  <span>Hourly Forecast</span>
                </div>
                <div className="weather-hourly" role="region" aria-label="Hourly forecast">
                  {weather.hourly.map((h, i) => (
                    <div key={`${h.time}-${i}`} className="weather-hourly-item">
                      <span className="weather-hourly-time">{h.time}</span>
                      <WeatherIcon
                        type={h.conditionIcon}
                        size={24}
                        weight="duotone"
                        className="weather-hourly-icon"
                      />
                      <span className="weather-hourly-temp">
                        {formatTemp(h.temperature, unit)}
                      </span>
                      {h.precipitationProbability > 10 && (
                        <span className="weather-hourly-precip">
                          {h.precipitationProbability}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* 7-Day Outlook */}
              <section>
                <div className="weather-section-title">
                  <Calendar size={15} weight="bold" />
                  <span>7-Day Outlook</span>
                </div>
                <ul className="weather-daily-list" role="list">
                  {weather.daily.map((d, i) => {
                    const minPct = ((d.minTemp - globalMin) / tempRange) * 100
                    const maxPct = ((d.maxTemp - globalMin) / tempRange) * 100

                    return (
                      <li key={`${d.date}-${i}`} className="weather-daily-item">
                        <span className="weather-daily-day">{d.dayName}</span>

                        <div className="weather-daily-condition">
                          <WeatherIcon
                            type={d.conditionIcon}
                            size={20}
                            weight="duotone"
                            color="var(--orange)"
                          />
                          <span className="weather-daily-cond-text">{d.conditionText}</span>
                        </div>

                        <span className="weather-daily-precip">
                          {d.precipitationProbability > 15 ? `${d.precipitationProbability}%` : ''}
                        </span>

                        <div className="weather-daily-bar-wrap">
                          <span className="weather-daily-min">{formatTemp(d.minTemp, unit)}</span>
                          <div className="weather-temp-bar">
                            <span
                              className="weather-temp-bar-fill"
                              style={{
                                left: `${Math.max(0, minPct)}%`,
                                width: `${Math.max(12, maxPct - minPct)}%`,
                              }}
                            />
                          </div>
                          <span className="weather-daily-max">{formatTemp(d.maxTemp, unit)}</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <footer className="weather-footer">
          <span>
            {weather ? `Updated at ${weather.updatedAt}` : 'Live weather data'}
          </span>
          <span>
            Powered by{' '}
            <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
              Open-Meteo
            </a>
          </span>
        </footer>
      </div>
    </div>
  )
}
