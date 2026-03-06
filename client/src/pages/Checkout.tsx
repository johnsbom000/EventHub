import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { ChevronLeft, Calendar, CheckCircle2, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LocationPicker } from "@/components/LocationPicker";
import type { LocationResult } from "@/types/location";
import { getListingRentalTypes } from "@/lib/rentalTypes";

type CheckoutRouteParams = { listingId: string };
type SavedCustomerLocation = {
  label: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  lat?: number;
  lng?: number;
};
type CheckoutDeliveryDraft = {
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  label?: string;
  lat?: number;
  lng?: number;
};
type CustomerEventOption = {
  id: string;
  title: string;
  bookingCount?: number;
  lastUsedAt?: string | null;
};
const CHECKOUT_DELIVERY_DRAFT_KEY = "eventhub.checkout.delivery_draft.v1";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizePhotoToUrl(photo: any): string | undefined {
  if (typeof photo === "string") {
    if (photo.startsWith("http://") || photo.startsWith("https://") || photo.startsWith("/")) return photo;
    return undefined;
  }
  if (photo && typeof photo === "object") {
    const url = photo.url;
    if (isNonEmptyString(url) && (url.startsWith("http") || url.startsWith("/"))) return url;
    const name = photo.name || photo.filename;
    if (isNonEmptyString(name)) return `/uploads/listings/${name}`;
  }
  return undefined;
}

function formatUsdFromCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

function parseAddressFromLabel(label: string): {
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

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseBooleanLike(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes";
  }
  if (typeof value === "number") return value === 1;
  return false;
}

const rawStripePublishableKey = ((import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined) || "").trim();
const stripePublishableKey = rawStripePublishableKey.startsWith("pk_") ? rawStripePublishableKey : "";
const CUSTOMER_FEE_RATE = 0.05;
const stripeConfigError =
  rawStripePublishableKey.length > 0 && !rawStripePublishableKey.startsWith("pk_")
    ? "Stripe publishable key is invalid. `VITE_STRIPE_PUBLISHABLE_KEY` must start with `pk_`."
    : null;
const stripePromise: Promise<import("@stripe/stripe-js").Stripe | null> = stripePublishableKey
  ? loadStripe(stripePublishableKey).catch((error) => {
      console.error("Failed to initialize Stripe.js", error);
      return null;
    })
  : Promise.resolve(null);

export default function CheckoutPage() {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutContent stripeConfigured={Boolean(stripePublishableKey)} stripeConfigError={stripeConfigError} />
    </Elements>
  );
}

function CheckoutContent({
  stripeConfigured,
  stripeConfigError,
}: {
  stripeConfigured: boolean;
  stripeConfigError: string | null;
}) {
  const [path, setLocation] = useLocation();
  const [, params] = useRoute<CheckoutRouteParams>("/checkout/:listingId");
  const listingId =
    params?.listingId ||
    (path.startsWith("/checkout/") ? path.replace("/checkout/", "").split("/")[0] : undefined);

  const searchParams = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, [path]);

  const initialDate = useMemo(() => {
    const raw = searchParams.get("date");
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return new Date().toISOString().split("T")[0];
  }, [searchParams]);

  const [eventDate, setEventDate] = useState(initialDate);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryState, setDeliveryState] = useState("");
  const [deliveryZip, setDeliveryZip] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState<LocationResult | null>(null);
  const [eventMode, setEventMode] = useState<"existing" | "new">("existing");
  const [selectedCustomerEventId, setSelectedCustomerEventId] = useState("");
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventQueuedTitle, setNewEventQueuedTitle] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [customerQuestions, setCustomerQuestions] = useState("");

  const [cardComplete, setCardComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const stripe = useStripe();
  const elements = useElements();
  const { isAuthenticated, loginWithRedirect, getAccessTokenSilently, user } = useAuth0();

  useEffect(() => {
    if (user?.email && !contactEmail) {
      setContactEmail(user.email);
    }
    if (user?.name && !contactName) {
      setContactName(user.name);
    }
  }, [user, contactEmail, contactName]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(CHECKOUT_DELIVERY_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as CheckoutDeliveryDraft;
      if (!draft || typeof draft !== "object") return;
      if (!draft.streetAddress && !draft.city && !draft.state && !draft.zipCode) return;

      setDeliveryAddress(draft.streetAddress || "");
      setDeliveryCity(draft.city || "");
      setDeliveryState(draft.state || "");
      setDeliveryZip(draft.zipCode || "");

      if (draft.label) {
        setDeliveryLocation({
          id: `draft-${draft.label}`,
          label: draft.label,
          lat: draft.lat,
          lng: draft.lng,
        } as unknown as LocationResult);
      }
    } catch {
      // Ignore local draft parse errors.
    }
  }, []);

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/listings/public", listingId],
    enabled: Boolean(listingId),
    queryFn: async () => {
      const res = await fetch(`/api/listings/public/${listingId}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Failed to load listing ${listingId}`);
      const raw = await res.json();
      const ld = (raw?.listingData ?? {}) as any;

      const photosFromObjects: string[] = Array.isArray(raw?.photos)
        ? raw.photos.map((p: any) => normalizePhotoToUrl(p)).filter((u: any) => typeof u === "string")
        : [];
      const photosFromListingData: string[] = Array.isArray(ld?.photos?.urls)
        ? ld.photos.urls.filter((u: any) => typeof u === "string")
        : Array.isArray(ld?.photos?.names)
          ? ld.photos.names
              .map((n: any) => (typeof n === "string" ? `/uploads/listings/${n}` : null))
              .filter(Boolean)
          : Array.isArray(ld?.photos)
            ? ld.photos.filter((u: any) => typeof u === "string")
            : [];
      const allPhotos = [...photosFromObjects, ...photosFromListingData].filter(Boolean);

      const rentalTypes = getListingRentalTypes(ld);
      const firstRentalType = rentalTypes[0] ?? null;
      const pricingRateCandidates = [
        ld?.pricing?.rate,
        firstRentalType ? ld?.pricing?.pricingByPropType?.[firstRentalType]?.rate : null,
        firstRentalType ? ld?.pricingByPropType?.[firstRentalType]?.rate : null,
        ld?.pricingByPropType?.__listing__?.rate,
        ld?.rate,
        raw?.price,
      ];
      const pricingRate =
        pricingRateCandidates
          .map((v) => parseOptionalNumber(v))
          .find((v) => typeof v === "number" && Number.isFinite(v) && v > 0) ?? null;
      const priceCents = pricingRate != null ? Math.max(1, Math.round(pricingRate * 100)) : null;

      const tags: string[] = Array.isArray(ld?.tagsByPropType?.__listing__)
        ? ld.tagsByPropType.__listing__.map((t: any) => t?.label).filter(Boolean)
        : [];
      const included = [...tags, ...rentalTypes].filter((x) => typeof x === "string");

      const deliveryIncluded = parseBooleanLike(
        ld?.deliverySetup?.deliveryIncluded ?? ld?.deliveryIncluded ?? ld?.logistics?.deliveryIncluded
      );

      return {
        id: raw?.id ?? listingId,
        vendorId: raw?.vendorId ?? null,
        vendorName: raw?.vendorName ?? raw?.vendor?.businessName ?? "Vendor",
        title: ld?.listingTitle ?? raw?.title ?? "Listing",
        description: ld?.listingDescription ?? "",
        priceCents,
        included,
        photos: allPhotos,
        deliveryIncluded,
      };
    },
  });

  const { data: customerMe } = useQuery<{ defaultLocation?: SavedCustomerLocation | null }>({
    queryKey: ["/api/customer/me", "checkout-default-location"],
    enabled: Boolean(isAuthenticated),
    queryFn: async () => {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: "https://eventhub-api",
          scope: "openid profile email",
        },
      });

      const res = await fetch("/api/customer/me", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) throw new Error("Failed to load customer profile");
      return res.json();
    },
    staleTime: 60_000,
    retry: false,
  });
  const { data: customerEvents = [] } = useQuery<CustomerEventOption[]>({
    queryKey: ["/api/customer/events", "checkout-event-options"],
    enabled: Boolean(isAuthenticated),
    queryFn: async () => {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: "https://eventhub-api",
          scope: "openid profile email",
        },
      });

      const res = await fetch("/api/customer/events", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) throw new Error("Failed to load customer events");
      return res.json();
    },
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (!Array.isArray(customerEvents) || customerEvents.length === 0) {
      setEventMode("new");
      setSelectedCustomerEventId("");
      return;
    }
    if (eventMode === "new") return;
    const selectedStillExists = customerEvents.some((evt) => evt.id === selectedCustomerEventId);
    if (eventMode === "existing" && selectedStillExists) return;
    if (!selectedStillExists) {
      setEventMode("existing");
      setSelectedCustomerEventId(customerEvents[0].id);
    }
  }, [customerEvents, selectedCustomerEventId, eventMode]);

  useEffect(() => {
    if (eventMode !== "new") {
      setNewEventQueuedTitle("");
    }
  }, [eventMode]);

  useEffect(() => {
    if (!data?.deliveryIncluded) return;
    const saved = customerMe?.defaultLocation;
    if (!saved) return;
    if (deliveryAddress || deliveryCity || deliveryState || deliveryZip) return;

    setDeliveryAddress(saved.streetAddress || "");
    setDeliveryCity(saved.city || "");
    setDeliveryState(saved.state || "");
    setDeliveryZip(saved.zipCode || "");

    if (saved.label) {
      setDeliveryLocation({
        id: `saved-${saved.label}`,
        label: saved.label,
        lat: saved.lat,
        lng: saved.lng,
      } as unknown as LocationResult);
    }
  }, [
    customerMe?.defaultLocation,
    data?.deliveryIncluded,
    deliveryAddress,
    deliveryCity,
    deliveryState,
    deliveryZip,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hasAnyValue =
      Boolean(deliveryAddress) ||
      Boolean(deliveryCity) ||
      Boolean(deliveryState) ||
      Boolean(deliveryZip);

    if (!hasAnyValue) {
      window.localStorage.removeItem(CHECKOUT_DELIVERY_DRAFT_KEY);
      return;
    }

    const draft: CheckoutDeliveryDraft = {
      streetAddress: deliveryAddress,
      city: deliveryCity,
      state: deliveryState,
      zipCode: deliveryZip,
      label:
        (deliveryLocation as any)?.label ||
        [deliveryAddress, deliveryCity, `${deliveryState} ${deliveryZip}`.trim()]
          .filter(Boolean)
          .join(", "),
      lat: (deliveryLocation as any)?.lat,
      lng: (deliveryLocation as any)?.lng,
    };

    window.localStorage.setItem(CHECKOUT_DELIVERY_DRAFT_KEY, JSON.stringify(draft));
  }, [deliveryAddress, deliveryCity, deliveryState, deliveryZip, deliveryLocation]);

  const canSubmit =
    Boolean(listingId) &&
    Boolean(data?.priceCents) &&
    Boolean(eventDate) &&
    Boolean(contactEmail) &&
    stripeConfigured &&
    !stripeConfigError &&
    Boolean(stripe) &&
    Boolean(elements) &&
    cardComplete &&
    Boolean(
      eventMode === "existing"
        ? selectedCustomerEventId
        : newEventTitle.trim().length > 0
    ) &&
    !isSubmitting &&
    (!data?.deliveryIncluded || (deliveryAddress && deliveryCity && deliveryState && deliveryZip));
  const customerFeeAmount = Math.round((data?.priceCents || 0) * CUSTOMER_FEE_RATE);
  const customerTotal = (data?.priceCents || 0) + customerFeeAmount;

  async function handleSubmitOrder() {
    setSubmitError(null);

    if (!listingId || !data) return;

    if (!isAuthenticated) {
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      try {
        await loginWithRedirect({
          appState: { returnTo },
        });
      } catch (error: any) {
        setSubmitError(error?.message || "Unable to start login. Please try again.");
      }
      return;
    }

    if (!stripeConfigured || stripeConfigError) {
      setSubmitError(stripeConfigError || "Stripe frontend key is missing. Add VITE_STRIPE_PUBLISHABLE_KEY.");
      return;
    }
    if (!stripe || !elements) {
      setSubmitError("Payment form is still loading. Please try again.");
      return;
    }
    if (!data.priceCents || data.priceCents <= 0) {
      setSubmitError("This listing does not have a valid price.");
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setSubmitError("Card field is not available.");
      return;
    }

    setIsSubmitting(true);
    try {
      const pmResult = await stripe.createPaymentMethod({
        type: "card",
        card: cardElement,
        billing_details: {
          name: contactName || undefined,
          email: contactEmail || undefined,
          address:
            data.deliveryIncluded && deliveryAddress
              ? {
                  line1: deliveryAddress,
                  city: deliveryCity || undefined,
                  state: deliveryState || undefined,
                  postal_code: deliveryZip || undefined,
                  country: "US",
                }
              : undefined,
        },
      });
      if (pmResult.error || !pmResult.paymentMethod?.id) {
        throw new Error(pmResult.error?.message || "Unable to collect payment information");
      }

      const eventLocation =
        data.deliveryIncluded && deliveryAddress
          ? `${deliveryAddress}, ${deliveryCity}, ${deliveryState} ${deliveryZip}`.trim()
          : undefined;

      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: "https://eventhub-api",
          scope: "openid profile email",
        },
      });

      if (data.deliveryIncluded && deliveryAddress && deliveryCity && deliveryState && deliveryZip) {
        const defaultLocation: SavedCustomerLocation = {
          label: [deliveryAddress, deliveryCity, `${deliveryState} ${deliveryZip}`].filter(Boolean).join(", "),
          streetAddress: deliveryAddress,
          city: deliveryCity,
          state: deliveryState,
          zipCode: deliveryZip,
          lat: (deliveryLocation as any)?.lat,
          lng: (deliveryLocation as any)?.lng,
        };

        await fetch("/api/customer/me", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ defaultLocation }),
        }).catch(() => undefined);
      }

      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          listingId: data.id,
          vendorId: data.vendorId,
          eventDate,
          eventLocation,
          customerEventId: eventMode === "existing" ? selectedCustomerEventId : undefined,
          customerEventTitle: eventMode === "new" ? newEventTitle.trim() : undefined,
          specialRequests: customerNotes?.trim() || undefined,
          customerNotes: customerNotes?.trim() || undefined,
          customerQuestions: customerQuestions?.trim() || undefined,
          paymentMethodId: pmResult.paymentMethod.id,
          finalPaymentStrategy: "immediately",
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Checkout failed");
      }

      setLocation("/dashboard/events");
    } catch (e: any) {
      setSubmitError(e?.message || "Checkout failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!listingId) return <div className="p-6">Missing listing id</div>;
  if (isLoading) return <div className="p-6">Loading checkout…</div>;
  if (error) return <div className="p-6">Error loading checkout</div>;
  if (!data) return <div className="p-6">Listing not found</div>;

  const cover = data.photos?.[0];

  return (
    <div className="w-full min-h-[calc(100vh-64px)]">
      <div className="mx-auto w-[75vw] max-w-[1600px] min-w-[980px] px-8 py-8">
      <button
        onClick={() => setLocation(`/listing/${listingId}`)}
        className="flex items-center text-muted-foreground hover:text-foreground mb-6"
      >
        <ChevronLeft className="w-5 h-5 mr-1" />
        Back to listing
      </button>

    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_560px] gap-10">
      {/* LEFT: Billing + Payment */}
      <div className="space-y-10">
        {/* Billing Details */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Billing Details</h2>

          <div className="rounded-2xl border border-border bg-background p-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="contact-name">Full name</Label>
              <Input
                id="contact-name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="jane@email.com"
              />
            </div>

            {data.deliveryIncluded ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="delivery-line1">Delivery address</Label>
                  <LocationPicker
                    value={deliveryLocation}
                    onChange={(loc) => {
                      setDeliveryLocation(loc);
                      if (!loc) {
                        setDeliveryAddress("");
                        setDeliveryCity("");
                        setDeliveryState("");
                        setDeliveryZip("");
                        return;
                      }

                      const label = (loc as any).label || (loc as any).place_name || "";
                      const parsed = parseAddressFromLabel(label);

                      setDeliveryAddress(parsed.streetAddress || label);
                      setDeliveryCity((loc as any).city || parsed.city || "");
                      setDeliveryState((loc as any).state || parsed.state || "");
                      setDeliveryZip((loc as any).zipCode || parsed.zipCode || "");
                    }}
                    placeholder="Start typing your delivery address"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="delivery-city">City</Label>
                    <Input
                      id="delivery-city"
                      value={deliveryCity}
                      onChange={(e) => setDeliveryCity(e.target.value)}
                      placeholder="City"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="delivery-zip">Zip/Postal Code</Label>
                    <Input
                      id="delivery-zip"
                      value={deliveryZip}
                      onChange={(e) => setDeliveryZip(e.target.value)}
                      placeholder="ZIP"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="delivery-state">State</Label>
                  <Input
                    id="delivery-state"
                    value={deliveryState}
                    onChange={(e) => setDeliveryState(e.target.value)}
                    placeholder="State"
                  />
                </div>
              </>
            ) : null}
          </div>
        </section>

        {/* Booking Notes */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Event</h2>

          <div className="rounded-2xl border border-border bg-background p-6 space-y-5 mb-8">
            {customerEvents.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="existing-event">Add to existing event</Label>
                <Select
                  value={selectedCustomerEventId || undefined}
                  onValueChange={(value) => {
                    setEventMode("existing");
                    setSelectedCustomerEventId(value);
                    setNewEventQueuedTitle("");
                  }}
                >
                  <SelectTrigger id="existing-event" className="h-11 w-full text-sm">
                    <SelectValue placeholder="Select an event" />
                  </SelectTrigger>
                  <SelectContent>
                    {customerEvents.map((evt) => (
                      <SelectItem key={evt.id} value={evt.id}>
                        {evt.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Create your first event</div>
            )}

            <div className="space-y-2">
              <Label htmlFor="new-event-title">Event name</Label>
              <Input
                id="new-event-title"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                placeholder="Ex: Maddie and Joshes Wedding"
              />
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant={newEventTitle.trim().length > 0 ? "default" : "outline"}
                className={
                  newEventTitle.trim().length > 0
                    ? "bg-primary text-primary-foreground border border-primary-border hover:bg-primary/90"
                    : undefined
                }
                disabled={newEventTitle.trim().length === 0}
                onClick={() => {
                  const nextTitle = newEventTitle.trim();
                  if (!nextTitle) return;
                  setEventMode("new");
                  setSelectedCustomerEventId("");
                  setNewEventQueuedTitle(nextTitle);
                }}
              >
                Create New Event
              </Button>
              {eventMode === "new" && newEventQueuedTitle ? (
                <span className="text-sm text-primary">
                  {data.title} will be added to {newEventQueuedTitle}.
                </span>
              ) : null}
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Notes and Questions</h2>

          <div className="rounded-2xl border border-border bg-background p-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="customer-notes">Notes for vendor</Label>
              <Textarea
                id="customer-notes"
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                placeholder="Add setup notes, preferences, venue rules, etc."
                className="min-h-[110px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-questions">Questions for vendor</Label>
              <Textarea
                id="customer-questions"
                value={customerQuestions}
                onChange={(e) => setCustomerQuestions(e.target.value)}
                placeholder="Ask any questions you want the vendor to answer."
                className="min-h-[110px]"
              />
            </div>
          </div>
        </section>

        {/* Payment Information */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Payment Information</h2>

          <div className="rounded-2xl border border-border bg-background p-6 space-y-4">
            <div className="space-y-2">
              <Label>Card Number</Label>
              <div className="rounded-md border border-border p-3">
                <CardElement
                  options={{ hidePostalCode: true, disableLink: true }}
                  onChange={(event) => {
                    setCardComplete(Boolean(event.complete));
                    if (event.error?.message) setSubmitError(event.error.message);
                    else if (submitError && submitError.toLowerCase().includes("card")) setSubmitError(null);
                  }}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">Use Stripe test card `4242 4242 4242 4242`.</p>

            {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}

            {!stripeConfigured || stripeConfigError ? (
              <p className="text-sm text-red-600">
                {stripeConfigError || "Stripe is not configured for checkout. Add `VITE_STRIPE_PUBLISHABLE_KEY`."}
              </p>
            ) : null}
          </div>
        </section>
      </div>

      {/* RIGHT: Order Summary */}
      <aside className="lg:sticky lg:top-8 h-fit space-y-6">
        <div className="rounded-2xl border border-border bg-background p-6">
          <h2 className="text-xl font-semibold mb-4">Order Summary</h2>

          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0">
                  {cover ? <img src={cover} alt={data.title} className="w-full h-full object-cover" /> : null}
                </div>
                <div>
                  <div className="font-medium leading-tight">{data.title}</div>
                  <div className="text-sm text-muted-foreground">{data.vendorName}</div>
                  <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>{eventDate}</span>
                  </div>
                  {data.deliveryIncluded ? (
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      <span>Delivery Included</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="text-right">
                <div className="font-medium">{formatUsdFromCents(data.priceCents || 0)}</div>
              </div>
            </div>

            <div className="border-t border-border" />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Sub total</span>
                <span className="font-medium">{formatUsdFromCents(data.priceCents || 0)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Service fee (5%)</span>
                <span className="font-medium">{formatUsdFromCents(customerFeeAmount)}</span>
              </div>

              <div className="border-t border-border pt-4 flex items-end justify-between">
                <div>
                  <div className="text-xl font-semibold">Total</div>
                  <div className="text-xs text-muted-foreground">Taxes calculated later</div>
                </div>
                <div className="text-3xl font-bold">{formatUsdFromCents(customerTotal)}</div>
              </div>

              <Button
                className="w-full h-12 text-base"
                disabled={!canSubmit}
                onClick={handleSubmitOrder}
                data-testid="button-place-order"
              >
                {isSubmitting ? "Processing..." : `Pay ${formatUsdFromCents(customerTotal)}`}
              </Button>
            </div>
          </div>
        </div>
      </aside>
    </div>
    </div>
    </div>
  );
}
