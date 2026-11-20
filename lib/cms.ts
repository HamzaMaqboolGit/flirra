export type CmsContent = {
  hero: { badge: string; heading: string; highlight: string; description: string; image: string; imageAlt: string; ctaText: string; ctaHref: string };
  sections: {
    discover: { visible: boolean; heading: string; description: string; ctaText: string };
    coins: { visible: boolean; heading: string; description: string; artwork: string[] };
    safety: { visible: boolean; heading: string; description: string; features: { title: string; description: string; icon: 'privacy'|'report'|'verification'|'adults' }[] };
  };
  footer: { description: string; links: { label: string; href: string }[]; social: { label: string; href: string }[] };
  navigation: { label: string; href: string }[];
  seo: { title: string; description: string };
};

export const defaultCmsContent: CmsContent = {
  hero: {
    badge: 'Live Video Dating',
    heading: 'Meet Hot & Sexy\nPeople on',
    highlight: 'Live Video Chat.',
    description: 'Connect, flirt, and video chat with real and attractive people from around the world.',
    image: '/velora-landing/hero/live-video-dating-carousel.png',
    imageAlt: 'Flirra live video dating carousel',
    ctaText: 'Start Video Chat Free',
    ctaHref: '/dashboard',
  },
  sections: {
    discover: { visible: true, heading: 'Meet people who make the moment.', description: 'Browse public member profiles and find someone you would enjoy talking with.', ctaText: 'View all profiles' },
    coins: { visible: true, heading: 'Get More with Coins', description: 'Top up when you need more time to keep a conversation going.', artwork: [] },
    safety: { visible: true, heading: 'A Safe & Respectful Community', description: 'We build a friendly and secure space for real conversations.', features: [{ title: 'Privacy', description: 'Email and birthday are kept private.', icon: 'privacy' }, { title: 'Report & block', description: 'Manage unwanted contact in a call.', icon: 'report' }, { title: 'Account verification', description: 'Verified email is required for discovery.', icon: 'verification' }, { title: 'Adults only', description: 'Members must be 18 or older.', icon: 'adults' }] },
  },
  footer: { description: 'A modern video dating platform to meet, chat and connect with real people worldwide.', links: [{ label: 'Home', href: '#top' }, { label: 'Discover', href: '#discover' }, { label: 'How It Works', href: '#how-it-works' }, { label: 'Pricing', href: '#coins' }, { label: 'Safety', href: '#safety' }, { label: 'Privacy Policy', href: '/privacy' }, { label: 'Terms of Service', href: '/terms' }], social: [] },
  navigation: [{ label: 'Home', href: '#hero' }, { label: 'Discover', href: '#discover' }, { label: 'How It Works', href: '#how-it-works' }, { label: 'Safety', href: '#safety' }, { label: 'Pricing', href: '#coins' }, { label: 'About', href: '#footer' }],
  seo: { title: 'Velora · Live Video Dating', description: 'Meet, chat, and video call with people around the world.' },
};

export const cmsPageCatalog = [
  ['homepage', 'Homepage'], ['discover', 'Discover'], ['how-it-works', 'How It Works'],
  ['safety', 'Safety'], ['pricing', 'Pricing'], ['about', 'About'], ['contact', 'Contact'],
] as const;

export function cmsContent(value: unknown): CmsContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaultCmsContent;
  const source = value as Partial<CmsContent>;
  const heroSource = (source.hero || {}) as Partial<CmsContent['hero']>;
  const heroImage = heroSource.image === '/velora-landing/hero/glamorous-purple-lit-bedroom.png'
    ? defaultCmsContent.hero.image
    : heroSource.image;
  return {
    ...defaultCmsContent,
    ...source,
    hero: { ...defaultCmsContent.hero, ...heroSource, ...(heroImage ? { image: heroImage } : {}) },
    sections: {
      ...defaultCmsContent.sections,
      ...(source.sections || {}),
      discover: { ...defaultCmsContent.sections.discover, ...(source.sections?.discover || {}) },
      coins: { ...defaultCmsContent.sections.coins, ...(source.sections?.coins || {}) },
      safety: { ...defaultCmsContent.sections.safety, ...(source.sections?.safety || {}), features: source.sections?.safety?.features || defaultCmsContent.sections.safety.features },
    },
    footer: { ...defaultCmsContent.footer, ...(source.footer || {}), links: source.footer?.links || defaultCmsContent.footer.links, social: source.footer?.social || defaultCmsContent.footer.social },
    navigation: source.navigation || defaultCmsContent.navigation,
    seo: { ...defaultCmsContent.seo, ...(source.seo || {}) },
  };
}

export function validCmsContent(input: unknown): input is CmsContent {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const c = input as Partial<CmsContent>;
  if (!c.hero || !c.sections || !c.sections.discover || !c.sections.coins || !c.sections.safety || !c.footer || !c.seo) return false;
  const strings = [c.hero.badge, c.hero.heading, c.hero.highlight, c.hero.description, c.hero.image, c.hero.imageAlt, c.hero.ctaText, c.hero.ctaHref, c.sections.discover.heading, c.sections.discover.description, c.sections.discover.ctaText, c.sections.coins.heading, c.sections.coins.description, c.sections.safety.heading, c.sections.safety.description, c.footer.description, c.seo.title, c.seo.description];
  if (!strings.every(value => typeof value === 'string' && value.length <= 1200)) return false;
  if (!['/dashboard', '#match'].includes(c.hero.ctaHref!)) return false;
  if (!c.hero.image!.startsWith('/') || c.hero.image!.startsWith('//') || c.hero.image!.startsWith('/\\')) return false;
  if (![c.sections.discover.visible, c.sections.coins.visible, c.sections.safety.visible].every(value => typeof value === 'boolean')) return false;
  const safeLink = (href: unknown) => typeof href === 'string' && (href.startsWith('#') || (href.startsWith('/') && !href.startsWith('//')));
  if (!Array.isArray(c.navigation) || c.navigation.length > 12 || !c.navigation.every(item => item && typeof item.label === 'string' && item.label.length <= 48 && safeLink(item.href))) return false;
  if (!Array.isArray(c.footer.links) || c.footer.links.length > 24 || !c.footer.links.every(item => item && typeof item.label === 'string' && item.label.length <= 60 && safeLink(item.href))) return false;
  if (!Array.isArray(c.footer.social) || c.footer.social.length > 8 || !c.footer.social.every(item => item && typeof item.label === 'string' && item.label.length <= 40 && typeof item.href === 'string' && item.href.startsWith('https://'))) return false;
  if (!Array.isArray(c.sections.coins.artwork) || c.sections.coins.artwork.length > 12 || !c.sections.coins.artwork.every(url => typeof url === 'string' && url.startsWith('/') && !url.startsWith('//'))) return false;
  if (!Array.isArray(c.sections.safety.features) || c.sections.safety.features.length > 8 || !c.sections.safety.features.every(item => item && typeof item.title === 'string' && item.title.length <= 80 && typeof item.description === 'string' && item.description.length <= 240 && ['privacy','report','verification','adults'].includes(item.icon))) return false;
  return true;
}
