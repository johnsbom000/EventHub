import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import HobbyPillInput from "@/components/HobbyPillInput";
import { LocationPicker } from "@/components/LocationPicker";
import OnboardingStepHeader from "@/features/vendor/onboarding/OnboardingStepHeader";
import type { LocationResult } from "@/types/location";

interface Step2BusinessDetailsProps {
  formData: {
    businessName: string;

    streetAddress: string;
    city: string;
    state: string;
    zipCode: string;

    businessPhone: string;
    businessEmail: string;
    showBusinessPhoneToCustomers: boolean;
    showBusinessEmailToCustomers: boolean;
    showBusinessAddressToCustomers: boolean;
    aboutVendor: string;
    aboutBusiness: string;
    shopTagline: string;
    inBusinessSinceYear: string;
    specialties: string;
    eventsServedBaseline: string;

    // proof the address came from dropdown
    homeBaseLocation?: { lat: number; lng: number };
    marketLocation?: LocationResult | null;
  };
  updateFormData: (
    updates: Partial<Step2BusinessDetailsProps["formData"]>
  ) => void;
  onNext: () => void;
  onBack: () => void;
}

// Very simple parser for labels like:
// "2556 East Arbor Drive, St. George, Utah 84790, United States"
function parseFromLabel(label: string): {
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
} {
  const parts = label.split(",").map((p) => p.trim()).filter(Boolean);

  // Best-effort defaults
  const streetAddress = parts[0] || "";
  const city = parts[1] || "";

  // Try to grab state + zip from the 3rd chunk (e.g. "Utah 84790")
  let state = "";
  let zipCode = "";

  const stateZipChunk = parts[2] || "";
  const m = stateZipChunk.match(/^(.+?)\s+(\d{5})(?:-\d{4})?$/);
  if (m) {
    state = m[1].trim();
    zipCode = m[2].trim();
  } else {
    // fallback: state only
    state = stateZipChunk.trim();
  }

  return { streetAddress, city, state, zipCode };
}

function normalizeBusinessNameInput(value: string): string {
  const raw = (value || "")
    .replace(/[’]/g, "'")
    .replace(/[^a-zA-Z0-9\s']/g, " ");

  const hasTrailingSpace = /\s$/.test(raw);

  const cleaned = raw
    .replace(/\s+/g, " ")
    .replace(/^\s+/, "")
    .slice(0, 120);

  if (!cleaned.trim()) return "";

  const titleCased = cleaned
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  return hasTrailingSpace ? `${titleCased} ` : titleCased;
}

function normalizeInBusinessSinceYearInput(value: string, currentYear: number): string {
  const digits = value.replace(/[^\d]/g, "").slice(0, 4);
  if (!digits) return "";
  if (digits.length < 4) return digits;
  return String(Math.min(Number(digits), currentYear));
}

function pickCoords(loc: any): { lat: number; lng: number } | null {
  // Handle common shapes:
  // - { lat, lng } / { latitude, longitude }
  // - { center: [lng, lat] } (Mapbox style)
  // - { geometry: { coordinates: [lng, lat] } } (GeoJSON style)
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

export default function Step2_BusinessDetails({
  formData,
  updateFormData,
  onNext,
  onBack,
}: Step2BusinessDetailsProps) {
  const currentYear = new Date().getFullYear();
  const hasAddressFields =
    formData.streetAddress.trim() !== "" ||
    formData.city.trim() !== "" ||
    formData.state.trim() !== "" ||
    formData.zipCode.trim() !== "";

  const isAddressVerified =
    !!formData.homeBaseLocation &&
    Number.isFinite(formData.homeBaseLocation.lat) &&
    Number.isFinite(formData.homeBaseLocation.lng);

  const isComplete = useMemo(() => {
    return (
      formData.businessName.trim() !== "" &&
      formData.businessPhone.trim() !== "" &&
      formData.businessEmail.trim() !== "" &&
      formData.streetAddress.trim() !== "" &&
      formData.city.trim() !== "" &&
      formData.state.trim() !== "" &&
      formData.zipCode.trim() !== "" &&
      isAddressVerified
    );
  }, [formData, isAddressVerified]);

  const addressError =
    hasAddressFields && !isAddressVerified
      ? "Select an address from the dropdown to verify it."
      : null;
  const shouldShowAddressInputs =
    isAddressVerified || hasAddressFields || Boolean(formData.marketLocation);

  return (
    <div className="space-y-6 pb-28">
      <div className="space-y-2">
        <OnboardingStepHeader currentStep={1} />
        <h1 className="text-[3rem] font-semibold">Business Details</h1>
      </div>

      <form
        className="vendor-onboarding-step-content space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isComplete) return;
          onNext();
        }}
      >
        <div className="grid gap-y-6 lg:grid-cols-[minmax(0,1.5fr)_3rem_minmax(430px,520px)] xl:grid-cols-[minmax(0,1.5fr)_4rem_minmax(430px,520px)] lg:items-start">
            <div
              className="space-y-4 rounded-2xl border border-[rgba(154,172,180,0.55)] bg-[#ffffff] p-6 lg:col-[1/2]"
            >
            <div className="space-y-2">
              <Label htmlFor="onboarding-business-name">Business name</Label>
              <Input
                id="onboarding-business-name"
                name="businessName"
                placeholder="Business name"
                spellCheck
                value={formData.businessName}
                onChange={(e) =>
                  updateFormData({ businessName: normalizeBusinessNameInput(e.target.value) })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Business address</Label>
              <LocationPicker
                value={formData.marketLocation || null}
                onChange={(loc: LocationResult | null) => {
                  if (!loc) {
                    updateFormData({
                      marketLocation: null,
                      homeBaseLocation: undefined,
                      streetAddress: "",
                      city: "",
                      state: "",
                      zipCode: "",
                    });
                    return;
                  }

                  const label =
                    (loc as any).label ||
                    (loc as any).place_name ||
                    "";

                  const coords = pickCoords(loc as any);

                  // First try structured fields from LocationResult, otherwise parse from label
                  const parsed = parseFromLabel(label);

                  updateFormData({
                    marketLocation: loc,
                    homeBaseLocation: coords || undefined,

                    streetAddress: parsed.streetAddress || label,
                    city: (loc as any).city || parsed.city || "",
                    state: (loc as any).state || parsed.state || "",
                    zipCode: (loc as any).zipCode || parsed.zipCode || "",
                  });
                }}
                placeholder="Search and select your business address"
              />

              {addressError ? (
                <p className="text-sm text-destructive">{addressError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Tip: pick from the dropdown so we can verify the address.
                </p>
              )}
            </div>

            {shouldShowAddressInputs ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="onboarding-street-address">Street address</Label>
                  <Input
                    id="onboarding-street-address"
                    name="streetAddress"
                    placeholder="Street address (auto-filled after selection)"
                    spellCheck={false}
                    value={formData.streetAddress}
                    onChange={(e) =>
                      updateFormData({
                        streetAddress: e.target.value,
                        homeBaseLocation: undefined,
                        marketLocation: null,
                      })
                    }
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="onboarding-city">City</Label>
                    <Input
                      id="onboarding-city"
                      name="city"
                      placeholder="City"
                      spellCheck={false}
                      value={formData.city}
                      onChange={(e) =>
                        updateFormData({
                          city: e.target.value,
                          homeBaseLocation: undefined,
                          marketLocation: null,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="onboarding-state">State</Label>
                    <Input
                      id="onboarding-state"
                      name="state"
                      placeholder="State"
                      spellCheck={false}
                      value={formData.state}
                      onChange={(e) =>
                        updateFormData({
                          state: e.target.value,
                          homeBaseLocation: undefined,
                          marketLocation: null,
                        })
                      }
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="onboarding-zip">Zip</Label>
                  <Input
                    id="onboarding-zip"
                    name="zipCode"
                    placeholder="Zip"
                    spellCheck={false}
                    value={formData.zipCode}
                    onChange={(e) =>
                      updateFormData({
                        zipCode: e.target.value,
                        homeBaseLocation: undefined,
                        marketLocation: null,
                      })
                    }
                    required
                  />
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Select a business address above to auto-fill street, city, state, and zip.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="onboarding-business-phone">Business phone</Label>
                <Input
                  id="onboarding-business-phone"
                  name="businessPhone"
                  placeholder="Business phone"
                  spellCheck
                  value={formData.businessPhone}
                  onChange={(e) => updateFormData({ businessPhone: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="onboarding-business-email">Business email</Label>
                <Input
                  id="onboarding-business-email"
                  name="businessEmail"
                  placeholder="Business email"
                  spellCheck
                  value={formData.businessEmail}
                  onChange={(e) => updateFormData({ businessEmail: e.target.value })}
                  type="email"
                  required
                />
              </div>
            </div>
            </div>

            <div
              className="space-y-4 rounded-2xl border border-[rgba(154,172,180,0.55)] bg-[#ffffff] p-6 lg:col-[3/4]"
            >
              <div className="space-y-2">
                <Label htmlFor="onboarding-about-business">About the business </Label>
                <Textarea
                  id="onboarding-about-business"
                  name="aboutBusiness"
                  placeholder="About the business (optional)"
                  spellCheck
                  value={formData.aboutBusiness}
                  onChange={(e) => updateFormData({ aboutBusiness: e.target.value })}
                  rows={4}
                />
              </div>

              <div className="space-y-4 lg:mt-[7.5rem]">
                <div className="space-y-2">
                  <Label htmlFor="onboarding-shop-tagline">Tagline</Label>
                  <Input
                    id="onboarding-shop-tagline"
                    spellCheck
                    value={formData.shopTagline}
                    onChange={(event) => updateFormData({ shopTagline: event.target.value })}
                    placeholder="Example: Making your events unforgettable, one detail at a time."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="onboarding-shop-in-business-since">In Business Since (Year)</Label>
                  <Input
                    id="onboarding-shop-in-business-since"
                    spellCheck
                    value={formData.inBusinessSinceYear}
                    onChange={(event) =>
                      updateFormData({
                        inBusinessSinceYear: normalizeInBusinessSinceYearInput(event.target.value, currentYear),
                      })
                    }
                    placeholder="Example: 2018"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="onboarding-shop-specialties">Specialties</Label>
                  <HobbyPillInput
                    id="onboarding-shop-specialties"
                    value={formData.specialties}
                    onChange={(nextSpecialties) => updateFormData({ specialties: nextSpecialties })}
                    placeholder="Type a specialty and press Enter"
                    spellCheck
                    pillClassName="border-[#E07A6A] bg-[#E07A6A] text-[#ffffff]"
                    pillRemoveButtonClassName="text-[#ffffff]/80 hover:text-[#ffffff]"
                    addButtonClassName="editorial-search-btn editorial-search-btn-white-text"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="onboarding-shop-events-baseline">Events Served To Date</Label>
                  <Input
                    id="onboarding-shop-events-baseline"
                    spellCheck
                    value={formData.eventsServedBaseline}
                    onChange={(event) =>
                      updateFormData({ eventsServedBaseline: event.target.value.replace(/[^\d]/g, "") })
                    }
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
        </div>

        <div className="fixed bottom-0 left-24 right-0 z-30 bg-[#ffffff]/96 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-6 pt-4 pb-8 sm:px-12 lg:px-16">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              className="min-h-[2.7rem] px-6 font-sans text-[1.2rem] font-medium"
            >
              Back
            </Button>

            <Button
              type="submit"
              disabled={!isComplete}
              className="min-h-[2.7rem] px-6 font-sans text-[1.2rem] font-medium"
            >
              Next
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
