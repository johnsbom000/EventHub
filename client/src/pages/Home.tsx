import MasonryListingGrid from "@/components/MasonryListingGrid";
import ListingCard from "@/components/ListingCard";
import type { ListingPublic } from "@/types/listing";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";

import Navigation from "@/components/Navigation";
import Hero from "@/components/Hero";
import Footer from "@/components/Footer";

export default function Home() {
 const { t } = useTranslation();
 const { data, isLoading } = useQuery<{ listings: ListingPublic[]; total: number }>({
 queryKey: ["/api/listings/public", { limit: 12, sort: "recommended" }],
 queryFn: async () => {
 const res = await apiRequest("GET", "/api/listings/public?limit=12&sort=recommended");
 return res.json();
 },
 });

 const featuredListings = useMemo(() => data?.listings ?? [], [data]);

 return (
 <div className="min-h-screen flex flex-col bg-[#ffffff] ">
 <Navigation showBottomBorder={false} />

 <main className="flex-1 min-h-[calc(100vh+7rem)] bg-[#ffffff] ">
 <Hero />

 {/* Featured Listings under the hero */}
 <section className="w-full px-4 sm:px-6 lg:px-12 py-12">
 <div className="mb-5 flex items-end justify-between gap-4">
 <div>
 <h2 className="font-heading font-normal text-[#2a3a42] ">
 {t("home.featured.title")}
 </h2>
 </div>

 {/* Optional: link to /browse */}
 <a
 href="/browse"
 className="font-sans text-sm font-medium uppercase tracking-[0.1em] text-[#e07a6a]"
 data-testid="link-view-all"
 >
 {t("home.featured.viewAll")}
 </a>
 </div>

 {isLoading ? (
 <div className="flex items-center justify-center py-12">
 <div className="text-center space-y-4">
 <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
 <p className="text-muted-foreground">{t("home.loading")}</p>
 </div>
 </div>
 ) : featuredListings.length === 0 ? (
 <div className="text-center py-12">
 <p className="text-muted-foreground">{t("home.noListings")}</p>
 </div>
 ) : (
 <MasonryListingGrid
 listings={featuredListings}
 maxColumns={5}
 minCardWidthPx={240}
 cardMaxWidthPx={290}
 renderCard={(listing) => (
 <ListingCard
 listing={listing}
 priceScale="double"
 titleScale="oneAndHalf"
 titleSizeClassName="text-[1.518rem] md:text-[2rem]"
 priceSizeClassName="text-[1.5rem] leading-none md:text-[2.25rem] md:leading-none"
 titleFont="heading"
 primaryActionScale="plus15"
 />
 )}
 />
 )}
 </section>
 </main>

 <Footer />
 </div>
 );
}
