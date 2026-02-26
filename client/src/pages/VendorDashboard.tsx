import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { useLocation } from "wouter";
import VendorShell from "@/components/VendorShell";


import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { LocationPicker } from "@/components/LocationPicker";
import type { LocationResult } from "@/types/location";
import { useToast } from "@/hooks/use-toast";
import { redirectVendorToStripeSetup } from "@/lib/vendorStripe";


import { Calendar, DollarSign, Users, TrendingUp, Loader2 } from "lucide-react";

type VendorMe = {
  businessName?: string | null;
  email?: string | null;
  stripeOnboardingComplete?: boolean | null;
};

type VendorStats = {
  totalBookings?: number | null;
  bookingsThisMonth?: number | null;
  revenue?: number | null;
  revenueGrowth?: number | null;
  profileViews?: number | null;
  profileViewsGrowth?: number | null;
  recentBookings?: Array<{
    id: string;
    itemTitle?: string | null;
    status?: string | null;
    totalAmount?: number | null;
    eventDate?: string | null;
    eventLocation?: string | null;
    createdAt?: string | null;
  }>;
};

type VendorProfileResponse = {
  serviceType?: string | null;
  address?: string | null;
  serviceAddress?: string | null;
  city?: string | null;
  travelMode?: string | null;
  serviceRadius?: number | null;
  onlineProfiles?: any;
  serviceDescription?: string | null;
};

function buildServiceAddress(street: string, city: string, state: string, zip: string) {
  const a = street.trim();
  const c = city.trim();
  const s = state.trim();
  const z = zip.trim();
  const cityStateZip = [c, [s, z].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [a, cityStateZip].filter(Boolean).join(", ");
}

function parseFromLabel(label: string): {
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
} {
  const parts = label.split(",").map((p) => p.trim()).filter(Boolean);

    // Handle labels like:
    // - "123 Main St, St. George, UT 84770"
    // - "St. George, UT"
    // - "St. George, Utah"
    const isTwoPart = parts.length === 2;

    let streetAddress = "";
    let city = "";
    let state = "";
    let zipCode = "";

    if (isTwoPart) {
      // City-only label
      streetAddress = "";
      city = parts[0] || "";
      state = parts[1] || "";
      zipCode = "";
      return { streetAddress, city, state, zipCode };
    }

    // Default: 3+ parts (street, city, state zip)
    streetAddress = parts[0] || "";
    city = parts[1] || "";

    const stateZipChunk = parts[2] || "";
    const m = stateZipChunk.match(/^(.+?)\s+(\d{5})(?:-\d{4})?$/);

    if (m) {
      state = m[1].trim();
      zipCode = m[2].trim();
    } else {
    state = stateZipChunk.trim();
  }

  return { streetAddress, city, state, zipCode };
}

function emptyParsedAddress() {
  return {
    streetAddress: "",
    city: "",
    state: "",
    zipCode: "",
  };
}

function pickCoords(loc: any): { lat: number; lng: number } | null {
  const lng =
    loc?.lng ??
    loc?.longitude ??
    (Array.isArray(loc?.center) ? loc.center[0] : undefined) ??
    (Array.isArray(loc?.geometry?.coordinates) ? loc.geometry.coordinates[0] : undefined);

  const lat =
    loc?.lat ??
    loc?.latitude ??
    (Array.isArray(loc?.center) ? loc.center[1] : undefined) ??
    (Array.isArray(loc?.geometry?.coordinates) ? loc.geometry.coordinates[1] : undefined);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: Number(lat), lng: Number(lng) };
}

export default function VendorDashboard() {
  const { isAuthenticated, isLoading: isAuthLoading, getAccessTokenSilently } = useAuth0();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: vendorAccount, isLoading: isVendorLoading } = useQuery<VendorMe>({
    queryKey: ["/api/vendor/me"],
    enabled: isAuthenticated,
  });

  const { data: stats, isLoading: isStatsLoading } = useQuery<VendorStats>({
    queryKey: ["/api/vendor/stats"],
    enabled: isAuthenticated,
  });

  const {
    data: vendorProfile,
    isLoading: isProfileLoading,
    isError: isProfileError,
  } = useQuery<VendorProfileResponse>({
    queryKey: ["/api/vendor/profile"],
    enabled: isAuthenticated,
    retry: false,
  });

  // -------------------------
  // Draft fields (match onboarding inputs)
  // -------------------------
  const [businessNameDraft, setBusinessNameDraft] = useState("");
  const [businessPhoneDraft, setBusinessPhoneDraft] = useState("");
  const [businessEmailDraft, setBusinessEmailDraft] = useState("");
  const [streetAddressDraft, setStreetAddressDraft] = useState("");
  const [cityDraft, setCityDraft] = useState("");
  const [stateDraft, setStateDraft] = useState("");
  const [zipCodeDraft, setZipCodeDraft] = useState("");
  const [marketLocationDraft, setMarketLocationDraft] = useState<LocationResult | null>(null);
  const [homeBaseLocationDraft, setHomeBaseLocationDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [serviceRadiusMilesDraft, setServiceRadiusMilesDraft] = useState<number>(0);
  const [serviceDescriptionDraft, setServiceDescriptionDraft] = useState("");
  const [isStripeSetupLoading, setIsStripeSetupLoading] = useState(false);

  // hydrate drafts
  useEffect(() => {
    setBusinessNameDraft(vendorAccount?.businessName || "");
  }, [vendorAccount?.businessName]);

  useEffect(() => {
    // If profile doesn't exist yet, keep safe defaults
    const p = vendorProfile;

    setCityDraft(p?.city || "");

    const online = (p?.onlineProfiles ?? {}) as any;
    setBusinessPhoneDraft(typeof online?.businessPhone === "string" ? online.businessPhone : "");
    const normalizedBusinessEmail =
      typeof online?.businessEmail === "string" ? online.businessEmail.trim() : "";
    setBusinessEmailDraft(normalizedBusinessEmail || vendorAccount?.email || "");
        
        // ---- Location hydration (LocationPicker-first) ----
        const addrLabel = (p?.serviceAddress || p?.address || "").trim();

        // Prefer structured LocationResult from onboarding/dashboard saves.
        // Backfill for older vendors: if missing, build a minimal LocationResult with label-only.
        const marketFromDb = (online?.marketLocation as LocationResult) ?? null;
        const marketBackfill = !marketFromDb && addrLabel ? ({ label: addrLabel } as any as LocationResult) : null;

        const marketNext = marketFromDb ?? marketBackfill;

        setMarketLocationDraft(marketNext);

        // coords only if we actually have them
        const coordsFromDb = pickCoords(marketFromDb as any);
        setHomeBaseLocationDraft(coordsFromDb ?? null);

        // Fill address inputs from the best available label
        const labelForParsing =
          ((marketNext as any)?.label as string) ||
          ((marketNext as any)?.place_name as string) ||
          addrLabel ||
          "";

            const parsedRaw = labelForParsing ? parseFromLabel(labelForParsing) : emptyParsedAddress();

            // If label is city-only (e.g. "St. George, Utah"), do NOT treat it as street
            const isCityOnlyLabel =
              parsedRaw.streetAddress === parsedRaw.city ||
              !/\d/.test(parsedRaw.streetAddress);

            const parsed = {
              streetAddress: isCityOnlyLabel ? "" : parsedRaw.streetAddress,
              city: parsedRaw.city,
              state: parsedRaw.state,
              zipCode: parsedRaw.zipCode,
            };

            console.log("[hydrate] labelForParsing:", labelForParsing);
            console.log("[hydrate] parsedRaw:", parsedRaw);
            console.log("[hydrate] parsed:", parsed);
            console.log("[hydrate] online.state/zip:", online?.state, online?.zipCode);

        setStreetAddressDraft(
          typeof online?.streetAddress === "string" && online.streetAddress.trim()
            ? online.streetAddress
            : parsed.streetAddress || ""
        );
        setCityDraft((online?.city as string) || p?.city || parsed.city || "");
        setStateDraft(
          online?.state && online.state.trim()
            ? online.state
            : parsed.state || ""
        );

        setZipCodeDraft(
          online?.zipCode && online.zipCode.trim()
            ? online.zipCode
            : parsed.zipCode || ""
        );

    setServiceRadiusMilesDraft(Number.isFinite(p?.serviceRadius as any) ? (p?.serviceRadius as number) : 0);

    setServiceDescriptionDraft(p?.serviceDescription || "");
  }, [vendorProfile, vendorAccount?.email]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      // 1) Update vendor account (business name)
      const token = await getAccessTokenSilently({
        authorizationParams: { audience: "https://eventhub-api" },
      });

      const resMe = await fetch("/api/vendor/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ businessName: businessNameDraft }),
      });
      if (!resMe.ok) {
        throw new Error(`PATCH /api/vendor/me failed: ${resMe.status}`);
      }

      // 2) Update vendor profile (PATCH)
      // DB notes:
      // - vendor_profiles has city + service_radius + travel_mode + service_description
      // - state/zip/phone aren’t columns; store them inside onlineProfiles JSONB
      const onlineProfilesNext = {
        ...(vendorProfile?.onlineProfiles ?? {}),
        businessPhone: businessPhoneDraft,
        businessEmail: businessEmailDraft,
        streetAddress: streetAddressDraft,
        state: stateDraft,
        zipCode: zipCodeDraft,

        // LocationPicker persistence (MVP-safe, no schema change)
        homeBaseLocation: homeBaseLocationDraft,
        marketLocation: marketLocationDraft,
      };

      const serviceAddress = buildServiceAddress(streetAddressDraft, cityDraft, stateDraft, zipCodeDraft);

      const resProfile = await fetch("/api/vendor/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({   // keep serviceType stable; set default if missing
          serviceType: vendorProfile?.serviceType || "prop-decor",

          // store address in both fields to be safe with legacy usage
          serviceAddress,
          address: serviceAddress,

          city: cityDraft,

          serviceRadius: Number(serviceRadiusMilesDraft || 0),

          // minimal encoding for MVP
          travelMode: "included",

          onlineProfiles: onlineProfilesNext,

          serviceDescription: serviceDescriptionDraft, }),
      });

      // If vendor profile doesn't exist yet, PATCH will 404; tell user clearly
      if (!resProfile.ok) {
        const msg = await resProfile.text().catch(() => "");
        throw new Error(`PATCH /api/vendor/profile failed: ${resProfile.status}${msg ? ` :: ${msg}` : ""}`);
      }

      return resProfile.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/vendor/me"] });
      qc.invalidateQueries({ queryKey: ["/api/vendor/profile"] });
    },
  });

  const handleCompletePaymentSetup = async () => {
    try {
      setIsStripeSetupLoading(true);
      await redirectVendorToStripeSetup();
    } catch (error: any) {
      setIsStripeSetupLoading(false);
      toast({
        title: "Unable to open Stripe setup",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      setLocation("/vendor/login");
    }
  }, [isAuthLoading, isAuthenticated, setLocation]);

  const showLoading = isAuthLoading || isVendorLoading || isStatsLoading || isProfileLoading;
  const formatMoneyFromCents = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);

  if (!isAuthLoading && !isAuthenticated) {
    return null;
  }

  if (showLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <VendorShell>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
            Dashboard
          </h1>
          <p className="text-muted-foreground">
            Welcome back, {vendorAccount?.businessName || "Vendor"}!
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[20px]">Total Bookings</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-bookings">
                {stats?.totalBookings ?? 0}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />+{stats?.bookingsThisMonth ?? 0} this month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[20px]">Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-revenue">
                {formatMoneyFromCents(Number(stats?.revenue ?? 0))}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {Number(stats?.revenueGrowth ?? 0) >= 0 ? "+" : ""}
                {stats?.revenueGrowth ?? 0}% from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[20px]">Profile Views</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-views">
                {(stats?.profileViews ?? 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {Number(stats?.profileViewsGrowth ?? 0) >= 0 ? "+" : ""}
                {stats?.profileViewsGrowth ?? 0}% this week
              </p>
            </CardContent>
          </Card>
        </div>

        {!vendorAccount?.stripeOnboardingComplete && (
          <Card className="border-[hsl(var(--secondary-accent)/0.45)] bg-[hsl(var(--secondary-accent)/0.12)]">
            <CardHeader>
              <CardTitle className="text-[20px]">Complete Your Setup</CardTitle>
              <CardDescription>
                Connect your Stripe account to start accepting payments from customers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleCompletePaymentSetup}
                disabled={isStripeSetupLoading}
                data-testid="button-complete-setup"
              >
                {isStripeSetupLoading ? "Opening Stripe..." : "Complete Payment Setup"}
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-[20px]">Recent Activity</CardTitle>
            <CardDescription>Your latest bookings and inquiries</CardDescription>
          </CardHeader>
          <CardContent>
            {!stats?.recentBookings || stats.recentBookings.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                No recent bookings yet. Your upcoming bookings will appear here.
              </div>
            ) : (
              <div className="space-y-3">
                {stats.recentBookings.slice(0, 5).map((booking) => (
                  <div
                    key={booking.id}
                    className="rounded-lg border p-3 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-medium">{booking.itemTitle || `Booking #${booking.id.slice(0, 8)}`}</div>
                      <div className="text-sm text-muted-foreground">
                        {booking.eventDate || "Date not set"}
                        {booking.eventLocation ? ` • ${booking.eventLocation}` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm capitalize text-muted-foreground">
                        {String(booking.status || "pending")}
                      </div>
                      <div className="font-medium">
                        {formatMoneyFromCents(Number(booking.totalAmount ?? 0))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-[20px]">Quick Actions</CardTitle>
            <CardDescription>Common tasks and shortcuts</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              data-testid="button-manage-listings"
              onClick={() => setLocation("/vendor/listings")}
            >
              Manage Listings
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="button-view-calendar"
              onClick={() => setLocation("/vendor/bookings")}
            >
              View Calendar
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="button-view-payments"
              onClick={() => setLocation("/vendor/payments")}
            >
              View Payments
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-[20px]">Profile Details</CardTitle>
            <CardDescription>
              Edit the same details collected during vendor onboarding.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {isProfileError ? (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                No vendor profile found yet. Complete onboarding first, then you can edit your
                profile here.
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Business Name</Label>
              <Input
                value={businessNameDraft}
                onChange={(e) => setBusinessNameDraft(e.target.value)}
                placeholder="Business name"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Business Phone</Label>
                <Input
                  value={businessPhoneDraft}
                  onChange={(e) => setBusinessPhoneDraft(e.target.value)}
                  placeholder="Business phone"
                />
              </div>

              <div className="space-y-2">
                <Label>Business Email</Label>
                <Input
                  value={businessEmailDraft}
                  onChange={(e) => setBusinessEmailDraft(e.target.value)}
                  placeholder="Business email"
                  type="email"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Business Address (verified)</Label>

              <LocationPicker
                value={marketLocationDraft}
                onChange={(loc: LocationResult | null) => {
                  if (!loc) {
                    setMarketLocationDraft(null);
                    setHomeBaseLocationDraft(null);
                    setStreetAddressDraft("");
                    setCityDraft("");
                    setStateDraft("");
                    setZipCodeDraft("");
                    return;
                  }

                  const label = (loc as any).label || (loc as any).place_name || "";
                  const coords = pickCoords(loc as any);
                  const parsed = parseFromLabel(label);

                  setMarketLocationDraft(loc);
                  setHomeBaseLocationDraft(coords);

                  const streetFromPicker =
                    (loc as any).address ||
                    (loc as any).street ||
                    parsed.streetAddress ||
                    "";
                  setStreetAddressDraft(streetFromPicker);
                  setCityDraft((loc as any).city || parsed.city || "");
                  setStateDraft((loc as any).state || parsed.state || "");
                  setZipCodeDraft((loc as any).zipCode || parsed.zipCode || "");
                }}
                placeholder="Search and select your business address"
              />

              {!homeBaseLocationDraft ? (
                <p className="text-sm text-destructive">
                  Select an address from the dropdown to verify it.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Tip: pick from the dropdown so we can verify the address.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Street Address</Label>
              <Input
                value={streetAddressDraft}
                onChange={(e) => {
                  setStreetAddressDraft(e.target.value);
                  setHomeBaseLocationDraft(null);
                  setMarketLocationDraft(null);
                }}
                placeholder="Street address"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={cityDraft}
                  onChange={(e) => {
                    setCityDraft(e.target.value);
                    setHomeBaseLocationDraft(null);
                    setMarketLocationDraft(null);
                  }}
                  placeholder="City"
                />
              </div>

              <div className="space-y-2">
                <Label>State</Label>
                <Input
                  value={stateDraft}
                  onChange={(e) => {
                    setStateDraft(e.target.value);
                    setHomeBaseLocationDraft(null);
                    setMarketLocationDraft(null);
                  }}
                  placeholder="State"
                />
              </div>

              <div className="space-y-2">
                <Label>Zip</Label>
                <Input
                  value={zipCodeDraft}
                  onChange={(e) => {
                    setZipCodeDraft(e.target.value);
                    setHomeBaseLocationDraft(null);
                    setMarketLocationDraft(null);
                  }}
                  placeholder="Zip"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 items-end">
              <div className="space-y-2">
                <Label>Service Radius (miles)</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={String(serviceRadiusMilesDraft ?? 0)}
                  onChange={(e) => setServiceRadiusMilesDraft(Number(e.target.value || 0))}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>About The Business</Label>
              <Textarea
                value={serviceDescriptionDraft}
                onChange={(e) => setServiceDescriptionDraft(e.target.value)}
                placeholder="Describe what you offer, your style, what’s included, etc."
                rows={5}
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const online = (vendorProfile?.onlineProfiles as any) ?? {};
                  const marketLocation = (online?.marketLocation as LocationResult) ?? null;
                  const addressLabel =
                    ((marketLocation as any)?.label as string) ||
                    ((marketLocation as any)?.place_name as string) ||
                    (vendorProfile?.serviceAddress || vendorProfile?.address || "").trim();
                  const parsed = addressLabel ? parseFromLabel(addressLabel) : emptyParsedAddress();

                  setBusinessNameDraft(vendorAccount?.businessName || "");
                  setBusinessPhoneDraft(
                    typeof online?.businessPhone === "string"
                      ? online.businessPhone
                      : ""
                  );
                  const normalizedBusinessEmail =
                    typeof online?.businessEmail === "string" ? online.businessEmail.trim() : "";
                  setBusinessEmailDraft(normalizedBusinessEmail || vendorAccount?.email || "");
                  setStreetAddressDraft(
                    typeof online?.streetAddress === "string" && online.streetAddress.trim()
                      ? online.streetAddress
                      : parsed.streetAddress || ""
                  );
                  setCityDraft(vendorProfile?.city || parsed.city || "");
                  setStateDraft(
                    typeof online?.state === "string"
                      ? online.state
                      : ""
                  );
                  setZipCodeDraft(
                    typeof online?.zipCode === "string"
                      ? online.zipCode
                      : ""
                  );
                  setMarketLocationDraft(marketLocation);
                  const hb = online?.homeBaseLocation;
                  setHomeBaseLocationDraft(
                    hb && Number.isFinite(hb.lat) && Number.isFinite(hb.lng)
                      ? { lat: Number(hb.lat), lng: Number(hb.lng) }
                      : null
                  );
                  setServiceRadiusMilesDraft(
                    Number.isFinite(vendorProfile?.serviceRadius as any)
                      ? (vendorProfile?.serviceRadius as number)
                      : 0
                  );
                  setServiceDescriptionDraft(vendorProfile?.serviceDescription || "");
                }}
                disabled={saveProfile.isPending}
              >
                Reset
              </Button>

              <Button
                onClick={() => saveProfile.mutate()}
                disabled={saveProfile.isPending || isProfileError}
                data-testid="button-save-profile-details"
              >
                {saveProfile.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </VendorShell>
  );

}
