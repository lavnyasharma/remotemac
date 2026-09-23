import { Nav } from '@/components/Nav';
import { Hero } from '@/components/Hero';
import { Features } from '@/components/Features';
import { HowItWorks } from '@/components/HowItWorks';
import { OnboardingStack } from '@/components/OnboardingStack';
import { Architecture } from '@/components/Architecture';
import { Upcoming } from '@/components/Upcoming';
import { FinalCta } from '@/components/FinalCta';
import { Footer } from '@/components/Footer';

export default function Home() {
  return (
    <>
      <Nav />
      <main id="main">
        <Hero />
        <Features />
        <HowItWorks />
        <OnboardingStack />
        <Architecture />
        <Upcoming />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
