/**
 * i18n Configuration — react-i18next
 *
 * Supports three languages: English (en), Somali (so), Arabic (ar).
 * Translations are loaded from JSON files in the locales directory.
 *
 * Usage:
 *   import { useTranslation } from 'react-i18next';
 *   const { t } = useTranslation('common');
 *   <h1>{t('welcome')}</h1>
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// English
import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enLanding from './locales/en/landing.json';

// Somali
import soCommon from './locales/so/common.json';
import soAuth from './locales/so/auth.json';
import soLanding from './locales/so/landing.json';

// Arabic
import arCommon from './locales/ar/common.json';
import arAuth from './locales/ar/auth.json';
import arLanding from './locales/ar/landing.json';

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

const resources = {
  en: { common: enCommon, auth: enAuth, landing: enLanding },
  so: { common: soCommon, auth: soAuth, landing: soLanding },
  ar: { common: arCommon, auth: arAuth, landing: arLanding },
};

// ---------------------------------------------------------------------------
// Initialize i18next
// ---------------------------------------------------------------------------

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'so', 'ar'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'masjid-language',
      caches: ['localStorage'],
    },
  });

export default i18n;