/**
 * Landing Page
 *
 * Composes all landing sections into a cohesive, world-class SaaS landing page.
 */

import { lazy, Suspense } from 'react';

const HeroSection = lazy(() => import('../../../components/landing/hero-section').then(m => ({ default: m.HeroSection })));
const WhoIsItForSection = lazy(() => import('../../../components/landing/who-is-it-for').then(m => ({ default: m.WhoIsItForSection })));
const FeaturesSection = lazy(() => import('../../../components/landing/features-section').then(m => ({ default: m.FeaturesSection })));
const MultiTenantSection = lazy(() => import('../../../components/landing/multitenant-section').then(m => ({ default: m.MultiTenantSection })));
const HowItWorksSection = lazy(() => import('../../../components/landing/how-it-works').then(m => ({ default: m.HowItWorksSection })));
const PricingSection = lazy(() => import('../../../components/landing/pricing-section').then(m => ({ default: m.PricingSection })));
const FAQSection = lazy(() => import('../../../components/landing/faq-section').then(m => ({ default: m.FAQSection })));
const FinalCTASection = lazy(() => import('../../../components/landing/final-cta').then(m => ({ default: m.FinalCTASection })));

function SectionFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
    </div>
  );
}

export function LandingPage() {
  return (
    <>
      <Suspense fallback={<SectionFallback />}><HeroSection /></Suspense>
      <Suspense fallback={<SectionFallback />}><WhoIsItForSection /></Suspense>
      <Suspense fallback={<SectionFallback />}><FeaturesSection /></Suspense>
      <Suspense fallback={<SectionFallback />}><MultiTenantSection /></Suspense>
      <Suspense fallback={<SectionFallback />}><HowItWorksSection /></Suspense>
      <Suspense fallback={<SectionFallback />}><PricingSection /></Suspense>
      <Suspense fallback={<SectionFallback />}><FAQSection /></Suspense>
      <Suspense fallback={<SectionFallback />}><FinalCTASection /></Suspense>
    </>
  );
}

export default LandingPage;