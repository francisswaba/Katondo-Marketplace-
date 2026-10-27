export type Category = {
  id: string;
  name: string;
  slug: string;
};

export type Listing = {
  id: string;
  title: string;
  description: string;
  priceMinor: number;
  currency: string;
  condition: string;
  categoryId: string;
  categoryName: string;
  sellerName: string;
  quantity: number;
};

export type MarketConfiguration = {
  countryCode: string;
  countryName: string;
  currency: string;
  locale: string;
  supportedLocales: string[];
};

export type CatalogueResponse = {
  market: MarketConfiguration;
  categories: Category[];
  listings: Listing[];
};
