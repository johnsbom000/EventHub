import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
 Check,
 ClipboardList,
 DollarSign,
 ImageIcon,
 MapPin,
 Paperclip,
 Sparkles,
 Truck,
} from "lucide-react";
import { ListingTypeSelector } from "./ListingTypeSelector";
import { BasicsStep } from "./steps/BasicsStep";
import { PerfectForStep } from "./steps/PerfectForStep";
import { BookingPricingStep } from "./steps/BookingPricingStep";
import { ServiceAreaStep } from "./steps/ServiceAreaStep";
import { LogisticsStep } from "./steps/LogisticsStep";
import { MediaStep } from "./steps/MediaStep";
import { AttachAddonsStep } from "./steps/AttachAddonsStep";
import { AttachToListingsStep } from "./steps/AttachToListingsStep";
import { PackagesStep } from "./steps/PackagesStep";
import type { ListingType } from "./wizardTypes";
import { getStepsForListingType } from "./wizardTypes";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import { useAuth0 } from "@auth0/auth0-react";
import AuthModal from "@/components/AuthModal";
import Navigation from "@/components/Navigation";
import { type ListingPhotoCrop } from "@/components/listings/InlinePhotoEditor";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getFreshAccessToken } from "@/lib/authToken";
import { buildListingLogisticsPayload, isDeliveryCategory, isTravelCategory } from "@/lib/listingLogistics";
import { DEFAULT_COVER_RATIO, type CoverRatio } from "@/lib/listingPhotos";
import { getPublishFailureToastContent, isStripeNotConfiguredError, isListingLimitReachedError, isOnboardingIncompleteError } from "@/lib/publishFailureToast";
import { UpgradeModal } from "@/components/UpgradeModal";
import { StripeSetupModal } from "@/components/StripeSetupModal";
import { OnboardingRequiredModal } from "@/components/OnboardingRequiredModal";
import { apiRequest, getApiErrorStatus, queryClient } from "@/lib/queryClient";
import { trackListingPublishedOnce } from "@/lib/tracking";
import { cn } from "@/lib/utils";
import type { LocationResult } from "@/types/location";
import { POPULAR_FOR_OPTIONS } from "@/constants/eventTypes";

const MAPBOX_TOKEN =
 (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ??
 (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined) ??
 "";

const LISTING_TAG_KEY = "__listing__";
const MIN_PHOTOS_FOR_PUBLISH = 3;
const DESCRIPTION_MAX_CHARS = 1000;
const CREATE_LISTING_STORAGE_KEY = "createListingWizard:v1";
const TEMP_UPLOADING_PHOTO_PREFIX = "__uploading__-";
const AUTH_LOGIN_REQUIRED_ERROR = "AUTH_LOGIN_REQUIRED";
const AUTH_REQUIRED_MESSAGE_PATTERNS = [
 "login required",
 "login_required",
 "unauthorized",
 "forbidden",
 "not authenticated",
 "authentication required",
 "invalid token",
 "jwt",
 "missing authorization bearer token",
 "no token provided",
 "missing or invalid refresh token",
 "consent required",
 AUTH_LOGIN_REQUIRED_ERROR.toLowerCase(),
];

const CATEGORY_OPTIONS = [
 { value: "Rental", label: "Rental" },
 { value: "Service", label: "Service" },
 { value: "Venue", label: "Venue" },
 { value: "Catering", label: "Caterer" },
] as const;

type ListingCategory = (typeof CATEGORY_OPTIONS)[number]["value"];
type ListingHelperCategory = "rental" | "venue" | "service" | "caterer";
type StepId = "basics" | "perfectFor" | "packages" | "bookingPricing" | "serviceArea" | "logistics" | "media" | "attachAddons" | "attachToListings";
type PricingUnit = "per_day" | "per_hour";
type BookingType = "instant" | "request";
type TravelFeeType = "flat" | "variable";
type CancellationPolicy = "cancel_anytime" | "cancel_within_hours" | "no_cancellations";
type DimensionUnit = "inches" | "feet" | "meters" | "centimeters";

type ListingTag = { label: string; slug: string };

type ListingDraft = {
 category: ListingCategory | "";
 subcategory: string;
 subcategoryDetail: string;
 listingTitle: string;
 listingDescription: string;
 whatsIncluded: string[];
 whatsNotIncluded: string[];
 tagsByPropType: Record<string, ListingTag[]>;
 popularFor: string[];

 bookingType: BookingType;
 pricingUnit: PricingUnit;
 rate: string;
 quantity: string;
 dimensionUnit: DimensionUnit;
 dimensionWidth: string;
 dimensionLength: string;
 dimensionHeight: string;

 serviceAreaMode: "radius";
 serviceRadiusMiles: number;
 servesOutsideRadius: boolean;
 serviceLocation: LocationResult | null;
 serviceCenter: { lat: number; lng: number } | null;
 serviceStreetAddress: string;
 serviceCity: string;
 serviceState: string;
 serviceZip: string;

 travelOffered: boolean;
 travelFeeEnabled: boolean;
 travelFeeType: TravelFeeType;
 travelFeeAmount: string;

 deliveryIncluded: boolean;
 deliveryFeeEnabled: boolean;
 deliveryFeeAmount: string;

 setupIncluded: boolean;
 setupFeeEnabled: boolean;
 setupFeeAmount: string;
 takedownIncluded: boolean;
 takedownFeeEnabled: boolean;
 takedownFeeAmount: string;

 cancellationPolicy: CancellationPolicy;
 cancellationPolicyHours: string;

 securityDepositEnabled: boolean;
 securityDepositAmount: string;

 allowPreBookingContact: boolean;

 photoPreviews: string[];
 photoNames: string[];
 coverPhotoRatio: CoverRatio;
 photoCropsByName: Record<string, ListingPhotoCrop>;

 videoNames: string[];
};

const DEFAULT_DRAFT: ListingDraft = {
 category: "",
 subcategory: "",
 subcategoryDetail: "",
 listingTitle: "",
 listingDescription: "",
 whatsIncluded: [],
 whatsNotIncluded: [],
 tagsByPropType: {},
 popularFor: [],

 bookingType: "instant",
 pricingUnit: "per_day",
 rate: "",
 quantity: "1",
 dimensionUnit: "inches",
 dimensionWidth: "",
 dimensionLength: "",
 dimensionHeight: "",

 serviceAreaMode: "radius",
 serviceRadiusMiles: 30,
 servesOutsideRadius: false,
 serviceLocation: null,
 serviceCenter: null,
 serviceStreetAddress: "",
 serviceCity: "",
 serviceState: "",
 serviceZip: "",

 travelOffered: false,
 travelFeeEnabled: false,
 travelFeeType: "flat",
 travelFeeAmount: "",

 deliveryIncluded: false,
 deliveryFeeEnabled: false,
 deliveryFeeAmount: "",

 setupIncluded: false,
 setupFeeEnabled: false,
 setupFeeAmount: "",
 takedownIncluded: false,
 takedownFeeEnabled: false,
 takedownFeeAmount: "",

 cancellationPolicy: "cancel_anytime",
 cancellationPolicyHours: "48",

 securityDepositEnabled: false,
 securityDepositAmount: "",

 allowPreBookingContact: false,

 photoPreviews: [],
 photoNames: [],
 coverPhotoRatio: DEFAULT_COVER_RATIO,
 photoCropsByName: {},

 videoNames: [],
};

const STEP_META: Record<
 StepId,
 {
 icon: typeof ClipboardList;
 description: string;
 }
> = {
 basics: {
 icon: ClipboardList,
 description: "Core listing info.",
 },
 perfectFor: {
 icon: Sparkles,
 description: "Optional event fit.",
 },
 packages: {
 icon: DollarSign,
 description: "Define your package tiers.",
 },
 bookingPricing: {
 icon: DollarSign,
 description: "Booking behavior and rates.",
 },
 serviceArea: {
 icon: MapPin,
 description: "Coverage center and radius.",
 },
 logistics: {
 icon: Truck,
 description: "Travel, delivery, setup.",
 },
 media: {
 icon: ImageIcon,
 description: "Publish-ready photos.",
 },
 attachAddons: {
 icon: Paperclip,
 description: "Optional upgrades for customers.",
 },
 attachToListings: {
 icon: Paperclip,
 description: "Offer this add-on on your listings.",
 },
};

const DIMENSION_UNIT_OPTIONS: Array<{ value: DimensionUnit; label: string }> = [
 { value: "inches", label: "Inches" },
 { value: "feet", label: "Feet" },
 { value: "meters", label: "Meters" },
 { value: "centimeters", label: "Centimeters" },
];

const PERFECT_FOR_EMOJI: Record<string, string> = {
 Weddings: "💍",
 Corporate: "🏢",
 "Baby Showers": "🍼",
 Photoshoots: "📸",
 Birthdays: "🎂",
 "Bridal Showers": "👰",
 Graduations: "🎓",
 "Holiday Parties": "🎉",
 Concert: "🎵",
 Proposal: "💐",
 "Bachelor Party": "🍻",
 "Bachelorette Party": "💃",
 Anniversary: "❤️",
 "Gender Reveal": "🎈",
 Quinceañera: "👑",
 Baptism: "🙏",
 Funeral: "🕊️",
 Reunion: "🤝",
 Conference: "🗂️",
 Sporting: "🏅",
 "School Dance": "🪩",
 Other: "✨",
};

const CATEGORY_HELPER_TEXT: Record<
 ListingHelperCategory,
 { description: string; included: string; tags: string }
> = {
 rental: {
 description:
 "Describe the style, condition, materials, dimensions, and how this rental is typically used.",
 included:
 "Clarify exactly what the customer gets: pieces, quantities, color/style notes, and exclusions.",
 tags: "Examples: material, color, decor style, event type.",
 },
 venue: {
 description:
 "Describe the space, atmosphere, capacity, layout, and types of events hosted.",
 included:
 "Clarify what comes with the venue: tables, chairs, prep areas, parking, and restrictions.",
 tags: "Examples: indoor, outdoor, capacity, wedding venue.",
 },
 service: {
 description:
 "Describe what you do, your experience, and what customers should expect.",
 included:
 "Clarify what is included: hours, setup time, travel radius, and equipment.",
 tags: "Examples: DJ, photography, coordination, lighting.",
 },
 caterer: {
 description:
 "Describe your food style, specialties, and service style (buffet, plated, drop-off).",
 included:
 "Clarify what is included: food quantity, staff, utensils, setup, cleanup.",
 tags: "Examples: cuisine type, buffet, desserts, dietary options.",
 },
};

function toHelperCategory(category: ListingCategory | ""): ListingHelperCategory {
 if (category === "Venue") return "venue";
 if (category === "Service") return "service";
 if (category === "Catering") return "caterer";
 return "rental";
}

function normalizeTag(raw: string): ListingTag | null {
 const trimmed = (raw ?? "").trim();
 if (!trimmed) return null;

 const cleaned = trimmed.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, " ").trim();
 if (!cleaned) return null;

 const capped = cleaned.slice(0, 30);
 const label = capped
 .split(" ")
 .filter(Boolean)
 .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
 .join(" ");

 const slug = label.toLowerCase().replace(/\s+/g, "-").replace(/-+/g, "-").trim();
 if (!slug) return null;
 return { label, slug };
}

function normalizeIncludedBullet(raw: string): string {
 const cleaned = (raw ?? "")
 .replace(/[^a-zA-Z0-9\s&/,'-]/g, "")
 .replace(/\s+/g, " ")
 .trim()
 .replace(/[.]+$/g, "")
 .trim()
 .slice(0, 100);

 if (!cleaned) return "";

 return cleaned
 .split(" ")
 .filter(Boolean)
 .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
 .join(" ");
}

function normalizeTitleInput(raw: string, maxLen: number): string {
 const cleaned = (raw ?? "")
 .replace(/\s+/g, " ")
 .slice(0, maxLen);

 // Force first letter of each word segment to uppercase.
 return cleaned.replace(/(^|[\s/-])([a-z])/g, (_, prefix: string, char: string) => `${prefix}${char.toUpperCase()}`);
}

function normalizeDimensionInput(raw: unknown): string {
 const cleaned = String(raw ?? "").replace(/[^\d.]/g, "");
 if (!cleaned) return "";
 const firstDot = cleaned.indexOf(".");
 const normalized =
 firstDot === -1 ? cleaned : `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, "")}`;
 return normalized.slice(0, 9);
}

function parseDimensionNumber(raw: string): number | null {
 const value = Number(raw);
 return Number.isFinite(value) && value > 0 ? value : null;
}

function toMoneyCents(raw: string): number | null {
 const value = Number(raw);
 if (!Number.isFinite(value) || value < 0) return null;
 return Math.round(value * 100);
}

function parsePositiveInt(raw: string): number {
 const value = Math.floor(Number(raw));
 if (!Number.isFinite(value) || value < 1) return 1;
 return value;
}

function isPersistedPhotoName(value: unknown): value is string {
 return (
 typeof value === "string" &&
 value.trim().length > 0 &&
 !value.startsWith(TEMP_UPLOADING_PHOTO_PREFIX)
 );
}

function makeCircleGeoJSON(
 center: { lat: number; lng: number },
 radiusMiles: number,
 points = 64,
) {
 const radiusKm = radiusMiles * 1.60934;
 const earthRadiusKm = 6371;

 const lat = (center.lat * Math.PI) / 180;
 const lng = (center.lng * Math.PI) / 180;
 const coordinates: [number, number][] = [];

 for (let i = 0; i <= points; i += 1) {
 const bearing = (2 * Math.PI * i) / points;
 const lat2 = Math.asin(
 Math.sin(lat) * Math.cos(radiusKm / earthRadiusKm) +
 Math.cos(lat) * Math.sin(radiusKm / earthRadiusKm) * Math.cos(bearing),
 );
 const lng2 =
 lng +
 Math.atan2(
 Math.sin(bearing) * Math.sin(radiusKm / earthRadiusKm) * Math.cos(lat),
 Math.cos(radiusKm / earthRadiusKm) - Math.sin(lat) * Math.sin(lat2),
 );

 coordinates.push([lng2 * (180 / Math.PI), lat2 * (180 / Math.PI)]);
 }

 return {
 type: "Feature" as const,
 properties: { radiusMiles },
 geometry: {
 type: "Polygon" as const,
 coordinates: [coordinates],
 },
 };
}

function boundsFromCircleFeature(feature: any) {
 const ring: [number, number][] | undefined =
 feature?.geometry?.type === "Polygon" ? feature.geometry.coordinates?.[0] : undefined;
 if (!ring || ring.length === 0) return null;

 let minLng = ring[0][0];
 let maxLng = ring[0][0];
 let minLat = ring[0][1];
 let maxLat = ring[0][1];

 ring.forEach(([lng, lat]) => {
 if (lng < minLng) minLng = lng;
 if (lng > maxLng) maxLng = lng;
 if (lat < minLat) minLat = lat;
 if (lat > maxLat) maxLat = lat;
 });

 return new mapboxgl.LngLatBounds([minLng, minLat], [maxLng, maxLat]);
}

function isAuthRequiredError(error: unknown): boolean {
 const status = getApiErrorStatus(error);
 // Only a 401 means the session/token itself is bad — the API's auth layer
 // (requireAuth0) always responds 401 for token failures. 403s here are
 // business rules (onboarding_incomplete, listing_limit_reached,
 // account_suspended, …), so a 403 only counts as an auth error when its
 // body matches the message patterns below.
 if (status === 401) return true;

 const extractText = (value: unknown): string[] => {
 if (typeof value === "string") return [value];
 if (value instanceof Error) return [value.message];
 if (!value || typeof value !== "object") return [];

 const source = value as Record<string, unknown>;
 const nestedResponse =
 source.response && typeof source.response === "object"
 ? ((source.response as Record<string, unknown>).data as Record<string, unknown> | undefined)
 : undefined;

 const candidates: unknown[] = [
 source.message,
 source.error,
 source.description,
 source.code,
 source.error_description,
 source.status,
 source.statusCode,
 nestedResponse?.message,
 nestedResponse?.error,
 nestedResponse?.description,
 nestedResponse?.code,
 nestedResponse?.status,
 nestedResponse?.statusCode,
 source?.response && typeof source.response === "object"
 ? (source.response as Record<string, unknown>).status
 : undefined,
 ];

 return candidates
 .filter((candidate): candidate is string | number => typeof candidate === "string" || typeof candidate === "number")
 .map((candidate) => String(candidate));
 };

 return extractText(error)
 .map((value) => value.trim().toLowerCase())
 .filter(Boolean)
 .some((message) =>
 AUTH_REQUIRED_MESSAGE_PATTERNS.some((pattern) => message.includes(pattern))
 );
}

function ToggleGroup({
 value,
 onChange,
 trueLabel,
 falseLabel,
}: {
 value: boolean;
 onChange: (next: boolean) => void;
 trueLabel: string;
 falseLabel: string;
}) {
 return (
 <div className="inline-flex overflow-hidden rounded-lg border border-border">
 <button
 type="button"
 onClick={() => onChange(true)}
 className={[
 "px-4 py-2 text-sm font-medium transition",
 value
 ? "bg-primary text-primary-foreground"
 : "bg-background text-muted-foreground hover:bg-muted",
 ].join(" ")}
 >
 {trueLabel}
 </button>
 <button
 type="button"
 onClick={() => onChange(false)}
 className={[
 "border-l border-border px-4 py-2 text-sm font-medium transition",
 !value
 ? "bg-primary text-primary-foreground"
 : "bg-background text-muted-foreground hover:bg-muted",
 ].join(" ")}
 >
 {falseLabel}
 </button>
 </div>
 );
}

type UploadedListingPhoto = { filename: string; url: string; storagePath?: string };

export type CreateListingWizardProps = {
 onClose: () => void;
 editMode?: boolean;
 initialData?: any;
 /** Pre-sets the listing type and skips the type selection screen. */
 initialListingType?: ListingType;
 /** When set, this wizard is running as a nested add-on creator. After
  *  save/publish the new add-on is auto-linked to this listing ID. */
 parentListingId?: string;
 /** Fired after save or publish completes (before the wizard closes). */
 onComplete?: (newListingId: string) => void;
 /** Fired when a publish attempt fails because Stripe Connect is not configured. */
 onStripeRequired?: () => void;
};

export function CreateListingWizard({ onClose, initialListingType, parentListingId, onComplete, onStripeRequired }: CreateListingWizardProps) {
 const { toast } = useToast();
 const { isAuthenticated } = useAuth0();

 const { data: me } = useQuery({ queryKey: ["/api/vendor/me"] });
 const { data: vendorProfile } = useQuery({ queryKey: ["/api/vendor/profile"] });

 const vendorType = ((me as any)?.vendorType || "unspecified") as string;
 const hasProFeatures = Boolean((me as any)?.hasProFeatures);
 const [showUpgradeForAddon, setShowUpgradeForAddon] = useState(false);

 const [currentStep, setCurrentStep] = useState<StepId>("basics");
 const [maxStepReached, setMaxStepReached] = useState(0);
 const [draft, setDraft] = useState<ListingDraft>(DEFAULT_DRAFT);
 const [listingId, setListingId] = useState<string | null>(null);
 const [authModalOpen, setAuthModalOpen] = useState(false);
 const [listingType, setListingType] = useState<ListingType | null>(initialListingType ?? null);
 const [creatingAddon, setCreatingAddon] = useState(false);
 const steps = useMemo(() => getStepsForListingType(listingType), [listingType]);
 const [packageCount, setPackageCount] = useState(0);

 const [tagInput, setTagInput] = useState("");
 const [includedInput, setIncludedInput] = useState("");
 const [notIncludedInput, setNotIncludedInput] = useState("");

 const [isPublishing, setIsPublishing] = useState(false);
 const [isSavingDraft, setIsSavingDraft] = useState(false);
 const [attemptedStepAdvance, setAttemptedStepAdvance] = useState<Partial<Record<StepId, boolean>>>({});

 const createRequestedRef = useRef(false);
 const createDraftPromiseRef = useRef<Promise<any> | null>(null);
 const listingIdRef = useRef<string | null>(null);
 const pendingPayloadRef = useRef<any | null>(null);
 const pendingPayloadKeyRef = useRef<string | null>(null);
 const lastSuccessfulAutosaveKeyRef = useRef<string | null>(null);
 const blockedAutosaveKeyRef = useRef<string | null>(null);
 const saveInFlightRef = useRef(false);
 const publishInFlightRef = useRef(false);
 const authPromptShownRef = useRef(false);
 const activePhotoPreviewsRef = useRef<string[]>([]);

 const fileInputRef = useRef<HTMLInputElement | null>(null);

 const mapContainerRef = useRef<HTMLDivElement | null>(null);
 const mapRef = useRef<mapboxgl.Map | null>(null);
 const [isMapReady, setIsMapReady] = useState(false);
 const [mapError, setMapError] = useState<string | null>(null);

 useEffect(() => {
 if (typeof window === "undefined") return;
 window.localStorage.removeItem(CREATE_LISTING_STORAGE_KEY);
 }, []);

 const center = useMemo(() => {
 if (draft.serviceLocation) {
 return { lat: draft.serviceLocation.lat, lng: draft.serviceLocation.lng };
 }
 if (draft.serviceCenter) {
 return { lat: draft.serviceCenter.lat, lng: draft.serviceCenter.lng };
 }
 return null;
 }, [
 draft.serviceLocation?.lat,
 draft.serviceLocation?.lng,
 draft.serviceCenter?.lat,
 draft.serviceCenter?.lng,
 ]);

 const circleFeature = useMemo(() => {
 if (!center) return null;
 return makeCircleGeoJSON(center, draft.serviceRadiusMiles);
 }, [center, draft.serviceRadiusMiles]);

 const radiusFeatureCollection = useMemo(
 () => ({ type: "FeatureCollection" as const, features: circleFeature ? [circleFeature] : [] }),
 [circleFeature],
 );

 const centerFeatureCollection = useMemo(
 () => ({
 type: "FeatureCollection" as const,
 features: center
 ? [
 {
 type: "Feature" as const,
 properties: {},
 geometry: { type: "Point" as const, coordinates: [center.lng, center.lat] },
 },
 ]
 : [],
 }),
 [center],
 );

 const promptForSessionRecovery = (description = "Please sign in again to continue where you left off.") => {
 setAuthModalOpen(true);
 if (!authPromptShownRef.current) {
 toast({
 title: "Session expired",
 description,
 variant: "destructive",
 });
 authPromptShownRef.current = true;
 }
 };

 const handleAuthRequired = (error: unknown, description?: string): boolean => {
 if (!isAuthRequiredError(error)) return false;
 promptForSessionRecovery(description);
 return true;
 };

 useEffect(() => {
 const currentIndex = steps.findIndex((step) => step.id === currentStep);
 if (currentIndex < 0) return;
 setMaxStepReached((previous) => Math.max(previous, currentIndex));
 }, [currentStep, steps]);

 const createDraftMutation = useMutation({
 mutationFn: async (_variables?: { source?: "autosave" | "manual"; listingType?: string }) => {
 if (!isAuthenticated) {
 throw new Error(AUTH_LOGIN_REQUIRED_ERROR);
 }
 const res = await apiRequest("POST", "/api/vendor/listings", {
   listingData: {},
   listingType: _variables?.listingType ?? listingType ?? "single",
 });
 const json = await res.json();
 if (!res.ok) throw new Error(json?.error || "Failed to create draft");
 return json;
 },
 onSuccess: (payload: any) => {
 const id = payload?.id || payload?.data?.id;
 if (!id) return;
 listingIdRef.current = id;
 setListingId(id);
 createRequestedRef.current = false;
 pendingPayloadKeyRef.current = null;
 void queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings"] });

 if (pendingPayloadRef.current) {
 updateDraftMutation.mutate({ id, payload: pendingPayloadRef.current, source: "autosave" });
 pendingPayloadRef.current = null;
 }
 },
 onError: (error: any, variables) => {
 const shouldToast = blockedAutosaveKeyRef.current !== pendingPayloadKeyRef.current;
 createRequestedRef.current = false;
 if (pendingPayloadKeyRef.current) {
 blockedAutosaveKeyRef.current = pendingPayloadKeyRef.current;
 }
 if (handleAuthRequired(error, "Please sign in to keep editing your listing.")) {
 return;
 }
 if (variables?.source !== "autosave") {
 return;
 }
 if (shouldToast) {
 toast({
 title: "Unable to create draft",
 description: error?.message || "Please try again.",
 variant: "destructive",
 });
 }
 },
 });

 const updateDraftMutation = useMutation({
 mutationFn: async ({
 id,
 payload,
 }: {
 id: string;
 payload: any;
 source?: "autosave" | "manual";
 }) => {
 if (!isAuthenticated) {
 throw new Error(AUTH_LOGIN_REQUIRED_ERROR);
 }
 const res = await apiRequest("PATCH", `/api/vendor/listings/${id}`, { listingData: payload });
 const json = await res.json();
 if (!res.ok) throw new Error(json?.error || "Failed to update listing");
 return json;
 },
 onSuccess: (_data, variables) => {
 const payloadKey = JSON.stringify(variables.payload ?? {});
 lastSuccessfulAutosaveKeyRef.current = payloadKey;
 if (blockedAutosaveKeyRef.current === payloadKey) {
 blockedAutosaveKeyRef.current = null;
 }
 },
 onError: (error: any, variables) => {
 if (handleAuthRequired(error, "Please sign in to keep editing your listing.")) {
 return;
 }
 if (variables.source !== "autosave") {
 return;
 }

 const payloadKey = JSON.stringify(variables.payload ?? {});
 const shouldToast = blockedAutosaveKeyRef.current !== payloadKey;
 blockedAutosaveKeyRef.current = payloadKey;
 if (shouldToast) {
 toast({
 title: "Auto-save failed",
 description:
 error?.message ||
 "Unable to sync this draft right now. Keep editing, then try Save Draft again.",
 variant: "destructive",
 });
 }
 },
 });

 const stepIndex = useMemo(() => steps.findIndex((step) => step.id === currentStep), [steps, currentStep]);

 const showTravelSection = isTravelCategory(draft.category);
 const showDeliverySection = isDeliveryCategory(draft.category);
 const showSetupSection = draft.category === "Rental" || draft.category === "Venue" || draft.category === "Catering";
 const showTakedownSection = draft.category === "Rental" || draft.category === "Venue" || draft.category === "Catering";
 const showDimensionsSection = draft.category === "Rental";
 const bookingTypeRequired = draft.category === "Service" || draft.category === "Venue" || draft.category === "Catering";

 const listingTags = useMemo(() => draft.tagsByPropType[LISTING_TAG_KEY] ?? [], [draft.tagsByPropType]);
 const helperText = CATEGORY_HELPER_TEXT[toHelperCategory(draft.category)];
 const persistedPhotoNames = useMemo(
 () => draft.photoNames.filter((name) => isPersistedPhotoName(name)),
 [draft.photoNames],
 );

 const hasCategory = Boolean(draft.category);
 const hasTitle = draft.listingTitle.trim().length > 0;
 const hasDescription = draft.listingDescription.trim().length > 0;
 const hasPrice = Number(draft.rate) > 0;
 const isServiceCenterExact =
   Boolean(draft.serviceStreetAddress?.trim()) ||
   (draft.serviceLocation != null &&
     (!draft.serviceLocation.placeType ||
       draft.serviceLocation.placeType === "address" ||
       draft.serviceLocation.placeType === "poi" ||
       draft.serviceLocation.placeType === "pin"));
 const hasLocation =
   isServiceCenterExact &&
   Number.isFinite(Number(draft.serviceCenter?.lat)) &&
   Number.isFinite(Number(draft.serviceCenter?.lng)) &&
   Number(draft.serviceRadiusMiles) > 0;
 const hasMinPhotos = persistedPhotoNames.length >= MIN_PHOTOS_FOR_PUBLISH;
 const hasValidQuantity = draft.category !== "Rental" || parsePositiveInt(draft.quantity) > 0;

 const publishReady = listingType === "package_container"
   ? hasCategory && hasTitle && hasLocation && hasMinPhotos && packageCount >= 1
   : hasCategory && hasTitle && hasDescription && hasPrice && hasLocation && hasMinPhotos;

 const canContinue = useMemo(() => {
 if (currentStep === "basics") {
   const descriptionRequired = listingType !== "package_container";
   return hasCategory && hasTitle && (!descriptionRequired || hasDescription);
 }
 if (currentStep === "bookingPricing") return hasPrice && hasValidQuantity;
 if (currentStep === "serviceArea") return hasLocation;
 if (currentStep === "packages") return packageCount >= 1;
 return true;
 }, [currentStep, listingType, hasCategory, hasTitle, hasDescription, hasPrice, hasValidQuantity, hasLocation, packageCount]);

 const buildListingPayload = useMemo(() => {
 const quantity = parsePositiveInt(draft.quantity);
 const priceNumber = Number(draft.rate);
 const price = Number.isFinite(priceNumber) ? priceNumber : null;
 const dimensionWidth = showDimensionsSection ? parseDimensionNumber(draft.dimensionWidth) : null;
 const dimensionLength = showDimensionsSection ? parseDimensionNumber(draft.dimensionLength) : null;
 const dimensionHeight = showDimensionsSection ? parseDimensionNumber(draft.dimensionHeight) : null;
 const instantBookEnabled = draft.bookingType === "instant";

 const centerLat = draft.serviceCenter?.lat ?? draft.serviceLocation?.lat ?? null;
 const centerLng = draft.serviceCenter?.lng ?? draft.serviceLocation?.lng ?? null;

 return {
 vendorType,
 category: draft.category || undefined,
 subcategory: draft.subcategory || undefined,
 subcategoryDetail: draft.subcategoryDetail || undefined,
 listingTitle: draft.listingTitle.trim(),
 title: draft.listingTitle.trim(),
 listingDescription: draft.listingDescription.trim(),
 description: draft.listingDescription.trim(),
 whatsIncluded: draft.whatsIncluded,
 whatsNotIncluded: draft.whatsNotIncluded,
 tagsByPropType: {
 ...(draft.tagsByPropType || {}),
 [LISTING_TAG_KEY]: listingTags,
 },
 tags: listingTags.map((tag) => tag.label),
 popularFor: draft.popularFor,

 instantBookEnabled,
 allowPreBookingContact: draft.allowPreBookingContact,
 bookingType: draft.bookingType,
 pricingUnit: draft.pricingUnit,
 rate: price,
 price,
 priceCents: price != null ? Math.round(price * 100) : null,

 quantity: draft.category === "Rental" ? quantity : null,
 dimensions: showDimensionsSection
 ? {
 unit: draft.dimensionUnit,
 width: dimensionWidth,
 length: dimensionLength,
 height: dimensionHeight,
 }
 : null,
 dimensionUnit: showDimensionsSection ? draft.dimensionUnit : null,
 dimensionWidth,
 dimensionLength,
 dimensionHeight,

 serviceAreaMode: "radius",
 serviceRadiusMiles: Number(draft.serviceRadiusMiles),
 listingServiceCenterLabel: draft.serviceStreetAddress?.trim()
   ? [draft.serviceStreetAddress, draft.serviceCity, draft.serviceState, draft.serviceZip].filter(Boolean).join(", ")
   : (draft.serviceLocation?.label ?? null),
 listingServiceCenterLat: centerLat,
 listingServiceCenterLng: centerLng,
 serviceCenter: centerLat != null && centerLng != null ? { lat: centerLat, lng: centerLng } : null,
 serviceLocation: draft.serviceLocation
 ? {
 ...draft.serviceLocation,
 country:
 typeof (draft.serviceLocation as any)?.country === "string" &&
 String((draft.serviceLocation as any).country).trim().length > 0
 ? (draft.serviceLocation as any).country
 : "United States",
 }
 : null,

 // Unified travel/delivery fee — shared with VendorListingEdit via
 // buildListingLogisticsPayload so both writers persist identically.
 ...buildListingLogisticsPayload({
 category: draft.category,
 servesOutsideRadius: draft.servesOutsideRadius,
 travelOffered: draft.travelOffered,
 deliveryIncluded: draft.deliveryIncluded,
 feeEnabled: draft.travelFeeEnabled,
 feeType: draft.travelFeeType,
 feeAmountCents: toMoneyCents(draft.travelFeeAmount),
 }),

 setupIncluded: showSetupSection ? draft.setupIncluded : false,
 setupOffered: showSetupSection ? draft.setupIncluded : false,
 setupFeeEnabled: showSetupSection ? draft.setupIncluded && draft.setupFeeEnabled : false,
 setupFeeAmount:
 showSetupSection && draft.setupIncluded && draft.setupFeeEnabled ? Number(draft.setupFeeAmount || 0) : null,
 setupFeeAmountCents:
 showSetupSection && draft.setupIncluded && draft.setupFeeEnabled
 ? toMoneyCents(draft.setupFeeAmount)
 : null,
 takedownIncluded: showTakedownSection ? draft.takedownIncluded : false,
 takedownOffered: showTakedownSection ? draft.takedownIncluded : false,
 takedownFeeEnabled: showTakedownSection ? draft.takedownIncluded && draft.takedownFeeEnabled : false,
 takedownFeeAmount:
 showTakedownSection && draft.takedownIncluded && draft.takedownFeeEnabled
 ? Number(draft.takedownFeeAmount || 0)
 : null,
 takedownFeeAmountCents:
 showTakedownSection && draft.takedownIncluded && draft.takedownFeeEnabled
 ? toMoneyCents(draft.takedownFeeAmount)
 : null,

 cancellationPolicy: draft.cancellationPolicy,
 cancellationPolicyHours:
 draft.cancellationPolicy === "cancel_within_hours"
 ? Number(draft.cancellationPolicyHours) || 48
 : null,

 securityDepositEnabled: draft.securityDepositEnabled,
 securityDepositCents:
 draft.securityDepositEnabled && Number(draft.securityDepositAmount) > 0
   ? Math.round(Number(draft.securityDepositAmount) * 100)
   : null,

 photos: {
 count: persistedPhotoNames.length,
 names: persistedPhotoNames,
 coverPhotoName: persistedPhotoNames[0] ?? null,
 coverPhotoIndex: 0,
 coverPhotoRatio: draft.coverPhotoRatio,
 cropsByName: draft.photoCropsByName,
 },
 videos: {
 names: draft.videoNames,
 count: draft.videoNames.length,
 },
 };
 }, [
 draft,
 listingTags,
 persistedPhotoNames,
 showDeliverySection,
 showDimensionsSection,
 showSetupSection,
 showTakedownSection,
 showTravelSection,
 vendorType,
 ]);

 const staticMapPreviewUrl = useMemo(() => {
 if (!center) return null;
 if (!MAPBOX_TOKEN) return null;
 const radiusMiles = Number(draft.serviceRadiusMiles);
 const features: any[] = [];
 if (Number.isFinite(radiusMiles) && radiusMiles > 0) {
 features.push({
 type: "Feature",
 properties: {
 fill: "#9EDBC0",
 "fill-opacity": 0.25,
 stroke: "#2B7A67",
 "stroke-width": 2,
 },
 geometry: makeCircleGeoJSON(center, radiusMiles, 36).geometry,
 });
 }
 features.push({
 type: "Feature",
 properties: {
 "marker-size": "small",
 "marker-color": "#2B7A67",
 },
 geometry: {
 type: "Point",
 coordinates: [center.lng, center.lat],
 },
 });
 const staticOverlay = encodeURIComponent(
 JSON.stringify({
 type: "FeatureCollection",
 features,
 }),
 );
 return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/geojson(${staticOverlay})/auto/1200x700?padding=56,56,56,56&access_token=${MAPBOX_TOKEN}`;
 }, [center, draft.serviceRadiusMiles]);

 const hasMeaningfulData =
 Boolean(draft.category) ||
 draft.listingTitle.trim().length > 0 ||
 draft.listingDescription.trim().length > 0 ||
 persistedPhotoNames.length > 0 ||
 Number(draft.rate) > 0 ||
 (showDimensionsSection &&
 (parseDimensionNumber(draft.dimensionWidth) != null ||
 parseDimensionNumber(draft.dimensionLength) != null ||
 parseDimensionNumber(draft.dimensionHeight) != null));

 useEffect(() => {
 if (!vendorProfile) return;
 if (draft.serviceCenter || draft.serviceLocation) return;

 const profile = vendorProfile as any;
 const city = profile?.businessCity || profile?.city || "";
 const state = profile?.businessState || profile?.state || "";
 const zip = profile?.businessZip || profile?.zipCode || profile?.postalCode || "";
 const address = profile?.businessStreet || profile?.streetAddress || profile?.address || "";
 const label =
 profile?.businessAddressLabel ||
 [address, city, state, zip].filter(Boolean).join(", ");

 const homeBaseLat = Number(profile?.homeBaseLat);
 const homeBaseLng = Number(profile?.homeBaseLng);

 if (Number.isFinite(homeBaseLat) && Number.isFinite(homeBaseLng)) {
 setDraft((prev) => ({
 ...prev,
 serviceCenter: { lat: homeBaseLat, lng: homeBaseLng },
 serviceLocation: {
 id: "vendor-home-base",
 label: label || "Vendor home base",
 lat: homeBaseLat,
 lng: homeBaseLng,
 city: city || undefined,
 state: state || undefined,
 postalCode: zip || undefined,
 country: "United States",
 placeType: address ? "address" : undefined,
 },
 serviceStreetAddress: address || "",
 serviceCity: city || "",
 serviceState: state || "",
 serviceZip: zip || "",
 }));
 return;
 }

 const query = [address, city, state, zip].filter(Boolean).join(", ").trim();
 if (!query) return;

 void (async () => {
 try {
 const res = await fetch(`/api/locations/search?q=${encodeURIComponent(query)}`);
 if (!res.ok) return;
 const results: LocationResult[] = await res.json();
 const first = results?.[0];
 if (!first) return;

 setDraft((prev) => ({
 ...prev,
 serviceCenter: { lat: first.lat, lng: first.lng },
 serviceLocation: {
 ...first,
 id: first.id || `loc_${first.lat}_${first.lng}`,
 label: first.label || label || "Service center",
 placeType: address ? "address" : first.placeType,
 },
 serviceStreetAddress: address || prev.serviceStreetAddress,
 serviceCity: city || prev.serviceCity,
 serviceState: state || prev.serviceState,
 serviceZip: zip || prev.serviceZip,
 }));
 } catch {
 // no-op
 }
 })();
 }, [vendorProfile, draft.serviceCenter, draft.serviceLocation]);

 useEffect(() => {
 if (!isAuthenticated || !hasMeaningfulData) return;
 if (isSavingDraft || isPublishing) return;

 const payload = buildListingPayload;
 const payloadKey = JSON.stringify(payload);
 if (lastSuccessfulAutosaveKeyRef.current === payloadKey) return;
 if (blockedAutosaveKeyRef.current === payloadKey) return;

 if (!listingId) {
 pendingPayloadRef.current = payload;
 pendingPayloadKeyRef.current = payloadKey;
 if (!createRequestedRef.current) {
 createRequestedRef.current = true;
 createDraftPromiseRef.current = createDraftMutation.mutateAsync({ source: "autosave", listingType: listingType ?? "single" }).catch(() => null);
 }
 return;
 }

 const timer = setTimeout(() => {
 updateDraftMutation.mutate({ id: listingId, payload, source: "autosave" });
 }, 1200);

 return () => clearTimeout(timer);
 }, [
 buildListingPayload,
 createDraftMutation.isPending,
 createDraftMutation.mutate,
 hasMeaningfulData,
 isAuthenticated,
 isPublishing,
 isSavingDraft,
 listingId,
 updateDraftMutation.mutate,
 ]);

 useEffect(() => {
 if (currentStep !== "serviceArea") return;
 if (!mapContainerRef.current) return;
 if (mapRef.current) return;

 setMapError(null);

 if (!MAPBOX_TOKEN) {
 setMapError("Missing Mapbox token (VITE_MAPBOX_TOKEN).");
 return;
 }

 mapboxgl.accessToken = MAPBOX_TOKEN;

 const initialCenter: [number, number] = center ? [center.lng, center.lat] : [-111.891, 40.7608];

 const map = new mapboxgl.Map({
 container: mapContainerRef.current,
 style: "mapbox://styles/mapbox/streets-v12",
 center: initialCenter,
 zoom: 10,
 });
 let deferredResizeId: number | null = null;
 let loadTimeoutId: number | null = null;

 mapRef.current = map;

 map.on("error", (event) => {
 const detail =
 (event as any)?.error?.message ||
 (event as any)?.error?.statusText ||
 "Map failed to load.";
 setMapError(detail);
 });

 map.on("load", () => {
 setIsMapReady(true);
 map.addSource("radius", {
 type: "geojson",
 data: { type: "FeatureCollection", features: [] },
 });
 map.addLayer({
 id: "radius-fill",
 type: "fill",
 source: "radius",
 paint: {
 "fill-color": "#9EDBC0",
 "fill-opacity": 0.28,
 },
 });
 map.addLayer({
 id: "radius-outline",
 type: "line",
 source: "radius",
 paint: {
 "line-color": "#2B7A67",
 "line-width": 2,
 },
 });
 map.addSource("center", {
 type: "geojson",
 data: { type: "FeatureCollection", features: [] },
 });
 map.addLayer({
 id: "center-point",
 type: "circle",
 source: "center",
 paint: {
 "circle-radius": 6,
 "circle-color": "#2B7A67",
 "circle-stroke-width": 2,
 "circle-stroke-color": "#ffffff",
 },
 });

 requestAnimationFrame(() => {
 try {
 map.resize();
 } catch {
 // no-op
 }
 });

 deferredResizeId = window.setTimeout(() => {
 try {
 map.resize();
 } catch {
 // no-op
 }
 }, 140);
 });

 loadTimeoutId = window.setTimeout(() => {
 if (map.isStyleLoaded()) {
 setIsMapReady(true);
 try {
 map.resize();
 } catch {
 // no-op
 }
 return;
 }
 setMapError((previous) => previous ?? "Map failed to load. Check your Mapbox token and allowed URL settings.");
 }, 5000);

 return () => {
 if (deferredResizeId !== null) {
 window.clearTimeout(deferredResizeId);
 }
 if (loadTimeoutId !== null) {
 window.clearTimeout(loadTimeoutId);
 }
 try {
 map.remove();
 } catch {
 // no-op
 }
 mapRef.current = null;
 setIsMapReady(false);
 };
 }, [currentStep]);

 useEffect(() => {
 const map = mapRef.current;
 const mapContainer = mapContainerRef.current;
 if (!map || !mapContainer) return;

 const observer = new ResizeObserver(() => {
 try {
 map.resize();
 } catch {
 // no-op
 }
 });

 observer.observe(mapContainer);

 requestAnimationFrame(() => {
 try {
 map.resize();
 } catch {
 // no-op
 }
 });

 return () => observer.disconnect();
 }, [currentStep]);

 useEffect(() => {
 const map = mapRef.current;
 if (!map || !isMapReady) return;
 if (!map.isStyleLoaded()) return;

 const radiusSource = map.getSource("radius") as mapboxgl.GeoJSONSource | undefined;
 if (radiusSource) radiusSource.setData(radiusFeatureCollection as any);

 const centerSource = map.getSource("center") as mapboxgl.GeoJSONSource | undefined;
 if (centerSource) centerSource.setData(centerFeatureCollection as any);

 if (!center) return;

 const circleBounds = circleFeature ? boundsFromCircleFeature(circleFeature) : null;
 if (circleBounds && draft.serviceRadiusMiles >= 15) {
 map.fitBounds(circleBounds, { padding: 20, duration: 500, maxZoom: 11 });
 return;
 }

 map.easeTo({ center: [center.lng, center.lat], zoom: 10, duration: 400 });
 }, [center, centerFeatureCollection, circleFeature, draft.serviceRadiusMiles, isMapReady, radiusFeatureCollection]);

 useEffect(() => {
 const nextPreviews = draft.photoPreviews.filter((url): url is string => typeof url === "string" && url.length > 0);
 const nextPreviewSet = new Set(nextPreviews);

 activePhotoPreviewsRef.current.forEach((url) => {
 if (!nextPreviewSet.has(url)) {
 URL.revokeObjectURL(url);
 }
 });

 activePhotoPreviewsRef.current = nextPreviews;
 }, [draft.photoPreviews]);

 useEffect(() => {
 return () => {
 activePhotoPreviewsRef.current.forEach((url) => URL.revokeObjectURL(url));
 activePhotoPreviewsRef.current = [];
 };
 }, []);

 const addTag = (raw: string) => {
 const normalized = normalizeTag(raw);
 if (!normalized) return;

 setDraft((prev) => {
 const existing = prev.tagsByPropType[LISTING_TAG_KEY] ?? [];
 if (existing.some((tag) => tag.slug === normalized.slug)) return prev;
 if (existing.length >= 15) return prev;

 return {
 ...prev,
 tagsByPropType: {
 ...prev.tagsByPropType,
 [LISTING_TAG_KEY]: [...existing, normalized],
 },
 };
 });

 setTagInput("");
 };

 const removeTag = (slug: string) => {
 setDraft((prev) => {
 const existing = prev.tagsByPropType[LISTING_TAG_KEY] ?? [];
 return {
 ...prev,
 tagsByPropType: {
 ...prev.tagsByPropType,
 [LISTING_TAG_KEY]: existing.filter((tag) => tag.slug !== slug),
 },
 };
 });
 };

 const addIncludedItem = (raw: string) => {
 const normalized = normalizeIncludedBullet(raw);
 if (!normalized) return;

 setDraft((prev) => {
 const existing = prev.whatsIncluded ?? [];
 if (existing.some((item) => item.toLowerCase() === normalized.toLowerCase())) return prev;
 if (existing.length >= 20) return prev;
 return { ...prev, whatsIncluded: [...existing, normalized] };
 });

 setIncludedInput("");
 };

 const removeIncludedItem = (item: string) => {
 setDraft((prev) => ({
 ...prev,
 whatsIncluded: prev.whatsIncluded.filter((value) => value !== item),
 }));
 };

 const addNotIncludedItem = (raw: string) => {
 const normalized = normalizeIncludedBullet(raw);
 if (!normalized) return;

 setDraft((prev) => {
 const existing = prev.whatsNotIncluded ?? [];
 if (existing.some((item) => item.toLowerCase() === normalized.toLowerCase())) return prev;
 if (existing.length >= 20) return prev;
 return { ...prev, whatsNotIncluded: [...existing, normalized] };
 });

 setNotIncludedInput("");
 };

 const removeNotIncludedItem = (item: string) => {
 setDraft((prev) => ({
 ...prev,
 whatsNotIncluded: prev.whatsNotIncluded.filter((value) => value !== item),
 }));
 };

 const togglePerfectFor = (option: string) => {
 setDraft((prev) => {
 const selected = prev.popularFor.includes(option);
 return {
 ...prev,
 popularFor: selected
 ? prev.popularFor.filter((value) => value !== option)
 : [...prev.popularFor, option],
 };
 });
 };

 const allPerfectForSelected = POPULAR_FOR_OPTIONS.every((option) => draft.popularFor.includes(option));

 const toggleSelectAllPerfectFor = () => {
 setDraft((prev) => ({
 ...prev,
 popularFor: allPerfectForSelected ? [] : [...POPULAR_FOR_OPTIONS],
 }));
 };

 async function uploadListingPhoto(file: File): Promise<UploadedListingPhoto> {
 if (!isAuthenticated) {
 throw new Error(AUTH_LOGIN_REQUIRED_ERROR);
 }
 const token = await getFreshAccessToken();
 if (!token) {
 throw new Error(AUTH_LOGIN_REQUIRED_ERROR);
 }
 const formData = new FormData();
 formData.append("photo", file);

 const response = await fetch("/api/uploads/listing-photo", {
 method: "POST",
 headers: { Authorization: `Bearer ${token}` },
 body: formData,
 credentials: "include",
 });

 if (!response.ok) {
 const errorText = (await response.text()) || response.statusText;
 if (
 response.status === 401 ||
 response.status === 403 ||
 errorText.toLowerCase().includes("missing authorization bearer token")
 ) {
 throw new Error(AUTH_LOGIN_REQUIRED_ERROR);
 }
 throw new Error(`${response.status}: ${errorText}`);
 }

 return await response.json();
 }

 const onPickPhotos = async (files: FileList | null) => {
 if (!files || files.length === 0) return;

 const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
 const selectedFiles = Array.from(files);

 const isHeic = (file: File) =>
 file.type === "image/heic" ||
 file.type === "image/heif" ||
 file.name.toLowerCase().endsWith(".heic") ||
 file.name.toLowerCase().endsWith(".heif");

 const heicFiles = selectedFiles.filter(isHeic);

 // Convert iPhone HEIC/HEIF photos to JPEG in-browser so mobile vendors aren't
 // dead-ended (iPhone's default camera format is HEIC). heic2any is imported
 // lazily so it only loads when a HEIC file is actually picked.
 const convertedHeicFiles: File[] = [];
 if (heicFiles.length > 0) {
 try {
 const heicModule = (await import("heic2any")) as any;
 const heic2any = heicModule.default ?? heicModule;
 for (const file of heicFiles) {
 try {
 const converted = await heic2any({
 blob: file,
 toType: "image/jpeg",
 quality: 0.9,
 });
 const blob: Blob = Array.isArray(converted) ? converted[0] : converted;
 const baseName = file.name.replace(/\.(heic|heif)$/i, "") || "photo";
 convertedHeicFiles.push(
 new File([blob], `${baseName}.jpg`, { type: "image/jpeg" }),
 );
 } catch {
 // Skip this single file; surfaced in the aggregate notice below.
 }
 }
 } catch {
 // Library failed to load entirely — fall through to the notice below.
 }
 }

 const failedHeicCount = heicFiles.length - convertedHeicFiles.length;
 if (failedHeicCount > 0) {
 toast({
 title: "Couldn’t convert some photos",
 description:
 "We couldn’t process some HEIC/HEIF images. Please upload JPG, PNG, or WebP instead.",
 variant: "destructive",
 });
 }

 const nativeAcceptedFiles = selectedFiles.filter((file) => {
 const lowerName = file.name.toLowerCase();
 return (
 allowedMimeTypes.has(file.type) ||
 lowerName.endsWith(".jpg") ||
 lowerName.endsWith(".jpeg") ||
 lowerName.endsWith(".png") ||
 lowerName.endsWith(".webp")
 );
 });

 const acceptedFiles = [...nativeAcceptedFiles, ...convertedHeicFiles];

 if (acceptedFiles.length === 0) return;

 const tempEntries = acceptedFiles.map((file) => {
 const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
 const tempName = `${TEMP_UPLOADING_PHOTO_PREFIX}${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
 return {
 file,
 tempName,
 preview: URL.createObjectURL(file),
 };
 });

 setDraft((prev) => ({
 ...prev,
 photoPreviews: [...prev.photoPreviews, ...tempEntries.map((entry) => entry.preview)],
 photoNames: [...prev.photoNames, ...tempEntries.map((entry) => entry.tempName)],
 }));

 try {
 const uploaded = await Promise.all(tempEntries.map((entry) => uploadListingPhoto(entry.file)));

 setDraft((prev) => {
 let nextPhotoNames = prev.photoNames.slice();
 const nextCropsByName: Record<string, ListingPhotoCrop> = { ...(prev.photoCropsByName || {}) };

 uploaded.forEach((result, index) => {
 const tempName = tempEntries[index].tempName;
 const persistedName = result.storagePath ?? result.filename;
 nextPhotoNames = nextPhotoNames.map((name) => (name === tempName ? persistedName : name));

 if (nextCropsByName[tempName]) {
 nextCropsByName[persistedName] = nextCropsByName[tempName];
 delete nextCropsByName[tempName];
 }
 });

 return {
 ...prev,
 photoNames: nextPhotoNames,
 photoCropsByName: nextCropsByName,
 };
 });
 } catch (error: any) {
 tempEntries.forEach((entry) => URL.revokeObjectURL(entry.preview));

 setDraft((prev) => {
 const removeNames = new Set(tempEntries.map((entry) => entry.tempName));
 const nextPhotoNames: string[] = [];
 const nextPhotoPreviews: string[] = [];

 prev.photoNames.forEach((name, index) => {
 if (removeNames.has(name)) return;
 nextPhotoNames.push(name);
 nextPhotoPreviews.push(prev.photoPreviews[index]);
 });

 const nextCropsByName: Record<string, ListingPhotoCrop> = { ...(prev.photoCropsByName || {}) };
 tempEntries.forEach((entry) => {
 delete nextCropsByName[entry.tempName];
 });

 return {
 ...prev,
 photoNames: nextPhotoNames,
 photoPreviews: nextPhotoPreviews,
 photoCropsByName: nextCropsByName,
 };
 });

 if (!handleAuthRequired(error, "Please sign in to continue uploading photos.")) {
 toast({
 title: "Photo upload failed",
 description: error?.message || "Please try again.",
 variant: "destructive",
 });
 }
 }

 if (fileInputRef.current) fileInputRef.current.value = "";
 };

 const removePhotoAt = (index: number) => {
 setDraft((prev) => {
 const nextPhotoPreviews = prev.photoPreviews.slice();
 const nextPhotoNames = prev.photoNames.slice();

 const removedPreview = nextPhotoPreviews[index];
 if (removedPreview) URL.revokeObjectURL(removedPreview);

 nextPhotoPreviews.splice(index, 1);
 nextPhotoNames.splice(index, 1);

 const nextCropsByName: Record<string, ListingPhotoCrop> = { ...(prev.photoCropsByName || {}) };
 if (typeof prev.photoNames[index] === "string") {
 delete nextCropsByName[prev.photoNames[index]];
 }

 return {
 ...prev,
 photoPreviews: nextPhotoPreviews,
 photoNames: nextPhotoNames,
 photoCropsByName: nextCropsByName,
 };
 });
 };

 const removePhotoByName = (photoName: string) => {
 const index = draft.photoNames.findIndex((name) => name === photoName);
 if (index >= 0) removePhotoAt(index);
 };

 const reorderPhotos = (orderedPhotoNames: string[]) => {
 setDraft((prev) => {
 const previewByName = new Map<string, string>();
 prev.photoNames.forEach((name, index) => previewByName.set(name, prev.photoPreviews[index]));

 const nextNames = orderedPhotoNames.filter((name) => previewByName.has(name));
 if (nextNames.length !== prev.photoNames.length) return prev;

 const nextPreviews = nextNames.map((name) => previewByName.get(name) || "");
 const nextCropsByName: Record<string, ListingPhotoCrop> = {};
 nextNames.forEach((name) => {
 if (prev.photoCropsByName[name]) nextCropsByName[name] = prev.photoCropsByName[name];
 });

 return {
 ...prev,
 photoNames: nextNames,
 photoPreviews: nextPreviews,
 photoCropsByName: nextCropsByName,
 };
 });
 };

 const setPhotoCropByName = (photoName: string, crop: ListingPhotoCrop | null) => {
 setDraft((prev) => {
 const nextCropsByName = { ...(prev.photoCropsByName || {}) };
 if (crop) nextCropsByName[photoName] = crop;
 else delete nextCropsByName[photoName];
 return { ...prev, photoCropsByName: nextCropsByName };
 });
 };

 const goNext = () => {
 if (!canContinue) {
 setAttemptedStepAdvance((prev) => ({ ...prev, [currentStep]: true }));
 return;
 }
 const nextStep = steps[stepIndex + 1];
 if (!nextStep) return;
 setCurrentStep(nextStep.id);
 setMaxStepReached((value) => Math.max(value, stepIndex + 1));
 };

 const goBack = () => {
 const previousStep = steps[stepIndex - 1];
 if (!previousStep) return;
 setCurrentStep(previousStep.id);
 };

 const [showCancelConfirm, setShowCancelConfirm] = useState(false);
 const [showUpgradeToPublish, setShowUpgradeToPublish] = useState(false);
 const [showStripeSetup, setShowStripeSetup] = useState(false);
 const [showOnboardingRequired, setShowOnboardingRequired] = useState(false);
 // Set right before the upgrade modal redirects to Stripe Checkout, so the
 // beforeunload guard below doesn't pop a "Leave site?" prompt on the way out.
 const suppressUnloadGuardRef = useRef(false);

 const handleCancelConfirmed = async () => {
 setShowCancelConfirm(false);

 let idToDelete = listingId ?? listingIdRef.current;

 // If autosave create is in-flight but state hasn't updated yet, await it
 if (!idToDelete && createRequestedRef.current && createDraftPromiseRef.current) {
 const created = await createDraftPromiseRef.current;
 idToDelete = created?.id || created?.data?.id || null;
 }

 if (idToDelete) {
 try {
 await apiRequest("DELETE", `/api/vendor/listings/${idToDelete}`);
 } catch {
 // ignore — navigate away regardless
 }
 }

 onClose();
 };

 const handleCloseWizard = () => {
 void queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings"] });
 onClose();
 };

 // Guard against accidental browser navigation away from the wizard
 useEffect(() => {
 if (!hasMeaningfulData && !listingId) return;
 const handler = (e: BeforeUnloadEvent) => {
   if (suppressUnloadGuardRef.current) return;
   e.preventDefault();
 };
 window.addEventListener("beforeunload", handler);
 return () => window.removeEventListener("beforeunload", handler);
 }, [hasMeaningfulData, listingId]);

 const handleCreateNewAddon = async () => {
 let parentId = listingId ?? listingIdRef.current;
 if (!parentId) {
   try {
     parentId = await ensureListingSaved({ forceCreate: true });
   } catch {
     toast({
       title: "Save required",
       description: "Couldn't save your listing. Please try again.",
       variant: "destructive",
     });
     return;
   }
 }
 if (!parentId) {
   toast({
     title: "Save required",
     description: "Please save your listing before adding add-ons.",
     variant: "destructive",
   });
   return;
 }
 setCreatingAddon(true);
 };

 const ensureListingSaved = async (options?: { forceCreate?: boolean }): Promise<string | null> => {
 if (!isAuthenticated) {
 throw new Error(AUTH_LOGIN_REQUIRED_ERROR);
 }
 const forceCreate = Boolean(options?.forceCreate);

 if (!hasMeaningfulData && !forceCreate) return null;

 const payload = buildListingPayload;
 const payloadKey = JSON.stringify(payload);
 blockedAutosaveKeyRef.current = null;

 let nextListingId = listingId ?? listingIdRef.current;

 if (!nextListingId) {
 let created: any;
 if (createRequestedRef.current && createDraftPromiseRef.current) {
   // Autosave creation is already in flight — await it instead of creating a phantom duplicate
   created = await createDraftPromiseRef.current;
   nextListingId = created?.id || created?.data?.id;
 }
 if (!nextListingId) {
   // No autosave in flight (or it failed) — create now
   created = await createDraftMutation.mutateAsync({ source: "manual", listingType: listingType ?? "single" });
   nextListingId = created?.id || created?.data?.id;
 }
 if (!nextListingId) throw new Error("Failed to create listing draft");
 setListingId(nextListingId);
 }

 await updateDraftMutation.mutateAsync({ id: nextListingId, payload, source: "manual" });
 lastSuccessfulAutosaveKeyRef.current = payloadKey;
 return nextListingId;
 };

 const handleSaveDraft = async () => {
 if (saveInFlightRef.current || isSavingDraft || isPublishing) return;
 saveInFlightRef.current = true;
 setIsSavingDraft(true);
 try {
 const savedId = await ensureListingSaved({ forceCreate: true });
 if (!savedId) {
 throw new Error("Unable to create draft.");
 }
 if (parentListingId) {
   try {
     await apiRequest("POST", `/api/vendor/listings/${parentListingId}/addon-links`, { addonListingId: savedId });
   } catch {
     // non-blocking
   }
 }
 await queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings"] });
 toast({
 title: "Draft saved",
 description: "Your listing draft is saved. You can come back anytime.",
 });
 onComplete?.(savedId);
 handleCloseWizard();
 } catch (error: any) {
 if (handleAuthRequired(error, "Please sign in to continue saving your listing draft.")) {
 return;
 }
 toast({
 title: "Save failed",
 description: error?.message || "Unable to save draft.",
 variant: "destructive",
 });
 } finally {
 setIsSavingDraft(false);
 saveInFlightRef.current = false;
 }
 };

 const handlePublish = async () => {
 if (publishInFlightRef.current || isSavingDraft || isPublishing) return;
 if (!publishReady) {
   const missing =
     listingType === "package_container"
       ? [
           !hasCategory && "Select a category.",
           !hasTitle && "Add a listing title.",
           packageCount < 1 && "Add at least one package in the Define Packages step.",
           !hasLocation && "Set a service area.",
           !hasMinPhotos && `Upload at least ${MIN_PHOTOS_FOR_PUBLISH} photos.`,
         ]
       : [
           !hasCategory && "Select a category.",
           !hasTitle && "Add a title.",
           !hasDescription && "Add a description.",
           !hasPrice && "Set a price.",
           !hasLocation && "Set a service area.",
           !hasMinPhotos && `Upload at least ${MIN_PHOTOS_FOR_PUBLISH} photos.`,
         ];
   toast({
     title: "Can't publish yet",
     description: missing.filter(Boolean).join(" "),
     variant: "destructive",
   });
   return;
 }
 publishInFlightRef.current = true;
 setIsPublishing(true);

 // Step 1: save. Errors here are save errors, not publish errors.
 let id: string | null = null;
 try {
 id = await ensureListingSaved();
 if (!id) {
 toast({
 title: "Nothing to publish",
 description: "Please complete the required fields before publishing.",
 variant: "destructive",
 });
 setIsPublishing(false);
 publishInFlightRef.current = false;
 return;
 }
 } catch (saveError) {
 if (handleAuthRequired(saveError, "Please sign in to continue publishing your listing.")) {
 setIsPublishing(false);
 publishInFlightRef.current = false;
 return;
 }
 toast({
 title: "Save failed",
 description: (saveError as any)?.message || "Unable to save before publishing.",
 variant: "destructive",
 });
 setIsPublishing(false);
 publishInFlightRef.current = false;
 return;
 }

 // Step 2: publish.
 try {
 const payload = buildListingPayload;
 const response = await apiRequest("PATCH", `/api/vendor/listings/${id}/publish`, {
 listingData: payload,
 });

 const result = await response.json().catch(() => ({}));
 if (!response.ok) {
 throw new Error(typeof result === "string" ? result : JSON.stringify(result));
 }

 await queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings"] });
 // Conversion: vendor successfully published a listing. This is a distinct
 // activation milestone from account signup (never CompleteRegistration) —
 // routed through trackBoth (PostHog + Meta CAPI, shared event_id) via a
 // per-listing dedupe guard. Best-effort/non-throwing; never blocks publish.
 trackListingPublishedOnce(id, {
   listing_type: listingType,
   is_addon: Boolean(parentListingId),
 });
 if (parentListingId) {
   try {
     await apiRequest("POST", `/api/vendor/listings/${parentListingId}/addon-links`, { addonListingId: id });
   } catch {
     // non-blocking
   }
 }
 toast({
 title: "Listing published",
 description: "Your listing is now live.",
 });
 onComplete?.(id);
 handleCloseWizard();
 } catch (error) {
 // Business-rule responses must be handled BEFORE handleAuthRequired so a
 // publish rejection never reads as a session problem. The draft is already
 // saved (step 1 above), so we surface the right path instead.
 //
 // Free-plan vendor at their active-listing cap → upgrade modal.
 if (isListingLimitReachedError(error)) {
   setShowUpgradeToPublish(true);
   return;
 }
 // Vendor hasn't completed profile onboarding → finish-profile modal.
 // (The server checks this before Stripe, so a brand-new vendor sees this
 // first, then the Stripe modal on their next attempt.)
 if (isOnboardingIncompleteError(error)) {
   setShowOnboardingRequired(true);
   return;
 }
 // Vendor hasn't finished Stripe Connect setup → payment-setup modal.
 // (Don't call onStripeRequired — on the standalone create page it navigates
 // away, which would unmount this modal before it renders.)
 if (isStripeNotConfiguredError(error)) {
   setShowStripeSetup(true);
   return;
 }
 if (handleAuthRequired(error, "Please sign in to continue publishing your listing.")) {
 return;
 }
 const publishError = getPublishFailureToastContent(error);
 toast({
 title: publishError.title,
 description: publishError.description,
 variant: "destructive",
 });
 } finally {
 setIsPublishing(false);
 publishInFlightRef.current = false;
 }
 };

 const isLastStep = stepIndex === steps.length - 1;
 const isBusy = isSavingDraft || isPublishing;
 const showBasicsValidation = Boolean(attemptedStepAdvance.basics);
 const showBookingPricingValidation = Boolean(attemptedStepAdvance.bookingPricing);
 const showServiceAreaValidation = Boolean(attemptedStepAdvance.serviceArea);

 if (!listingType) {
 return (
 <div className="swap-dashboard-whites flex h-screen w-full flex-col overflow-hidden bg-[#ffffff] supports-[height:100dvh]:h-dvh">
 <Navigation vendorDashboardAligned />
 <AuthModal
 open={authModalOpen}
 onOpenChange={(open) => {
 setAuthModalOpen(open);
 if (!open) authPromptShownRef.current = false;
 }}
 />
 <div className="min-h-0 flex-1 overflow-y-auto">
 <ListingTypeSelector
 hasProFeatures={hasProFeatures}
 onSelect={(type) => {
 if (type === "addon" && !hasProFeatures) {
 setShowUpgradeForAddon(true);
 return;
 }
 setListingType(type);
 }}
 />
 </div>
 <UpgradeModal
 open={showUpgradeForAddon}
 onOpenChange={setShowUpgradeForAddon}
 title="Add-ons are a Pro feature"
 description="Upgrade to Pro to create add-on listings — standalone bookable upgrades you can attach to any of your listings."
 />
 </div>
 );
 }

 return (
 <>
 {/* 100dvh (not 100vh/h-screen): the page itself never scrolls — content
     scrolls in an inner container — so iOS Safari keeps its bottom URL bar
     expanded and overlays the last ~70px of a 100vh layout, hiding the
     footer buttons. dvh tracks the actually-visible viewport. */}
 <div className="swap-dashboard-whites flex h-screen w-full flex-col bg-[#ffffff] supports-[height:100dvh]:h-dvh">
 <Navigation vendorDashboardAligned />
 <AuthModal
 open={authModalOpen}
 onOpenChange={(open) => {
 setAuthModalOpen(open);
 if (!open) {
 authPromptShownRef.current = false;
 }
 }}
 />

 <div className="flex min-h-0 flex-1">
 <div className="hidden w-24 shrink-0 border-r border-[rgba(74,106,125,0.22)] bg-[#ffffff] sm:block">
 <div className="flex h-full flex-col items-center pt-6">
 <div className="flex flex-col items-center gap-3">
 {steps.map((step, index) => {
 const isActive = step.id === currentStep;
 const isComplete = index < maxStepReached;
 const isReachable = index <= maxStepReached;
 const meta = STEP_META[step.id];
 const Icon = meta.icon;

 return (
 <button
 key={step.id}
 type="button"
 aria-label={step.title}
 aria-current={isActive ? "step" : undefined}
 aria-disabled={!isReachable}
 onClick={() => {
 if (!isReachable) return;
 if (index > stepIndex && !canContinue) {
 setAttemptedStepAdvance((prev) => ({ ...prev, [currentStep]: true }));
 return;
 }
 setCurrentStep(step.id);
 }}
 className={cn(
 "group/step relative flex h-14 w-14 items-center justify-center rounded-2xl border border-transparent transition-colors",
 isActive
 ? "bg-[#4a6a7d] text-[#f5f0e8] hover:bg-[#4a6a7d]"
 : isReachable
 ? "text-[#2a3a42] hover:bg-[#e6e1d6] hover:text-[#2a3a42]"
 : "cursor-not-allowed text-[#9aacb4]",
 )}
 data-testid={`create-listing-step-${step.id}`}
 >
 {isComplete ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
 <span className="sr-only">{step.title}</span>
 <span
 className={cn(
 "pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 min-w-[210px] -translate-y-1/2 rounded-md border border-[rgba(74,106,125,0.22)] bg-[#ffffff] px-2.5 py-2 text-left text-[#2a3a42] opacity-0 shadow-sm transition-opacity duration-150",
 "group-hover/step:opacity-100",
 )}
 >
 <span className="block text-sm font-semibold">{step.title}</span>
 <span className="mt-0.5 block text-sm leading-snug text-[#4a6a7d]">{meta.description}</span>
 </span>
 </button>
 );
 })}
 </div>
 </div>
 </div>

 <div className="min-h-0 flex-1 overflow-y-auto">
 <div
 className={cn(
 "create-listing-wizard-typography listing-onboarding-parity vendor-onboarding-input-surface mx-auto w-full max-w-[1400px] px-8 pt-10 sm:px-14 lg:px-20",
 // On mobile the action bar sits below the scroll area (real footer), so
 // only a small pad is needed; on sm+ it overlays the content (fixed), so
 // keep the large clearance.
 currentStep === "basics" ? "pb-10 sm:pb-24" : "pb-10 sm:pb-36",
 )}
 >


         {currentStep === "basics" && (
           <div className="space-y-6">
             <BasicsStep
               draft={draft}
               setDraft={setDraft}
               showValidation={showBasicsValidation}
               isPackageListing={listingType === "package_container"}
             />
           </div>
         )}

         {currentStep === "perfectFor" && (
           <PerfectForStep draft={draft} setDraft={setDraft} />
         )}

         {currentStep === "bookingPricing" && (
           <BookingPricingStep draft={draft} setDraft={setDraft} showValidation={showBookingPricingValidation} />
         )}

         {currentStep === "serviceArea" && (
           <ServiceAreaStep draft={draft} setDraft={setDraft} showValidation={showServiceAreaValidation} />
         )}

         {currentStep === "logistics" && (
           <LogisticsStep draft={draft} setDraft={setDraft} />
         )}

         {currentStep === "packages" && (
           <PackagesStep
             listingId={listingId}
             category={draft.category}
             draft={draft}
             setDraft={setDraft}
             onPackageCountChange={setPackageCount}
             showValidation={Boolean(attemptedStepAdvance.packages)}
           />
         )}

         {currentStep === "media" && (
           <MediaStep draft={draft} setDraft={setDraft} listingId={listingId} onPickPhotos={onPickPhotos} />
         )}

         {currentStep === "attachAddons" && (
           <AttachAddonsStep
             listingId={listingId}
             onCreateNewAddon={handleCreateNewAddon}
           />
         )}

         {currentStep === "attachToListings" && (
           <AttachToListingsStep addonListingId={listingId} />
         )}
         </div>
         </div>
         </div>

 {/* Action bar. On mobile it is a real flex footer (takes layout space, so
     step content scrolls fully above it — it wraps to two button rows and
     used to cover the bottom of every step). On sm+ it overlays as before. */}
 <div className="z-30 shrink-0 border-t border-[rgba(74,106,125,0.15)] bg-[#ffffff] sm:fixed sm:bottom-0 sm:left-24 sm:right-0 sm:border-t-0 sm:bg-[#ffffff]/96 sm:backdrop-blur-sm">
 <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3 px-6 pt-3 pb-5 sm:px-12 sm:pt-4 sm:pb-8 lg:px-16">
 <div className="flex items-center gap-2">
 <Button
 type="button"
 variant="outline"
 onClick={goBack}
 disabled={stepIndex === 0 || isBusy}
 className="min-h-[2.7rem] px-6 font-sans text-[1.2rem] font-medium"
 >
 Back
 </Button>
 <Button
 type="button"
 variant="ghost"
 onClick={() => setShowCancelConfirm(true)}
 disabled={isBusy}
 className="min-h-[2.7rem] px-6 font-sans text-[1.2rem] font-medium text-muted-foreground hover:text-destructive"
 >
 Cancel
 </Button>
 </div>

 <div className="flex items-center gap-2">
 <Button
 type="button"
 variant="outline"
 onClick={handleSaveDraft}
 disabled={isBusy}
 className="min-h-[2.7rem] px-6 font-sans text-[1.2rem] font-medium"
 >
 {isSavingDraft ? "Saving..." : "Save Draft"}
 </Button>

 {isLastStep ? (
 <Button
 type="button"
 onClick={handlePublish}
 disabled={isBusy}
 className="min-h-[2.7rem] px-6 font-sans text-[1.2rem] font-medium"
 >
 {isPublishing ? "Publishing..." : "Publish"}
 </Button>
 ) : (
 <Button
 type="button"
 onClick={goNext}
 disabled={isBusy}
 className="min-h-[2.7rem] px-6 font-sans text-[1.2rem] font-medium"
 >
 Continue
 </Button>
 )}
 </div>
 </div>
 </div>
 </div>

 {/* Nested add-on wizard — renders as a full-screen overlay when vendor clicks "Create new add-on" */}
 {creatingAddon && listingId && (
 <div className="fixed inset-0 z-[200] bg-[#ffffff]">
   <CreateListingWizard
     initialListingType="addon"
     parentListingId={listingId}
     onClose={() => setCreatingAddon(false)}
     onComplete={() => {
       setCreatingAddon(false);
       void queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings", listingId, "addon-links"] });
     }}
   />
 </div>
 )}

 {showCancelConfirm && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
 <div className="mx-4 w-full max-w-md rounded-2xl border border-[rgba(74,106,125,0.22)] bg-[#ffffff] p-8 shadow-xl">
 <h2 className="mb-2 font-sans text-[1.4rem] font-semibold text-foreground">
 Exit and delete draft?
 </h2>
 <p className="mb-6 font-sans text-[1.1rem] text-muted-foreground">
 Are you sure you want to exit? Your draft listing will be deleted and any progress will be lost.
 </p>
 <div className="flex justify-end gap-3">
 <Button
 type="button"
 variant="outline"
 onClick={() => setShowCancelConfirm(false)}
 className="min-h-[2.5rem] px-5 font-sans text-[1.1rem] font-medium"
 >
 No, keep editing
 </Button>
 <Button
 type="button"
 variant="destructive"
 onClick={handleCancelConfirmed}
 className="min-h-[2.5rem] px-5 font-sans text-[1.1rem] font-medium"
 >
 Yes, exit and delete
 </Button>
 </div>
 </div>
 </div>
 )}

 {/* Free-plan vendor hit the active-listing cap on publish. Their draft is
     already saved — subscribing takes them to Checkout; X-ing out just exits. */}
 <UpgradeModal
   open={showUpgradeToPublish}
   onOpenChange={(open) => {
     if (open) return;
     setShowUpgradeToPublish(false);
     // Draft was saved during the publish attempt; dismissing saves + exits.
     handleCloseWizard();
   }}
   title="Upgrade to Access Pro Benefits"
   description="Publish unlimited listings, plus advanced analytics and Google Calendar sync."
   onBeforeCheckout={() => {
     suppressUnloadGuardRef.current = true;
   }}
 />

 {/* Vendor clicked Publish without finishing Stripe setup. Draft is already
     saved; "Set up payments" routes them to Stripe onboarding. */}
 <StripeSetupModal
   open={showStripeSetup}
   onOpenChange={setShowStripeSetup}
   onBeforeRedirect={() => {
     suppressUnloadGuardRef.current = true;
   }}
 />

 {/* Vendor clicked Publish without completing vendor onboarding. Draft is
     already saved; "Finish my profile" routes them to vendor onboarding. */}
 <OnboardingRequiredModal
   open={showOnboardingRequired}
   onOpenChange={setShowOnboardingRequired}
   onBeforeRedirect={() => {
     suppressUnloadGuardRef.current = true;
   }}
 />
 </>
 );
}
