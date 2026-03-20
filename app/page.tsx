import { I18nProvider } from '@/components/i18n';
import { WeatherProvider } from '@/components/WeatherProvider';
import WeatherSettings from '@/components/WeatherSettings';

export default function Home() {
  return (
    <I18nProvider>
      <WeatherProvider>
        <WeatherSettings />
      </WeatherProvider>
    </I18nProvider>
  );
}
