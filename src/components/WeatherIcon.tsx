import {
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  CloudFog,
  CloudRain,
  CloudSnow,
  CloudLightning,
  type IconProps,
} from '@/components/slab'
import type { WeatherIconType } from '@/lib/weather'

interface WeatherIconProps extends IconProps {
  type: WeatherIconType
}

export default function WeatherIcon({ type, ...props }: WeatherIconProps) {
  switch (type) {
    case 'sun':
      return <Sun {...props} />
    case 'moon':
      return <Moon {...props} />
    case 'cloud-sun':
      return <CloudSun {...props} />
    case 'cloud-moon':
      return <CloudMoon {...props} />
    case 'cloud':
      return <Cloud {...props} />
    case 'fog':
      return <CloudFog {...props} />
    case 'drizzle':
    case 'rain':
      return <CloudRain {...props} />
    case 'snow':
      return <CloudSnow {...props} />
    case 'thunderstorm':
      return <CloudLightning {...props} />
    default:
      return <Sun {...props} />
  }
}
