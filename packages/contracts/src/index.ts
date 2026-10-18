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

export type CatalogueResponse = {
  categories: Category[];
  listings: Listing[];
};
