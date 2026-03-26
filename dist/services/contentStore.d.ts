export declare const ALLOWED_CONTENT_SLUGS: readonly ["contact", "terms", "refunds", "shipping"];
export type ContentSlug = (typeof ALLOWED_CONTENT_SLUGS)[number];
export type SiteContentEntry = {
    title: string;
    body: string;
    updated_at: string;
};
export type SiteContentMap = Record<ContentSlug, SiteContentEntry>;
export declare const readSiteContent: () => Promise<SiteContentMap>;
export declare const writeSiteContent: (content: SiteContentMap) => Promise<void>;
export declare const readSiteContentEntry: (slug: string) => Promise<SiteContentEntry | null>;
export declare const updateSiteContentEntry: (slug: string, payload: {
    title?: string;
    body?: string;
}) => Promise<SiteContentEntry | null>;
//# sourceMappingURL=contentStore.d.ts.map