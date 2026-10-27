import type { MarketConfiguration } from '@katondo/contracts';

const countryPattern = /^[A-Z]{2}$/;
const currencyPattern = /^[A-Z]{3}$/;
const localePattern = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;

function configuredCode(value: string | undefined, fallback: string, pattern: RegExp) {
  const normalized = (value || fallback).trim();
  return pattern.test(normalized) ? normalized : fallback;
}

function configuredLocales(defaultLocale: string) {
  const locales = (process.env.SUPPORTED_LOCALES || `${defaultLocale},en`)
    .split(',')
    .map((locale) => locale.trim())
    .filter((locale) => localePattern.test(locale));
  return [...new Set([defaultLocale, ...locales])];
}

export function getMarketConfiguration(): MarketConfiguration {
  const countryCode = configuredCode(process.env.DEPLOYMENT_COUNTRY, 'ZM', countryPattern);
  const currency = configuredCode(process.env.DEFAULT_CURRENCY, 'ZMW', currencyPattern);
  const locale = configuredCode(process.env.DEFAULT_LOCALE, countryCode === 'ZM' ? 'en-ZM' : 'en', localePattern);
  const displayNames = new Intl.DisplayNames([locale, 'en'], { type: 'region' });
  return {
    countryCode,
    countryName: process.env.DEPLOYMENT_COUNTRY_NAME?.trim() || displayNames.of(countryCode) || countryCode,
    currency,
    locale,
    supportedLocales: configuredLocales(locale),
  };
}
