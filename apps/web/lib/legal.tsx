import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';

/** Reads a document from docs/legal at build time. The markdown there is the single source. */
export function readLegalDocument(file: 'PRIVACY_NOTICE.md' | 'TERMS_OF_USE.md' | 'SELLER_TERMS.md') {
  const candidates = [
    path.join(process.cwd(), '..', '..', 'docs', 'legal', file),
    path.join(process.cwd(), 'docs', 'legal', file),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Legal document ${file} not found`);
  return readFileSync(found, 'utf8');
}

function inline(text: string, keyBase: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={`${keyBase}-${index}`}>{part.slice(2, -2)}</strong>
      : part);
}

/** Renders the small markdown subset the legal documents use: headings, paragraphs, bullet lists, bold. */
export function LegalDocument({ source }: { source: string }) {
  const blocks = source.trim().split(/\n\s*\n/);
  const [titleBlock, versionBlock, ...rest] = blocks;
  return (
    <article className="legal-doc">
      <h1>{titleBlock.replace(/^#\s+/, '')}</h1>
      <p className="legal-version">{versionBlock}</p>
      {rest.map((block, index) => {
        const key = `b${index}`;
        if (block.startsWith('## ')) {
          const heading = block.replace(/^##\s+/, '');
          return <h2 key={key} id={heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}>{heading}</h2>;
        }
        const lines = block.split('\n');
        if (lines.every((line) => line.startsWith('- '))) {
          return <ul key={key}>{lines.map((line, item) => <li key={item}>{inline(line.slice(2), `${key}-${item}`)}</li>)}</ul>;
        }
        return <p key={key}>{inline(lines.join(' '), key)}</p>;
      })}
    </article>
  );
}
