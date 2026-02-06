import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { useLocation } from "wouter";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { VendorSidebar } from "@/components/vendor-sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LocationPicker } from "@/components/LocationPicker";
import type { LocationResult } from "@/types/location";


import { Calendar, DollarSign, Users, TrendingUp, Loader2, ArrowLeft } from "lucide-react";

type VendorMe = {
  businessName?: string | null;
  stripeOnboardingComplete?: boolean | null;
};

type VendorStats = {
  totalBookings?: number | null;
  bookingsThisMonth?: number | null;
  revenue?: number | null;
  revenueGrowth?: number | null;
  profileViews?: number | null;
  profileViewsGrowth?: number | null;
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

  const streetAddress = parts[0] || "";
  const city = parts[1] || "";

  let state = "";
  let zipCode = "";
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
  const { isAuthenticated } = useAuth0();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

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
  const [streetAddressDraft, setStreetAddressDraft] = useState("");
  const [cityDraft, setCityDraft] = useState("");
  const [stateDraft, setStateDraft] = useState("");
  const [zipCodeDraft, setZipCodeDraft] = useState("");
  const [marketLocationDraft, setMarketLocationDraft] = useState<LocationResult | null>(null);
  const [homeBaseLocationDraft, setHomeBaseLocationDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [serviceRadiusMilesDraft, setServiceRadiusMilesDraft] = useState<number>(0);
  const [chargesTravelFeeDraft, setChargesTravelFeeDraft] = useState<boolean>(false);
  const [serviceDescriptionDraft, setServiceDescriptionDraft] = useState("");

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

    setMarketLocationDraft((online?.marketLocation as LocationResult) ?? null);
    setHomeBaseLocationDraft(
      online?.homeBaseLocation &&
      Number.isFinite(online.homeBaseLocation.lat) &&
      Number.isFinite(online.homeBaseLocation.lng)
        ? { lat: Number(online.homeBaseLocation.lat), lng: Number(online.homeBaseLocation.lng) }
        : null
    );

    // Attempt to hydrate street/state/zip from onlineProfiles first (since DB lacks explicit cols)
    setStateDraft(typeof online?.state === "string" ? online.state : "");
    setZipCodeDraft(typeof online?.zipCode === "string" ? online.zipCode : "");

    // Prefer serviceAddress, fallback to address
    const addr = (p?.serviceAddress || p?.address || "").trim();
    setStreetAddressDraft(addr);

    setServiceRadiusMilesDraft(Number.isFinite(p?.serviceRadius as any) ? (p?.serviceRadius as number) : 0);

    // travelMode: we’ll treat "travel_fee" as true, otherwise false
    const tm = String(p?.travelMode || "").toLowerCase();
    setChargesTravelFeeDraft(tm === "travel_fee");

    setServiceDescriptionDraft(p?.serviceDescription || "");
  }, [vendorProfile]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      // 1) Update vendor account (business name)
      const resMe = await fetch("/api/vendor/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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
        state: stateDraft,
        zipCode: zipCodeDraft,

        // LocationPicker persistence (MVP-safe, no schema change)
        marketLocation: marketLocationDraft,
        homeBaseLocation: homeBaseLocationDraft,
      };

      const serviceAddress = buildServiceAddress(streetAddressDraft, cityDraft, stateDraft, zipCodeDraft);

      const resProfile = await fetch("/api/vendor/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // keep serviceType stable; set default if missing
          serviceType: vendorProfile?.serviceType || "prop-decor",

          // store address in both fields to be safe with legacy usage
          serviceAddress,
          address: serviceAddress,

          city: cityDraft,

          serviceRadius: Number(serviceRadiusMilesDraft || 0),

          // minimal encoding for MVP
          travelMode: chargesTravelFeeDraft ? "travel_fee" : "included",

          onlineProfiles: onlineProfilesNext,

          serviceDescription: serviceDescriptionDraft,
        }),
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

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  } as React.CSSProperties;

  const showLoading = !isAuthenticated || isVendorLoading || isStatsLoading || isProfileLoading;

  if (showLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex h-screen w-full">
        <VendorSidebar />
        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between p-4 border-b">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <Button
              variant="outline"
              className="bg-[#9edbc0] text-white"
              onClick={() => setLocation("/")}
              data-testid="button-back-marketplace"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Marketplace
            </Button>
          </header>

          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              <div>
                <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
                  Dashboard
                </h1>
                <p className="text-muted-foreground">Welcome back, {vendorAccount?.businessName || "Vendor"}!</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
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
                    <CardTitle className="text-sm font-medium">Revenue</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="stat-revenue">
                      ${(stats?.revenue ?? 0).toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />+{stats?.revenueGrowth ?? 0}% from last month
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Profile Views</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="stat-views">
                      {(stats?.profileViews ?? 0).toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />+{stats?.profileViewsGrowth ?? 0}% this week
                    </p>
                  </CardContent>
                </Card>
              </div>

              {!vendorAccount?.stripeOnboardingComplete && (
                <Card className="border-yellow-500/50 bg-yellow-500/5">
                  <CardHeader>
                    <CardTitle className="text-lg">Complete Your Setup</CardTitle>
                    <CardDescription>Connect your Stripe account to start accepting payments from customers.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={() => setLocation("/vendor/onboarding")} data-testid="button-complete-setup">
                      Complete Payment Setup
                    </Button>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>Your latest bookings and inquiries</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground text-center py-8">
                    No recent bookings yet. Your upcoming bookings will appear here.
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
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

              {/* Profile Details (mirror onboarding fields, MVP-safe storage) */}
              <Card>
                <CardHeader>
                  <CardTitle>Profile Details</CardTitle>
                  <CardDescription>Edit the same details collected during vendor onboarding.</CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
                  {isProfileError ? (
                    <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                      No vendor profile found yet. Complete onboarding first, then you can edit your profile here.
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Business Name</Label>
                      <Input
                        value={businessNameDraft}
                        onChange={(e) => setBusinessNameDraft(e.target.value)}
                        placeholder="Business name"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Business Phone</Label>
                      <Input
                        value={businessPhoneDraft}
                        onChange={(e) => setBusinessPhoneDraft(e.target.value)}
                        placeholder="Business phone"
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

                        setStreetAddressDraft(parsed.streetAddress || label);
                        setCityDraft((loc as any).city || parsed.city || "");
                        setStateDraft((loc as any).state || parsed.state || "");
                        setZipCodeDraft((loc as any).zipCode || parsed.zipCode || "");
                      }}
                      placeholder="Search and select your business address"
                    />

                    {!homeBaseLocationDraft ? (
                      <p className="text-sm text-destructive">Select an address from the dropdown to verify it.</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Tip: pick from the dropdown so we can verify the address.</p>
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

                          setStreetAddressDraft(parsed.streetAddress || label);
                          setCityDraft((loc as any).city || parsed.city || "");
                          setStateDraft((loc as any).state || parsed.state || "");
                          setZipCodeDraft((loc as any).zipCode || parsed.zipCode || "");
                        }}
                        placeholder="Search and select your business address"
                      />

                      {!homeBaseLocationDraft ? (
                        <p className="text-sm text-destructive">Select an address from the dropdown to verify it.</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Tip: pick from the dropdown so we can verify the address.</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <Label htmlFor="charges-travel-fee">Charges Travel Fee</Label>
                        <p className="text-xs text-muted-foreground">If enabled, we mark travel mode as “travel_fee”.</p>
                      </div>
                      <Switch
                        id="charges-travel-fee"
                        checked={chargesTravelFeeDraft}
                        onCheckedChange={(v) => setChargesTravelFeeDraft(!!v)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Service Description</Label>
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
                        setBusinessNameDraft(vendorAccount?.businessName || "");
                        setBusinessPhoneDraft(
                          typeof (vendorProfile?.onlineProfiles as any)?.businessPhone === "string"
                            ? (vendorProfile?.onlineProfiles as any).businessPhone
                            : ""
                        );
                        setStreetAddressDraft((vendorProfile?.serviceAddress || vendorProfile?.address || "").trim());
                        setCityDraft(vendorProfile?.city || "");
                        setStateDraft(typeof (vendorProfile?.onlineProfiles as any)?.state === "string" ? (vendorProfile?.onlineProfiles as any).state : "");
                        setZipCodeDraft(typeof (vendorProfile?.onlineProfiles as any)?.zipCode === "string" ? (vendorProfile?.onlineProfiles as any).zipCode : "");
                        setMarketLocationDraft(((vendorProfile?.onlineProfiles as any)?.marketLocation as LocationResult) ?? null);
                        const hb = (vendorProfile?.onlineProfiles as any)?.homeBaseLocation;
                        setHomeBaseLocationDraft(
                          hb && Number.isFinite(hb.lat) && Number.isFinite(hb.lng)
                            ? { lat: Number(hb.lat), lng: Number(hb.lng) }
                            : null
                        );
                        setServiceRadiusMilesDraft(Number.isFinite(vendorProfile?.serviceRadius as any) ? (vendorProfile?.serviceRadius as number) : 0);
                        setChargesTravelFeeDraft(String(vendorProfile?.travelMode || "").toLowerCase() === "travel_fee");
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
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
