import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LocationPicker } from "@/components/LocationPicker";
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
    aboutBusiness: string;

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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Business Details</h1>

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isComplete) return;
          onNext();
        }}
      >
        <div className="space-y-3">
          <Input
            name="businessName"
            placeholder="Business name"
            value={formData.businessName}
            onChange={(e) => updateFormData({ businessName: e.target.value })}
            required
          />

          <div className="space-y-2">
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

                // Debug (keep for now; remove later)
                console.log("LocationPicker loc:", loc);

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

          <Input
            name="streetAddress"
            placeholder="Street address (auto-filled after selection)"
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

          <div className="grid grid-cols-2 gap-3">
            <Input
              name="city"
              placeholder="City"
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
            <Input
              name="state"
              placeholder="State"
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

          <div className="grid grid-cols-2 gap-3">
            <Input
              name="zipCode"
              placeholder="Zip"
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

            <Input
              name="businessPhone"
              placeholder="Business phone"
              value={formData.businessPhone}
              onChange={(e) => updateFormData({ businessPhone: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Input
              name="businessEmail"
              placeholder="Business email"
              value={formData.businessEmail}
              onChange={(e) => updateFormData({ businessEmail: e.target.value })}
              type="email"
              required
            />
          </div>

          <div className="space-y-2">
            <Textarea
              name="aboutBusiness"
              placeholder="About the business (optional)"
              value={formData.aboutBusiness}
              onChange={(e) => updateFormData({ aboutBusiness: e.target.value })}
              rows={4}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>

          <Button type="submit" disabled={!isComplete}>
            Next
          </Button>
        </div>
      </form>
    </div>
  );
}
