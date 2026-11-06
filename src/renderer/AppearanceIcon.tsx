import { CloudMoonRain, CloudSun, Sun, SunMoon, Sunset } from 'lucide-react';
import type { AppearancePalette } from './appearance';

const icons = { apricot: Sun, mist: CloudSun, violet: Sunset, rain: CloudMoonRain };

export function AppearanceIcon({ palette, automatic = false, size = 22 }: {
  palette: AppearancePalette;
  automatic?: boolean;
  size?: number;
}) {
  const Icon = automatic ? SunMoon : icons[palette];
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />;
}
