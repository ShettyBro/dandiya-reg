import { SiteNav } from "../components/layout/SiteNav.js";
import { SiteFooter } from "../components/layout/SiteFooter.js";
import { BambooGallery } from "../components/gallery/BambooGallery.js";
import { Hero } from "./landing/Hero.js";
import { Highlights } from "./landing/Highlights.js";
import { MemoryGallery } from "./landing/MemoryGallery.js";
import { Rules } from "./landing/Rules.js";
import { FinalCta } from "./landing/FinalCta.js";

export function LandingPage() {
  return (
    <div className="relative min-h-screen">
      <BambooGallery />
      <SiteNav />
      <main className="relative z-10">
        <Hero />
        <Highlights />
        <MemoryGallery />
        <Rules />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
