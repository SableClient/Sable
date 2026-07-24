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
  // i18next-http-backend
  // loads translations from your server
  // https://github.com/i18next/i18next-http-backend
  .use(Backend)
  // detect user language
  // learn more: https://github.com/i18next/i18next-browser-languageDetector
  .use(LanguageDetector)
  // pass the i18n instance to react-i18next.
  .use(initReactI18next)
  // init i18next
  // for all options read: https://www.i18next.com/overview/configuration-options
  .init<HttpBackendOptions>({
    defaultNS: 'general',
    fallbackLng: 'en',
    load: 'languageOnly',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['querystring', 'localStorage', 'navigator', 'htmlTag', 'path', 'subdomain'],
      lookupQuerystring: 'lng',
      caches: ['localStorage'],
    },
    backend: {
      loadPath: `${trimTrailingSlash(import.meta.env.BASE_URL)}/public/locales/{{lng}}/{{ns}}.json`,
      alternateFetch: (url: string) => {
        const lng = langFromUrl(url);
        if (!lng) return undefined;
        return takePreloadedLocale(lng) ?? undefined;
      },
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
