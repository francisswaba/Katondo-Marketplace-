import type { MarketConfiguration } from '@katondo/contracts';

export function fallbackMarket(): MarketConfiguration {
  const countryCode = process.env.DEPLOYMENT_COUNTRY || process.env.NEXT_PUBLIC_DEPLOYMENT_COUNTRY || 'ZM';
  const currency = process.env.DEFAULT_CURRENCY || process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || 'ZMW';
  const locale = process.env.DEFAULT_LOCALE || process.env.NEXT_PUBLIC_DEFAULT_LOCALE || (countryCode === 'ZM' ? 'en-ZM' : 'en');
  const countryName = process.env.DEPLOYMENT_COUNTRY_NAME
    || process.env.NEXT_PUBLIC_DEPLOYMENT_COUNTRY_NAME
    || new Intl.DisplayNames([locale, 'en'], { type: 'region' }).of(countryCode)
    || countryCode;
  return { countryCode, countryName, currency, locale, supportedLocales: [locale, 'en'] };
}

export function formatMoney(priceMinor: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(priceMinor / 100);
}
