import { WebsiteSiteDocument } from '../models/website-config.model';

export function buildDefaultSite(school: any): WebsiteSiteDocument {
  const primary = school.branding?.themeColor || '#0d9488';
  return {
    header: {
      displayName: '',
      logoUrl: '',
      showOrganizationName: true,
      sticky: true,
      navItems: [
        { id: 'nav-home', label: 'Home', href: '/', visible: true },
        { id: 'nav-about', label: 'About', href: '/#about', visible: true },
        { id: 'nav-programs', label: 'Programs', href: '/#programs', visible: true },
        { id: 'nav-news', label: 'News', href: '/#news', visible: false },
        { id: 'nav-contact', label: 'Contact', href: '/#contact', visible: true },
      ],
      ctaText: 'Portal Login',
      ctaUrl: '/auth/login',
    },
    pages: [{
      id: 'page-home',
      title: 'Home',
      slug: '',
      showInNavigation: true,
      seoTitle: school.name,
      seoDescription: `Welcome to ${school.name}.`,
      sections: [
        {
          id: 'hero', type: 'hero', title: school.name,
          subtitle: 'Learning, growth and opportunity in one connected community.',
          body: 'Build knowledge, develop skills and stay connected with our institution.',
          imageUrl: '', videoUrl: '', icon: 'GraduationCap',
          buttonText: 'Explore Programs', buttonUrl: '/#programs',
          background: 'default', alignment: 'left', visible: true, cards: [],
        },
        {
          id: 'about', type: 'about', title: 'About Us',
          subtitle: 'A learning community built for student success.',
          body: `${school.name} is committed to quality education, strong values and meaningful student development.`,
          imageUrl: '', videoUrl: '', icon: 'Building2', buttonText: '', buttonUrl: '',
          background: 'muted', alignment: 'left', visible: true, cards: [],
        },
        {
          id: 'programs', type: 'programs', title: 'Our Programs',
          subtitle: 'Discover opportunities designed for every learner.',
          body: '', imageUrl: '', videoUrl: '', icon: 'BookOpen', buttonText: '', buttonUrl: '',
          background: 'default', alignment: 'center', visible: true,
          cards: [
            { id: 'program-1', title: 'Quality Learning', text: 'Structured learning experiences with clear outcomes.', icon: 'BookOpen' },
            { id: 'program-2', title: 'Student Support', text: 'A supportive environment focused on progress and wellbeing.', icon: 'Users' },
            { id: 'program-3', title: 'Future Ready', text: 'Skills and knowledge that prepare learners for what comes next.', icon: 'Award' },
          ],
        },
        ...[
          { id: 'values', type: 'services', title: 'Our Mission, Vision & Values', background: 'muted', cards: [
            { id: 'mission', title: 'Our Mission', text: 'Add your institution’s mission.', icon: 'BookOpen' },
            { id: 'vision', title: 'Our Vision', text: 'Add your institution’s vision.', icon: 'Award' },
            { id: 'values-card', title: 'Our Values', text: 'Add the values that guide your community.', icon: 'Heart' },
          ] },
          { id: 'news', type: 'news', title: 'News & Events' },
          { id: 'gallery', type: 'gallery', title: 'Life at Our Institution', background: 'muted' },
          { id: 'staff', type: 'staff', title: 'Our Team' },
          { id: 'partners', type: 'partners', title: 'Our Partners', background: 'muted' },
          { id: 'testimonials', type: 'testimonials', title: 'Our Community' },
          { id: 'video', type: 'video', title: 'Discover Our Institution', background: 'muted' },
          { id: 'faq', type: 'faq', title: 'Frequently Asked Questions' },
        ].map((section) => ({
          subtitle: '', body: '', imageUrl: '', videoUrl: '', icon: 'BookOpen',
          buttonText: '', buttonUrl: '', alignment: 'center' as const,
          background: 'default' as const, cards: [], ...section, visible: false,
        })) as WebsiteSiteDocument['pages'][number]['sections'],
        {
          id: 'contact', type: 'contact', title: 'Contact Us',
          subtitle: 'We would be happy to hear from you.',
          body: '', imageUrl: '', videoUrl: '', icon: 'Mail', buttonText: '', buttonUrl: '',
          background: 'dark', alignment: 'left', visible: true, cards: [],
        },
      ],
    }],
    footer: {
      description: `Official website of ${school.name}.`,
      address: school.address || '',
      phone: school.phone || '',
      email: school.email || '',
      quickLinks: [
        { id: 'footer-home', label: 'Home', href: '/', visible: true },
        { id: 'footer-login', label: 'Portal Login', href: '/auth/login', visible: true },
      ],
      socials: [],
      copyright: `© ${new Date().getFullYear()} ${school.name}. All rights reserved.`,
    },
    theme: {
      primaryColor: primary,
      secondaryColor: '#0f172a',
      accentColor: '#f59e0b',
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      buttonStyle: 'rounded',
      cardStyle: 'soft',
    },
    seo: {
      siteTitle: school.name,
      description: `${school.name} official website`,
      keywords: 'education, learning, students',
      ogImage: school.branding?.logo || '',
    },
    settings: { contactFormEnabled: true, analyticsEnabled: true },
    defaultLanguage: 'en',
    languages: [
      { code: 'en', label: 'English', direction: 'ltr', enabled: true },
      { code: 'so', label: 'Somali', direction: 'ltr', enabled: false },
      { code: 'ar', label: 'العربية', direction: 'rtl', enabled: false },
    ],
    translations: {},
    media: [],
  };
}

