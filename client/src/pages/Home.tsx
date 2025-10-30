import Navigation from "@/components/Navigation";
import Hero from "@/components/Hero";
import CategoriesSection from "@/components/CategoriesSection";
import HowItWorks from "@/components/HowItWorks";
import FeaturedVendors from "@/components/FeaturedVendors";
import TrustSection from "@/components/TrustSection";
import Testimonials from "@/components/Testimonials";
import CTASection from "@/components/CTASection";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1">
        <Hero />
        <CategoriesSection />
        <HowItWorks />
        <FeaturedVendors />
        <TrustSection />
        <Testimonials />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
