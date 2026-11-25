import BrandMark from '../components/BrandMark';

/** Shown while a page loads: the logo with its live dot pulsing. */
export default function Loading() {
  return (
    <main className="page-loading" aria-busy="true">
      <BrandMark size={72} className="brand-mark loading-mark" live />
      <span className="visually-hidden">Loading</span>
    </main>
  );
}
