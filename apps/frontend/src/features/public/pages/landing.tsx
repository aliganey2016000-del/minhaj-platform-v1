/**
 * Landing Page
 *
 * Main public landing page composing all sections.
 */

import { HeroSection } from '../../../components/landing/hero-section';
import { CoursesSection } from '../../../components/landing/courses-section';

export function LandingPage() {
  return (
    <>
      <HeroSection />
      <CoursesSection />
    </>
  );
}

export default LandingPage;