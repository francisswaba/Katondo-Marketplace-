'use client';

import { useEffect, useMemo, useState } from 'react';
import type { User } from 'oidc-client-ts';
import {
  displayStyles,
  getProductType,
  productTypes,
  storefrontLayouts,
  type Category,
  type DisplayStyle,
  type Listing,
  type MarketConfiguration,
  type ProductType,
  type StorefrontLayout,
} from '@katondo/contracts';
import ListingCard from '../../../components/ListingCard';
import PatternArt from '../../../components/PatternArt';
import { apiUrl } from '../../../lib/catalogue';
import { getUserManager, isCurrentUser } from '../../../lib/oidc';

const steps = ['What you’re selling', 'Details', 'How it looks', 'Review'] as const;

const categoryForType: Partial<Record<ProductType, string>> = {
  fashion: 'fashion', electronics: 'electronics', vehicles: 'vehicles', property: 'property',
  home: 'home-living', food: 'food-groceries', agriculture: 'farm-agriculture', handmade: 'art-handmade', services: 'services',
};

async function readError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return payload?.error || 'Something went wrong. Try again.';
}

export default function ListingStudio({ market, categories }: { market: MarketConfiguration; categories: Category[] }) {
  const [step, setStep] = useState(0);
  const [productType, setProductType] = useState<ProductType | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [condition, setCondition] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>('classic');
  const [shopLayout, setShopLayout] = useState<StorefrontLayout>('grid');
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'error' | 'success'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const type = productType ? getProductType(productType) : null;

  useEffect(() => {
    getUserManager()?.getUser().then((current) => setUser(isCurrentUser(current) ? current : null)).catch(() => setUser(null));
  }, []);

  function chooseType(id: ProductType) {
    const next = getProductType(id);
    setProductType(id);
    setDisplayStyle(next.suggestedStyles[0]);
    setCondition(next.conditions[0]);
    setAttributes({});
    const slug = categoryForType[id];
    const match = categories.find((category) => category.slug === slug);
    setCategoryId(match?.id ?? categories[0]?.id ?? '');
    setStep(1);
  }

  const priceMinor = Math.round(Number(price.replace(/[^\d.]/g, '')) * 100) || 0;
  const detailsComplete = title.trim().length >= 3 && description.trim().length >= 10 && priceMinor > 0 && Boolean(condition);

  const preview: Listing = useMemo(() => ({
    id: 'preview',
    title: title.trim() || (type ? `Your ${type.label.split(' ')[0].toLowerCase()} listing` : 'Your listing'),
    description,
    priceMinor,
    currency: market.currency,
    condition: condition || 'new',
    categoryId,
    categoryName: categories.find((category) => category.id === categoryId)?.name ?? type?.label ?? '',
    sellerId: null,
    sellerName: 'Your shop',
    quantity: Number(quantity) || 1,
    productType: productType ?? 'general',
    displayStyle,
    attributes,
    media: [],
    createdAt: new Date().toISOString(),
  }), [title, description, priceMinor, market.currency, condition, categoryId, categories, type, quantity, productType, displayStyle, attributes]);

  async function save(publish: boolean) {
    setMessage(null);
    if (!user?.access_token) {
      setMessage({ tone: 'info', text: 'Sign in as a seller to save this listing. Seller sign-in opens once account approvals are complete; until then this studio works as a preview.' });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${apiUrl}/api/seller/listings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, description, priceMinor, quantity: Number(quantity), condition, categoryId,
          productType, displayStyle, attributes, publish,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      await fetch(`${apiUrl}/api/seller/storefront`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${user.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: shopLayout }),
      });
      setMessage({ tone: 'success', text: publish ? 'Published. Your listing is live.' : 'Saved as a draft.' });
    } catch (error) {
      setMessage({ tone: 'error', text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="studio">
      <ol className="studio-steps">
        {steps.map((label, index) => (
          <li key={label} aria-current={index === step ? 'step' : undefined} className={index < step ? 'done' : undefined}>
            <button type="button" disabled={index > 0 && !productType || index > 1 && !detailsComplete} onClick={() => setStep(index)}>
              <span className="step-number">{index + 1}</span>{label}
            </button>
          </li>
        ))}
      </ol>

      <div className="studio-body">
        <div className="studio-panel">
          {step === 0 && (
            <section>
              <h2>What are you selling?</h2>
              <p className="studio-hint">This decides which details we ask for and the display styles we suggest.</p>
              <div className="type-grid">
                {productTypes.map((item) => (
                  <button key={item.id} type="button" className="type-tile" aria-pressed={productType === item.id} onClick={() => chooseType(item.id)}>
                    <span className="type-tile-art"><PatternArt type={item.id} label="" /></span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </button>
                ))}
              </div>
            </section>
          )}

          {step === 1 && type && (
            <section className="studio-form">
              <h2>Tell buyers about it</h2>
              <label>Title<input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder={type.id === 'vehicles' ? 'Toyota Hilux 2.8 double cab' : 'What is it?'} /></label>
              <label>Description<textarea value={description} maxLength={5000} rows={5} onChange={(event) => setDescription(event.target.value)} placeholder="Condition, what’s included, how to collect…" /></label>
              <div className="field-row">
                <label>Price ({market.currency})<input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" /></label>
                <label>Quantity<input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ''))} /></label>
              </div>
              <div className="field-row">
                <label>Condition
                  <select value={condition} onChange={(event) => setCondition(event.target.value)}>
                    {type.conditions.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}
                  </select>
                </label>
                <label>Category
                  <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    {!categories.length && <option value="">Categories couldn’t load</option>}
                  </select>
                </label>
              </div>
              {type.fields.length > 0 && <h3>{type.label} details</h3>}
              <div className="field-grid">
                {type.fields.map((field) => (
                  <label key={field.key}>{field.label}
                    {field.options
                      ? (
                        <select value={attributes[field.key] ?? ''} onChange={(event) => setAttributes({ ...attributes, [field.key]: event.target.value })}>
                          <option value="">Choose</option>
                          {field.options.map((option) => <option key={option}>{option}</option>)}
                        </select>
                      )
                      : <input value={attributes[field.key] ?? ''} maxLength={120} placeholder={field.placeholder} onChange={(event) => setAttributes({ ...attributes, [field.key]: event.target.value })} />}
                  </label>
                ))}
              </div>
              <p className="studio-hint">Photo and video uploads arrive with media storage. Until then, listings show artwork for their type.</p>
              <div className="studio-nav">
                <button type="button" className="button-quiet" onClick={() => setStep(0)}>Back</button>
                <button type="button" className="button-primary" disabled={!detailsComplete} onClick={() => setStep(2)}>Choose how it looks</button>
              </div>
              {!detailsComplete && <p className="studio-hint">Add a title, a description of at least 10 characters and a price to continue.</p>}
            </section>
          )}

          {step === 2 && type && (
            <section>
              <h2>How should buyers see it?</h2>
              <p className="studio-hint">Your choice changes the card in feeds and the layout of the listing page. You can change it later.</p>
              <div className="style-grid" role="radiogroup" aria-label="Display style">
                {displayStyles.map((style) => {
                  const suggested = type.suggestedStyles.includes(style.id);
                  return (
                    <button key={style.id} type="button" role="radio" aria-checked={displayStyle === style.id} className={`style-option style-${style.id}`} onClick={() => setDisplayStyle(style.id)}>
                      <span className="style-glyph" aria-hidden="true"><i /><i /><i /></span>
                      <strong>{style.label}{suggested && <em>Suggested</em>}</strong>
                      <small>{style.description}</small>
                    </button>
                  );
                })}
              </div>
              <h3>Your shop page</h3>
              <div className="layout-options" role="radiogroup" aria-label="Shop layout">
                {storefrontLayouts.map((layout) => (
                  <button key={layout.id} type="button" role="radio" aria-checked={shopLayout === layout.id} className={`layout-option layout-${layout.id}`} onClick={() => setShopLayout(layout.id)}>
                    <span className="layout-glyph" aria-hidden="true"><i /><i /><i /></span>
                    <strong>{layout.label}</strong>
                    <small>{layout.description}</small>
                  </button>
                ))}
              </div>
              <div className="studio-nav">
                <button type="button" className="button-quiet" onClick={() => setStep(1)}>Back</button>
                <button type="button" className="button-primary" onClick={() => setStep(3)}>Review listing</button>
              </div>
            </section>
          )}

          {step === 3 && type && (
            <section>
              <h2>Ready to go?</h2>
              <dl className="review-list">
                <div><dt>Type</dt><dd>{type.label}</dd></div>
                <div><dt>Display</dt><dd>{displayStyles.find((style) => style.id === displayStyle)?.label}</dd></div>
                <div><dt>Shop layout</dt><dd>{storefrontLayouts.find((layout) => layout.id === shopLayout)?.label}</dd></div>
                <div><dt>Price</dt><dd>{new Intl.NumberFormat(market.locale, { style: 'currency', currency: market.currency }).format(priceMinor / 100)}</dd></div>
              </dl>
              <p className="studio-hint">New sellers can save drafts straight away. Listings go live once your seller account is verified.</p>
              {message && <p className={`studio-message ${message.tone}`} role="status">{message.text}</p>}
              <div className="studio-nav">
                <button type="button" className="button-quiet" onClick={() => setStep(2)}>Back</button>
                <button type="button" className="button-quiet" disabled={saving} onClick={() => save(false)}>Save draft</button>
                <button type="button" className="button-primary" disabled={saving} onClick={() => save(true)}>{saving ? 'Publishing…' : 'Publish'}</button>
              </div>
            </section>
          )}
        </div>

        <aside className="studio-preview" aria-label="Live preview">
          <p>Preview</p>
          <div className={`preview-frame preview-${displayStyle}`}>
            {productType
              ? <ListingCard listing={preview} locale={market.locale} linked={false} />
              : <div className="preview-empty">Choose a product type to see your listing take shape.</div>}
          </div>
        </aside>
      </div>
    </div>
  );
}
