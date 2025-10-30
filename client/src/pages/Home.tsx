import Navigation from "@/components/Navigation";
import Hero from "@/components/Hero";
import SmartRecommendations from "@/components/SmartRecommendations";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navigation />
      <main className="flex-1">
        <Hero />
        <SmartRecommendations />
      </main>
      <Footer />
    </div>
  );
}
