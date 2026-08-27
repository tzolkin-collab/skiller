import 'server-only';

const dictionaries = {
  en: () => import('./dictionaries/en.json').then((module) => module.default),
  pt: () => import('./dictionaries/pt.json').then((module) => module.default),
};

export type Locale = keyof typeof dictionaries;

export const DEFAULT_LOCALE: Locale = 'en';

export const isLocale = (value: string): value is Locale => value in dictionaries;

/**
 * Falls back to English instead of throwing. The middleware should never route
 * an unsupported locale here, but an unchecked `dictionaries[locale]()` turns
 * any gap in that assumption into a 500.
 */
export const getDictionary = async (locale: string) =>
  dictionaries[isLocale(locale) ? locale : DEFAULT_LOCALE]();

// Force HMR reload

