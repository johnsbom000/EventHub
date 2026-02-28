import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ListingCard from "@/components/ListingCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ListingPublic } from "@/types/listing";
import { getFreshAccessToken } from "@/lib/authToken";

type VendorShopResponse = {
  vendor: {
    id: string;
    businessName: string;
    aboutBusiness?: string | null;
    aboutOwner?: string | null;
    profileImageUrl?: string | null;
    yearsInBusiness?: string | null;
    hobbies?: string | null;
    likesDislikes?: string | null;
    homeState?: string | null;
    funFacts?: string | null;
    city?: string | null;
    serviceType?: string | null;
  };
  listings: ListingPublic[];
};

type VendorMe = {
  id: string;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export default function VendorShopPublic() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/shop/:vendorId");
  const vendorId = params?.vendorId;

  const { data, isLoading, isError } = useQuery<VendorShopResponse>({
    queryKey: ["/api/vendors/public/shop", vendorId],
    enabled: Boolean(vendorId),
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const res = await fetch(`/api/vendors/public/${vendorId}/shop`, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        throw new Error(`Failed to load vendor shop (${res.status})`);
      }

      return res.json();
    },
  });

  const { data: vendorMe } = useQuery<VendorMe | null>({
    queryKey: ["/api/vendor/me", "customer-mode-exit"],
    retry: false,
    queryFn: async () => {
      const token = await getFreshAccessToken();
      if (!token) return null;

      const res = await fetch("/api/vendor/me", {
        credentials: "include",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) return null;
      return res.json();
    },
  });

  const listings = useMemo(() => {
    if (!Array.isArray(data?.listings)) return [];
    return data.listings;
  }, [data?.listings]);

  const canExitCustomerMode = Boolean(vendorMe?.id && data?.vendor?.id && vendorMe.id === data.vendor.id);

  if (!vendorId) {
    return <div className="p-6">Missing vendor id.</div>;
  }

  const aboutBusiness = asTrimmedString(data?.vendor?.aboutBusiness);
  const aboutOwner = asTrimmedString(data?.vendor?.aboutOwner);
  const city = asTrimmedString(data?.vendor?.city);
  const serviceType = asTrimmedString(data?.vendor?.serviceType);
  const profileImageUrl = asTrimmedString(data?.vendor?.profileImageUrl);
  const yearsInBusiness = asTrimmedString(data?.vendor?.yearsInBusiness);
  const hobbies = asTrimmedString(data?.vendor?.hobbies);
  const likesDislikes = asTrimmedString(data?.vendor?.likesDislikes);
  const homeState = asTrimmedString(data?.vendor?.homeState);
  const funFacts = asTrimmedString(data?.vendor?.funFacts);

  const showAboutPanel = Boolean(
    aboutBusiness ||
      aboutOwner ||
      yearsInBusiness ||
      hobbies ||
      likesDislikes ||
      homeState ||
      funFacts ||
      city ||
      serviceType
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#f0eee9] dark:bg-background">
      <Navigation />

      <main className="flex-1 px-6 py-8 lg:px-10">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : isError || !data?.vendor ? (
          <Card className="mx-auto max-w-2xl">
            <CardHeader>
              <CardTitle>Vendor shop not found</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              This vendor shop is unavailable right now.
            </CardContent>
          </Card>
        ) : (
          <div className="mx-auto max-w-7xl space-y-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-3">
                <Badge variant="secondary" className="text-xs uppercase tracking-[0.1em]">
                  Vendor Shop
                </Badge>
                <div className="flex items-center gap-3">
                  {profileImageUrl ? (
                    <img
                      src={profileImageUrl}
                      alt={`${data.vendor.businessName} profile`}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : null}
                  <h1 className="text-3xl font-semibold text-[#2a3a42] dark:text-[#f5f0e8]" data-testid="text-vendor-shop-name">
                    {data.vendor.businessName}
                  </h1>
                </div>
              </div>
              {canExitCustomerMode ? (
                <Button
                  variant="outline"
                  onClick={() => setLocation("/vendor/shop")}
                  data-testid="button-exit-customer-mode"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Exit Customer Mode
                </Button>
              ) : null}
            </div>

            <div className={`grid gap-6 ${showAboutPanel ? "lg:grid-cols-3" : ""}`}>
              <section className={showAboutPanel ? "lg:col-span-2 space-y-4" : "space-y-4"}>
                <h2 className="text-xl font-semibold text-[#2a3a42] dark:text-[#f5f0e8]">Active Listings</h2>
                {listings.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-sm text-muted-foreground">
                      No active listings yet.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="w-full columns-1 gap-5 [column-fill:_balance] sm:columns-2 xl:columns-3">
                    {listings.map((listing) => (
                      <div key={listing.id} className="mb-2 inline-block w-full break-inside-avoid align-top">
                        <ListingCard
                          listing={listing}
                          priceScale="double"
                          titleScale="oneAndHalf"
                          titleFont="heading"
                          showVendorShopButton={false}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {showAboutPanel ? (
                <aside className="space-y-4">
                  <Card className="bg-background">
                    <CardHeader>
                      <CardTitle>About</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm text-muted-foreground">
                      {aboutBusiness ? (
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">About the Business</p>
                          <p>{aboutBusiness}</p>
                        </div>
                      ) : null}

                      {aboutOwner ? (
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">About the Owner</p>
                          <p>{aboutOwner}</p>
                        </div>
                      ) : null}

                      {yearsInBusiness ? (
                        <p>
                          <span className="font-medium text-foreground">Years in Business:</span> {yearsInBusiness}
                        </p>
                      ) : null}

                      {hobbies ? (
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">Hobbies</p>
                          <p>{hobbies}</p>
                        </div>
                      ) : null}

                      {likesDislikes ? (
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">Likes & Dislikes</p>
                          <p>{likesDislikes}</p>
                        </div>
                      ) : null}

                      {homeState ? (
                        <p>
                          <span className="font-medium text-foreground">Home State:</span> {homeState}
                        </p>
                      ) : null}

                      {funFacts ? (
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">Fun Facts</p>
                          <p>{funFacts}</p>
                        </div>
                      ) : null}

                      {city ? (
                        <p>
                          <span className="font-medium text-foreground">City:</span> {city}
                        </p>
                      ) : null}

                      {serviceType ? (
                        <p>
                          <span className="font-medium text-foreground">Category:</span> {serviceType}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                </aside>
              ) : null}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
