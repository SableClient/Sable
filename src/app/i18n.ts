import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import type { HttpBackendOptions } from 'i18next-http-backend';
import Backend from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';
import { trimTrailingSlash } from './utils/common';
import { takePreloadedLocale } from './utils/preload';

const langFromUrl = (url: string): string | undefined => {
  const match = url.match(/\/public\/locales\/([^/]+)\.json/);
  return match?.[1];
};

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init<HttpBackendOptions>({
    debug: false,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    load: 'languageOnly',
    backend: {
      loadPath: `${trimTrailingSlash(import.meta.env.BASE_URL)}/public/locales/{{lng}}.json`,
      alternateFetch: (url: string) => {
        const lng = langFromUrl(url);
        if (!lng) return undefined;
        return takePreloadedLocale(lng) ?? undefined;
      },
    },
  });

export default i18n;
