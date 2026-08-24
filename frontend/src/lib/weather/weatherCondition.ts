/**
 * Single shared mapping from an Open-Meteo WMO weather code (+ day/night) to a
 * condition label, icon, and colour tone. Used by My Environment, the Click
 * Map Weather Details panel, and the Home Page dashboard so the same code
 * always renders the same icon/label everywhere (no per-screen guessing from
 * precipitation or humidity alone).
 *
 * WMO codes: https://open-meteo.com/en/docs (see "WMO Weather interpretation codes")
 */
import {
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudMoonRain,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  CloudSunRain,
  Cloudy,
  Wind,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";

export type WeatherTone = "sun" | "cloud" | "fog" | "rain" | "storm" | "snow" | "wind";

export interface WeatherCondition {
  label: string;
  Icon: LucideIcon;
  tone: WeatherTone;
}

const TONE_CLASS: Record<WeatherTone, string> = {
  sun: "text-amber-500",
  cloud: "text-slate-400",
  fog: "text-slate-400",
  rain: "text-blue-500",
  storm: "text-violet-500",
  snow: "text-cyan-500",
  wind: "text-teal-500",
};

/** Tailwind text-color class for a tone, so icon + accent colour stay consistent. */
export function toneClassName(tone: WeatherTone): string {
  return TONE_CLASS[tone];
}

/** Maps an Open-Meteo WMO weather code to a condition label/icon/tone. `isDay` selects the day/night variant for clear/partly-cloudy codes only (matches how every mainstream weather app treats day/night). */
export function weatherConditionFromCode(
  code: number | null | undefined,
  isDay: boolean | null | undefined = true
): WeatherCondition {
  const day = isDay !== false;

  switch (code) {
    case 0:
      return day
        ? { label: "Clear", Icon: Sun, tone: "sun" }
        : { label: "Clear", Icon: Moon, tone: "sun" };
    case 1:
      return day
        ? { label: "Mostly Clear", Icon: Sun, tone: "sun" }
        : { label: "Mostly Clear", Icon: Moon, tone: "sun" };
    case 2:
      return day
        ? { label: "Partly Cloudy", Icon: CloudSun, tone: "cloud" }
        : { label: "Partly Cloudy", Icon: CloudMoon, tone: "cloud" };
    case 3:
      return { label: "Overcast", Icon: Cloudy, tone: "cloud" };

    case 45:
      return { label: "Fog", Icon: CloudFog, tone: "fog" };
    case 48:
      return { label: "Rime Fog", Icon: CloudFog, tone: "fog" };

    case 51:
    case 53:
      return { label: "Drizzle", Icon: CloudDrizzle, tone: "rain" };
    case 55:
      return { label: "Dense Drizzle", Icon: CloudDrizzle, tone: "rain" };
    case 56:
    case 57:
      return { label: "Freezing Drizzle", Icon: CloudDrizzle, tone: "rain" };

    case 61:
      return { label: "Light Rain", Icon: day ? CloudSunRain : CloudMoonRain, tone: "rain" };
    case 63:
      return { label: "Rain", Icon: CloudRain, tone: "rain" };
    case 65:
      return { label: "Heavy Rain", Icon: CloudRainWind, tone: "rain" };
    case 66:
    case 67:
      return { label: "Freezing Rain", Icon: CloudRain, tone: "rain" };

    case 71:
    case 73:
    case 77:
      return { label: "Snow", Icon: CloudSnow, tone: "snow" };
    case 75:
      return { label: "Heavy Snow", Icon: CloudSnow, tone: "snow" };
    case 85:
      return { label: "Snow Showers", Icon: CloudSnow, tone: "snow" };
    case 86:
      return { label: "Heavy Snow Showers", Icon: CloudSnow, tone: "snow" };

    case 80:
      return { label: "Light Showers", Icon: day ? CloudSunRain : CloudMoonRain, tone: "rain" };
    case 81:
      return { label: "Showers", Icon: CloudRain, tone: "rain" };
    case 82:
      return { label: "Violent Showers", Icon: CloudRainWind, tone: "rain" };

    case 95:
      return { label: "Thunderstorm", Icon: CloudLightning, tone: "storm" };
    case 96:
    case 99:
      return { label: "Thunderstorm with Hail", Icon: CloudLightning, tone: "storm" };

    default:
      return { label: "—", Icon: Cloudy, tone: "cloud" };
  }
}

/** "Windy" is not its own WMO code - callers show it when wind speed crosses a threshold instead of a code. */
export const WINDY_CONDITION: WeatherCondition = { label: "Windy", Icon: Wind, tone: "wind" };

/** True when sustained wind speed (km/h) is high enough to prefer the Windy condition over the WMO code's icon. */
export function isWindyConditionOverride(windSpeedKmh: number | null | undefined): boolean {
  return typeof windSpeedKmh === "number" && windSpeedKmh >= 40;
}
