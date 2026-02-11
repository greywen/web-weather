import { WeatherProvider } from '@/components/WeatherProvider';
import WeatherSettings from '@/components/WeatherSettings';

export default function Home() {
  return (
    <WeatherProvider>
      <WeatherSettings />
    </WeatherProvider>
  );
}
