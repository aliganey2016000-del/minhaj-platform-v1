/**
 * Website configuration for an organization/tenant.
 *
 * Draft and published snapshots are intentionally stored separately so an
 * administrator can redesign the landing site without changing the live site
 * until Publish is pressed.
 */
import mongoose, { Document, Schema } from 'mongoose';

export type WebsiteSectionType =
  | 'hero'
  | 'about'
  | 'services'
  | 'programs'
  | 'stats'
  | 'gallery'
  | 'video'
  | 'testimonials'
  | 'faq'
  | 'contact'
  | 'custom';

export interface WebsiteLink {
  id: string;
  label: string;
  href: string;
  visible: boolean;
}

export interface WebsiteCard {
  id: string;
  title: string;
  text: string;
  value?: string;
  icon?: string;
  imageUrl?: string;
  link?: string;
  question?: string;
  answer?: string;
}

export interface WebsiteSection {
  id: string;
  type: WebsiteSectionType;
  title: string;
  subtitle: string;
  body: string;
  imageUrl: string;
  videoUrl: string;
  icon: string;
  buttonText: string;
  buttonUrl: string;
  background: 'default' | 'muted' | 'primary' | 'dark';
  alignment: 'left' | 'center';
  visible: boolean;
  cards: WebsiteCard[];
}

export interface WebsitePage {
  id: string;
  title: string;
  slug: string;
  showInNavigation: boolean;
  seoTitle: string;
  seoDescription: string;
  sections: WebsiteSection[];
}

export interface WebsiteMediaItem {
  id: string;
  name: string;
  type: 'image' | 'video' | 'document';
  url: string;
  alt: string;
  storageKey?: string;
  storageProvider?: 'r2' | 'local';
  mimeType?: string;
  size?: number;
}

export interface WebsiteLanguage {
  code: string;
  label: string;
  direction: 'ltr' | 'rtl';
  enabled: boolean;
}

export interface WebsiteSiteDocument {
  header: {
    logoUrl: string;
    showOrganizationName: boolean;
    sticky: boolean;
    navItems: WebsiteLink[];
    ctaText: string;
    ctaUrl: string;
  };
  pages: WebsitePage[];
  footer: {
    description: string;
    address: string;
    phone: string;
    email: string;
    quickLinks: WebsiteLink[];
    socials: WebsiteLink[];
    copyright: string;
  };
  theme: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    fontFamily: string;
    buttonStyle: 'rounded' | 'pill' | 'square';
    cardStyle: 'soft' | 'bordered' | 'flat';
  };
  seo: {
    siteTitle: string;
    description: string;
    keywords: string;
    ogImage: string;
  };
  settings: {
    contactFormEnabled: boolean;
    analyticsEnabled: boolean;
  };
  defaultLanguage: string;
  languages: WebsiteLanguage[];
  translations: Record<string, Record<string, string>>;
  media: WebsiteMediaItem[];
}

export interface IWebsiteConfig extends Document {
  _id: mongoose.Types.ObjectId;
  school: mongoose.Types.ObjectId;
  draft: WebsiteSiteDocument;
  published?: WebsiteSiteDocument | null;
  isPublished: boolean;
  version: number;
  updatedBy: mongoose.Types.ObjectId;
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const websiteConfigSchema = new Schema<IWebsiteConfig>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, unique: true, index: true },
    draft: { type: Schema.Types.Mixed, required: true },
    published: { type: Schema.Types.Mixed, default: null },
    isPublished: { type: Boolean, default: false, index: true },
    version: { type: Number, default: 1, min: 1 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    publishedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc: any, ret: any) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

export default mongoose.model<IWebsiteConfig>('WebsiteConfig', websiteConfigSchema);
