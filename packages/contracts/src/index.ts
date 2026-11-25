export type Category = {
  id: string;
  name: string;
  slug: string;
};

/** What the seller is selling. Drives the details form and suggested display styles. */
export type ProductType =
  | 'fashion'
  | 'electronics'
  | 'vehicles'
  | 'property'
  | 'home'
  | 'food'
  | 'agriculture'
  | 'handmade'
  | 'services'
  | 'general';

/** How a listing is presented in feeds and on its own page. Chosen by the seller. */
export type DisplayStyle = 'classic' | 'gallery' | 'spotlight' | 'video' | 'spec' | 'compact';

/** How a seller's shop page arranges their listings. */
export type StorefrontLayout = 'grid' | 'editorial' | 'list';

export type ListingAttributes = Record<string, string>;

export type AttributeField = {
  key: string;
  label: string;
  placeholder?: string;
  options?: string[];
  /** Shown on spec-style cards when filled in. */
  highlight?: boolean;
};

export type ProductTypeDefinition = {
  id: ProductType;
  label: string;
  description: string;
  fields: AttributeField[];
  suggestedStyles: DisplayStyle[];
  conditions: string[];
};

export type DisplayStyleDefinition = {
  id: DisplayStyle;
  label: string;
  description: string;
  bestFor: string;
};

export type StorefrontLayoutDefinition = {
  id: StorefrontLayout;
  label: string;
  description: string;
};

const usedConditions = ['new', 'like new', 'used', 'for parts'];

export const productTypes: ProductTypeDefinition[] = [
  {
    id: 'fashion',
    label: 'Clothing, shoes and beauty',
    description: 'Outfits, chitenge, shoes, bags, jewellery and beauty products.',
    fields: [
      { key: 'size', label: 'Size', placeholder: 'M, 42, 10…', highlight: true },
      { key: 'colour', label: 'Colour', placeholder: 'Navy blue', highlight: true },
      { key: 'brand', label: 'Brand or maker', placeholder: 'Optional' },
    ],
    suggestedStyles: ['gallery', 'video', 'classic'],
    conditions: ['new', 'like new', 'used'],
  },
  {
    id: 'electronics',
    label: 'Phones and electronics',
    description: 'Phones, laptops, TVs, solar kits, speakers and accessories.',
    fields: [
      { key: 'brand', label: 'Brand', placeholder: 'Samsung', highlight: true },
      { key: 'model', label: 'Model', placeholder: 'Galaxy A56', highlight: true },
      { key: 'storage', label: 'Storage or capacity', placeholder: '256 GB', highlight: true },
      { key: 'warranty', label: 'Warranty', placeholder: '6 months', highlight: true },
    ],
    suggestedStyles: ['spec', 'classic', 'gallery'],
    conditions: usedConditions,
  },
  {
    id: 'vehicles',
    label: 'Cars and vehicles',
    description: 'Cars, motorbikes, trucks, parts and tyres.',
    fields: [
      { key: 'make', label: 'Make', placeholder: 'Toyota', highlight: true },
      { key: 'model', label: 'Model', placeholder: 'Hilux', highlight: true },
      { key: 'year', label: 'Year', placeholder: '2019', highlight: true },
      { key: 'mileage', label: 'Mileage (km)', placeholder: '84,000', highlight: true },
      { key: 'transmission', label: 'Transmission', options: ['Manual', 'Automatic'] },
      { key: 'fuel', label: 'Fuel', options: ['Petrol', 'Diesel', 'Hybrid', 'Electric'] },
    ],
    suggestedStyles: ['spotlight', 'spec', 'gallery'],
    conditions: ['new', 'used', 'for parts'],
  },
  {
    id: 'property',
    label: 'Houses and property',
    description: 'Homes and land for sale or rent, offices and shops.',
    fields: [
      { key: 'offer', label: 'For sale or rent', options: ['For sale', 'For rent'], highlight: true },
      { key: 'bedrooms', label: 'Bedrooms', placeholder: '3', highlight: true },
      { key: 'bathrooms', label: 'Bathrooms', placeholder: '2' },
      { key: 'area', label: 'Size (m²)', placeholder: '450', highlight: true },
      { key: 'location', label: 'Area', placeholder: 'Ibex Hill, Lusaka', highlight: true },
    ],
    suggestedStyles: ['spotlight', 'gallery', 'spec'],
    conditions: ['new', 'used'],
  },
  {
    id: 'home',
    label: 'Home and furniture',
    description: 'Furniture, kitchenware, appliances and décor.',
    fields: [
      { key: 'material', label: 'Material', placeholder: 'Mukwa wood', highlight: true },
      { key: 'dimensions', label: 'Dimensions', placeholder: '180 × 90 cm', highlight: true },
      { key: 'brand', label: 'Brand or maker', placeholder: 'Optional' },
    ],
    suggestedStyles: ['gallery', 'classic', 'spotlight'],
    conditions: usedConditions,
  },
  {
    id: 'food',
    label: 'Food and groceries',
    description: 'Groceries, drinks, baked goods and ready meals.',
    fields: [
      { key: 'unit', label: 'Sold per', placeholder: 'kg, pack, crate', highlight: true },
      { key: 'bestBefore', label: 'Best before', placeholder: 'Optional' },
    ],
    suggestedStyles: ['compact', 'classic'],
    conditions: ['new'],
  },
  {
    id: 'agriculture',
    label: 'Farm and agriculture',
    description: 'Produce, livestock, seed, fertiliser and farm equipment.',
    fields: [
      { key: 'unit', label: 'Sold per', placeholder: '50 kg bag, head, tonne', highlight: true },
      { key: 'available', label: 'Quantity available', placeholder: '40 bags', highlight: true },
      { key: 'location', label: 'Collection area', placeholder: 'Mkushi', highlight: true },
    ],
    suggestedStyles: ['compact', 'classic', 'spec'],
    conditions: ['new', 'used'],
  },
  {
    id: 'handmade',
    label: 'Art, crafts and handmade',
    description: 'Paintings, carvings, baskets, pottery and one-of-a-kind pieces.',
    fields: [
      { key: 'maker', label: 'Made by', placeholder: 'Artist or workshop', highlight: true },
      { key: 'materials', label: 'Materials', placeholder: 'Copper, kiaat', highlight: true },
      { key: 'dimensions', label: 'Dimensions', placeholder: 'Optional' },
    ],
    suggestedStyles: ['spotlight', 'video', 'gallery'],
    conditions: ['new', 'used'],
  },
  {
    id: 'services',
    label: 'Services',
    description: 'Repairs, tutoring, events, cleaning, transport and more.',
    fields: [
      { key: 'serviceArea', label: 'Where you work', placeholder: 'Lusaka and Chilanga', highlight: true },
      { key: 'duration', label: 'Typical duration', placeholder: '2 hours', highlight: true },
    ],
    suggestedStyles: ['classic', 'video'],
    conditions: ['new'],
  },
  {
    id: 'general',
    label: 'Something else',
    description: 'Anything that doesn’t fit the groups above.',
    fields: [],
    suggestedStyles: ['classic', 'gallery'],
    conditions: usedConditions,
  },
];

export const displayStyles: DisplayStyleDefinition[] = [
  { id: 'classic', label: 'Standard', description: 'A clean photo card with the title and price.', bestFor: 'Most items' },
  { id: 'gallery', label: 'Big photo', description: 'A large photo with your other photos in a strip.', bestFor: 'Fashion, furniture, anything that sells on looks' },
  { id: 'spotlight', label: 'Spotlight', description: 'A wide, dark feature card that stands out in the feed.', bestFor: 'Cars, property, art and premium pieces' },
  { id: 'video', label: 'Video first', description: 'A tall card that leads with your video.', bestFor: 'Items that need to be seen in action' },
  { id: 'spec', label: 'Key details', description: 'Puts the important details next to the photo.', bestFor: 'Phones, electronics, vehicles' },
  { id: 'compact', label: 'Quick list', description: 'A small row that fits many items on screen.', bestFor: 'Groceries, produce, bulk items' },
];

export const storefrontLayouts: StorefrontLayoutDefinition[] = [
  { id: 'grid', label: 'Grid', description: 'Every listing as a card, in even rows.' },
  { id: 'editorial', label: 'Feature first', description: 'Your newest listing big at the top, the rest below.' },
  { id: 'list', label: 'List', description: 'One listing per row, with details visible.' },
];

export const productTypeIds = productTypes.map((type) => type.id);
export const displayStyleIds = displayStyles.map((style) => style.id);
export const storefrontLayoutIds = storefrontLayouts.map((layout) => layout.id);

export function getProductType(id: string | undefined | null): ProductTypeDefinition {
  return productTypes.find((type) => type.id === id) ?? productTypes[productTypes.length - 1];
}

export function getDisplayStyle(id: string | undefined | null): DisplayStyleDefinition {
  return displayStyles.find((style) => style.id === id) ?? displayStyles[0];
}

export type ListingMedia = {
  type: 'image' | 'video';
  url: string;
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
  sellerId: string | null;
  sellerName: string;
  quantity: number;
  productType: ProductType;
  displayStyle: DisplayStyle;
  attributes: ListingAttributes;
  media: ListingMedia[];
  createdAt: string;
};

export type ListingDraft = {
  title: string;
  description: string;
  priceMinor: number;
  condition: string;
  categoryId: string;
  quantity: number;
  productType: ProductType;
  displayStyle: DisplayStyle;
  attributes: ListingAttributes;
};

export type Storefront = {
  id: string;
  displayName: string;
  sellerType: 'individual' | 'business' | 'platform';
  verificationStatus: string;
  layout: StorefrontLayout;
  tagline: string | null;
};

export type StorefrontResponse = {
  market: MarketConfiguration;
  storefront: Storefront;
  listings: Listing[];
};

export type ListingResponse = {
  market: MarketConfiguration;
  listing: Listing;
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

/* ---------- Reviews ---------- */

/** Days after an order completes during which either side can leave a review. */
export const reviewWindowDays = 14;
export const reviewCommentMaxLength = 1000;

export type ReviewAuthorRole = 'buyer' | 'seller';

export type RatingSummary = {
  average: number | null;
  count: number;
  /** Count of visible reviews per star, index 0 = 1 star. */
  distribution: [number, number, number, number, number];
};

export type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  listingTitle: string;
  createdAt: string;
  reply: string | null;
  repliedAt: string | null;
};

export type ShopReviewsResponse = {
  enabled: boolean;
  summary: RatingSummary;
  reviews: PublicReview[];
};

export type OrderReviewState = {
  enabled: boolean;
  orderId: string;
  role: ReviewAuthorRole;
  listingTitle: string;
  counterpartName: string;
  /** Whether this person can still submit their review. */
  canReview: boolean;
  /** Why they can't, when canReview is false. */
  reason: string | null;
  windowClosesAt: string | null;
  mine: (PublicReview & { visible: boolean }) | null;
  /** The other side's review, only once both have reviewed or the window has closed. */
  theirs: PublicReview | null;
  /** For sellers: the buyer's rating from sellers' reviews. */
  buyerRating: RatingSummary | null;
};

/* ---------- Messaging ---------- */

export const messageMaxLength = 2000;

/** Safety flags the API adds to a message; the recipient sees a warning for each. */
export type MessageFlag = 'phone_number' | 'email' | 'link' | 'off_platform_payment';

export const messageFlagWarnings: Record<MessageFlag, string> = {
  off_platform_payment: 'This message mentions paying outside Katondo. Pay through Katondo checkout so your money is protected.',
  phone_number: 'This message contains a phone number. Keep the conversation here so Katondo can help if something goes wrong.',
  email: 'This message contains an email address. Keep the conversation here so Katondo can help if something goes wrong.',
  link: 'This message contains a link. Don’t enter passwords or payment details on sites you reach from a message.',
};

export type ConversationRole = 'buyer' | 'seller';

export type ConversationSummary = {
  id: string;
  role: ConversationRole;
  listingId: string | null;
  listingTitle: string;
  counterpartName: string;
  lastMessage: string | null;
  lastMessageAt: string;
  unread: number;
};

export type ConversationMessage = {
  id: string;
  mine: boolean;
  body: string | null;
  removed: boolean;
  flags: MessageFlag[];
  createdAt: string;
};

export type ConversationDetail = ConversationSummary & {
  messages: ConversationMessage[];
  /** True when either side has blocked the other; nobody can send. */
  closed: boolean;
  blockedByMe: boolean;
};

export type FeatureFlags = { reviews: boolean; messaging: boolean; support: boolean };


/* ---------- Help and complaints ---------- */

export type SupportCategory =
  | 'order_problem' | 'report_listing' | 'report_shop' | 'report_review'
  | 'account' | 'seller_decision' | 'privacy_request' | 'other';
export type SupportStatus = 'received' | 'in_review' | 'waiting_on_requester' | 'resolved';
export type SupportPriority = 'urgent' | 'high' | 'normal' | 'low';
export type SupportReportReason = 'counterfeit' | 'prohibited' | 'scam' | 'misleading' | 'offensive' | 'other';
export type PrivacyRequestType = 'access' | 'correction' | 'deletion' | 'objection' | 'other';

export const supportCategories: Array<{ id: SupportCategory; label: string; description: string; subject?: 'listing' | 'seller' | 'review' | 'order' }> = [
  { id: 'order_problem', label: 'A problem with an order', description: 'Item not received, not as described, damaged, or a refund question.', subject: 'order' },
  { id: 'report_listing', label: 'Report a listing', description: 'Fake, banned, dangerous or misleading item.', subject: 'listing' },
  { id: 'report_shop', label: 'Report a shop', description: 'A seller you think is dishonest or breaking the rules.', subject: 'seller' },
  { id: 'report_review', label: 'Report a review', description: 'A review that is false, abusive or shares private details.', subject: 'review' },
  { id: 'account', label: 'My account', description: 'Signing in, account settings or a restriction on your account.' },
  { id: 'seller_decision', label: 'A decision about my shop', description: 'Seller application, removed listing or a shop restriction you disagree with.' },
  { id: 'privacy_request', label: 'My personal data', description: 'See, correct or delete the information Katondo holds about you.' },
  { id: 'other', label: 'Something else', description: 'Anything not listed here, including a complaint about Katondo.' },
];

export const supportReportReasons: Array<{ id: SupportReportReason; label: string }> = [
  { id: 'counterfeit', label: 'Fake or counterfeit' },
  { id: 'prohibited', label: 'Banned or dangerous item' },
  { id: 'scam', label: 'Scam or fraud' },
  { id: 'misleading', label: 'Misleading description or price' },
  { id: 'offensive', label: 'Offensive or abusive' },
  { id: 'other', label: 'Something else' },
];

export const privacyRequestTypes: Array<{ id: PrivacyRequestType; label: string }> = [
  { id: 'access', label: 'Get a copy of my data' },
  { id: 'correction', label: 'Correct my data' },
  { id: 'deletion', label: 'Delete my data' },
  { id: 'objection', label: 'Stop or limit how my data is used' },
  { id: 'other', label: 'Another privacy question' },
];

export const supportStatusLabels: Record<SupportStatus, string> = {
  received: 'Received',
  in_review: 'Being looked at',
  waiting_on_requester: 'Waiting for your reply',
  resolved: 'Resolved',
};

/** Days after a decision during which the requester can ask for it to be looked at again. */
export const supportAppealWindowDays = 30;
export const supportSummaryMaxLength = 140;
export const supportMessageMaxLength = 4000;

export type SupportCaseSummary = {
  reference: string;
  category: SupportCategory;
  summary: string;
  status: SupportStatus;
  createdAt: string;
  updatedAt: string;
  /** Staff replies the requester hasn't read yet. */
  unread: number;
  isAppeal: boolean;
};

export type SupportCaseMessage = {
  id: string;
  author: 'you' | 'katondo' | 'system';
  body: string;
  createdAt: string;
};

export type SupportCaseDetail = SupportCaseSummary & {
  subjectLabel: string | null;
  reportReason: SupportReportReason | null;
  privacyRequestType: PrivacyRequestType | null;
  resolution: string | null;
  resolvedAt: string | null;
  messages: SupportCaseMessage[];
  canReply: boolean;
  canAppeal: boolean;
  appealReference: string | null;
  appealOfReference: string | null;
};
