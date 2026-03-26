import { promises as fs } from 'fs';
import path from 'path';

export const ALLOWED_CONTENT_SLUGS = ['contact', 'terms', 'refunds', 'shipping'] as const;
export type ContentSlug = (typeof ALLOWED_CONTENT_SLUGS)[number];

export type SiteContentEntry = {
  title: string;
  body: string;
  updated_at: string;
};

export type SiteContentMap = Record<ContentSlug, SiteContentEntry>;

const CONTENT_PATH = path.join(process.cwd(), 'data', 'site-content.json');

const isValidSlug = (slug: string): slug is ContentSlug =>
  ALLOWED_CONTENT_SLUGS.includes(slug as ContentSlug);

const isValidEntry = (value: unknown): value is SiteContentEntry => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.title === 'string' && typeof v.body === 'string' && typeof v.updated_at === 'string';
};

const toSafeContent = (value: unknown): SiteContentMap => {
  const fallbackEntry = {
    title: '',
    body: '',
    updated_at: new Date().toISOString(),
  };

  const defaults: SiteContentMap = {
    contact: { ...fallbackEntry, title: 'Contact Us' },
    terms: { ...fallbackEntry, title: 'Terms and Conditions' },
    refunds: { ...fallbackEntry, title: 'Refunds and Cancellation Policy' },
    shipping: { ...fallbackEntry, title: 'Shipping Policy' },
  };

  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
  const obj = value as Record<string, unknown>;

  for (const slug of ALLOWED_CONTENT_SLUGS) {
    if (isValidEntry(obj[slug])) {
      defaults[slug] = obj[slug];
    }
  }

  return defaults;
};

export const readSiteContent = async (): Promise<SiteContentMap> => {
  const raw = await fs.readFile(CONTENT_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return toSafeContent(parsed);
};

export const writeSiteContent = async (content: SiteContentMap): Promise<void> => {
  const dir = path.dirname(CONTENT_PATH);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(CONTENT_PATH, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
};

export const readSiteContentEntry = async (slug: string): Promise<SiteContentEntry | null> => {
  if (!isValidSlug(slug)) return null;
  const content = await readSiteContent();
  return content[slug];
};

export const updateSiteContentEntry = async (
  slug: string,
  payload: { title?: string; body?: string },
): Promise<SiteContentEntry | null> => {
  if (!isValidSlug(slug)) return null;
  const content = await readSiteContent();
  const existing = content[slug];
  const next: SiteContentEntry = {
    title: typeof payload.title === 'string' ? payload.title : existing.title,
    body: typeof payload.body === 'string' ? payload.body : existing.body,
    updated_at: new Date().toISOString(),
  };
  content[slug] = next;
  await writeSiteContent(content);
  return next;
};

