import { useTranslation } from "react-i18next";
import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { useLocation } from "wouter";
import VendorShell from "@/components/VendorShell";
import { useUpgradeModal } from "@/components/UpgradeModal";
import VendorBillingPanel from "@/components/VendorBillingPanel";
import KeepProModal from "@/components/KeepProModal";


import { Button } from "@/components/ui/button";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocationPicker } from "@/components/LocationPicker";
import type { LocationResult } from "@/types/location";
import { useToast } from "@/hooks/use-toast";
import { redirectVendorToStripeSetup } from "@/lib/vendorStripe";
import { apiRequest } from "@/lib/queryClient";
import { deriveVendorDetection } from "@/lib/vendorState";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";


import { Calendar, Clock, DollarSign, Users, TrendingUp, Loader2, Copy, Check, Sparkles, Lock } from "lucide-react";

type VendorMe = {
 id?: string | null;
 businessName?: string | null;
 accountBusinessName?: string | null;
 email?: string | null;
 stripeOnboardingComplete?: boolean | null;
 googleConnectionStatus?: string | null;
 googleCalendarId?: string | null;
 googleAccountEmail?: string | null;
 hasVendorAccount?: boolean | null;
 hasAnyVendorProfiles?: boolean | null;
 hasActiveVendorProfile?: boolean | null;
 needsNewVendorProfileOnboarding?: boolean | null;
 // Launch-comp publish stipulation: present while the vendor holds a launch
 // spot but hasn't published a first listing yet (drives the countdown banner).
 compPublishRequirement?: { deadline?: string | null; graceApplied?: boolean | null } | null;
 // Reverse-trial state: present once auto-enrolled. `active` = still on the free
 // trial with no card, so the "add a card to keep Pro" banner should show.
 reverseTrial?: {
 daysLeft?: number | null;
 trialEndsAt?: string | null;
 cardCaptured?: boolean | null;
 active?: boolean | null;
 } | null;
 shopActive?: boolean | null;
 isPro?: boolean | null;
 canUseAnalytics?: boolean | null;
 canUseGoogleSync?: boolean | null;
};

type VacationBlock = {
 id: string;
 startDate: string;
 endDate: string;
};

type VendorStats = {
 totalBookings?: number | null;
 bookingsThisMonth?: number | null;
 revenue?: number | null;
 revenueGrowth?: number | null;
 profileViews?: number | null;
 profileViewsGrowth?: number | null;
 analyticsLocked?: boolean | null; // true when advanced analytics is gated (Free tier)
};

type VendorProfileResponse = {
 profileName?: string | null;
 activeProfileId?: string | null;
 serviceType?: string | null;
 address?: string | null;
 serviceAddress?: string | null;
 city?: string | null;
 travelMode?: string | null;
 serviceRadius?: number | null;
 onlineProfiles?: any;
};

type VendorProfileSummary = {
 id: string;
 profileName: string;
 isActive: boolean;
 isOperational?: boolean;
 deactivatedAt?: string | null;
};

type VendorProfilesResponse = {
 activeProfileId?: string | null;
 profiles?: VendorProfileSummary[];
};

type GoogleCalendarSummary = {
 id: string;
 summary: string;
 primary: boolean;
 accessRole?: string | null;
 backgroundColor?: string | null;
};

type GoogleCalendarSyncExistingResponse = {
 googleCalendarId: string;
 bookingCount: number;
 syncedCount: number;
 skippedCount: number;
 failedCount: number;
 failedBookings?: Array<{
 bookingId: string;
 error: string;
 }>;
};

type VendorListingSummary = {
 id: string;
 title?: string | null;
 status?: string | null;
};

type GoogleCalendarEventBoundary = {
 date: string | null;
 dateTime: string | null;
 timeZone: string | null;
};

type UnmatchedGoogleEvent = {
 id: string;
 summary: string | null;
 description: string | null;
 status: string | null;
 start: GoogleCalendarEventBoundary;
 end: GoogleCalendarEventBoundary;
 updated: string | null;
};

type UnmatchedGoogleEventsResponse = {
 events?: UnmatchedGoogleEvent[] | null;
};

type GoogleBookingReconciliationIssue = {
 bookingId: string | null;
 listingId: string | null;
 listingTitle: string;
 status: string;
 bookingStartAt: string | null;
 bookingEndAt: string | null;
 googleSyncStatus: string | null;
 googleSyncError: string | null;
 googleEventId: string | null;
 googleCalendarId: string | null;
 selectedGoogleCalendarId: string | null;
 issueCodes: string[];
 createdAt: string | null;
};

type GoogleBookingReconciliationResponse = {
 googleEnabled: boolean;
 googleCalendarId: string | null;
 googleCalendarReadStatus: "checked" | "skipped" | "failed";
 googleCalendarReadError: string | null;
 issues: GoogleBookingReconciliationIssue[];
};

type PendingGoogleCalendarSelection = {
 calendarId: string;
 calendarSummary: string;
 alreadySelected: boolean;
 isSwitch: boolean;
};

function fmtDate(s: string): string {
  const [y, m, d] = s.split("-");
  return `${m}/${d}/${y}`;
}

function buildServiceAddress(street: string, city: string, state: string, zip: string) {
 const a = street.trim();
 const c = city.trim();
 const s = state.trim();
 const z = zip.trim();
 const cityStateZip = [c, [s, z].filter(Boolean).join(" ")].filter(Boolean).join(", ");
 return [a, cityStateZip].filter(Boolean).join(", ");
}

function normalizeProfileNameInput(value: string) {
 const cleaned = (value || "")
 .replace(/[’]/g, "'")
 .replace(/[^a-zA-Z0-9\s'&]/g, " ")
 .replace(/\s+/g, " ")
 .trim()
 .slice(0, 120);
 if (!cleaned) return "";
 return cleaned
 .split(" ")
 .filter(Boolean)
 .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
 .join(" ");
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

function formatGoogleEventBoundary(
 boundary: GoogleCalendarEventBoundary | null | undefined,
 options?: { isEnd?: boolean }
) {
 if (boundary?.dateTime) {
 const parsed = new Date(boundary.dateTime);
 if (!Number.isNaN(parsed.getTime())) {
 return new Intl.DateTimeFormat("en-US", {
 dateStyle: "medium",
 timeStyle: "short",
 }).format(parsed);
 }
 }

 if (boundary?.date) {
 const parsed = new Date(`${boundary.date}T00:00:00.000Z`);
 if (!Number.isNaN(parsed.getTime())) {
 if (options?.isEnd) {
 parsed.setUTCDate(parsed.getUTCDate() - 1);
 }
 return new Intl.DateTimeFormat("en-US", {
 dateStyle: "medium",
 timeZone: "UTC",
 }).format(parsed);
 }
 }

 return "Not set";
}

function formatDateTimeValue(value: string | Date | null | undefined) {
 if (!value) return "Not set";
 const parsed = value instanceof Date ? value : new Date(value);
 if (Number.isNaN(parsed.getTime())) return "Not set";
 return new Intl.DateTimeFormat("en-US", {
 dateStyle: "medium",
 timeStyle: "short",
 }).format(parsed);
}

function formatGoogleSyncIssueCode(issueCode: string) {
 switch (issueCode) {
 case "sync_failed":
 return "Sync failed";
 case "missing_google_event_id":
 return "Missing Google event id";
 case "missing_in_selected_calendar":
 return "Missing in selected calendar";
 case "calendar_mismatch":
 return "Calendar mismatch";
 default:
 return issueCode.replace(/_/g, " ");
 }
}

export default function VendorDashboard() {
 const { t, i18n } = useTranslation();
 const { isAuthenticated, isLoading: isAuthLoading, getAccessTokenSilently, logout, user } = useAuth0();
 const [location, setLocation] = useLocation();
 const qc = useQueryClient();
 const { toast } = useToast();
 const upgrade = useUpgradeModal();

 const {
 data: vendorAccount,
 isLoading: isVendorLoading,
 isFetching: isVendorFetching,
 error: vendorMeError,
 } = useQuery<VendorMe>({
 queryKey: ["/api/vendor/me"],
 enabled: isAuthenticated,
 });
 const vendorDetection = deriveVendorDetection({
 data: vendorAccount,
 isLoading: isVendorLoading,
 isFetching: isVendorFetching,
 error: vendorMeError,
 });

 const { data: stats, isLoading: isStatsLoading } = useQuery<VendorStats>({
 queryKey: ["/api/vendor/stats"],
 enabled: isAuthenticated && !isAuthLoading,
 });
 // Advanced analytics (trends, profile views, recent activity) is Pro-only.
 // Lifetime totals (bookings + revenue) stay visible to Free vendors.
 const analyticsLocked = Boolean(stats?.analyticsLocked) || vendorAccount?.canUseAnalytics === false;
 const googleConnectionStatus = (vendorAccount?.googleConnectionStatus || "disconnected").toLowerCase();
 const isGoogleConnected = googleConnectionStatus === "connected";
 const hasSelectedGoogleCalendar = Boolean(vendorAccount?.googleCalendarId);
 const {
 data: googleCalendars = [],
 isLoading: isGoogleCalendarsLoading,
 isFetching: isGoogleCalendarsFetching,
 error: googleCalendarsError,
 } = useQuery<GoogleCalendarSummary[]>({
 queryKey: ["/api/google/calendars"],
 enabled: isAuthenticated && isGoogleConnected,
 retry: false,
 });
 // Listings are general data — not gated on Google Calendar.
 // The Google Calendar event-mapping UI that consumes this is still gated on
 // isGoogleConnected && hasSelectedGoogleCalendar, so nothing leaks through.
 const {
 data: vendorListings = [],
 isLoading: isVendorListingsLoading,
 error: vendorListingsError,
 } = useQuery<VendorListingSummary[]>({
 queryKey: ["/api/vendor/listings"],
 enabled: isAuthenticated,
 retry: false,
 queryFn: async () => {
 const response = await apiRequest("GET", "/api/vendor/listings");
 return (await response.json()) as VendorListingSummary[];
 },
 });
 const {
 data: unmatchedGoogleEventsData,
 isLoading: isUnmatchedGoogleEventsLoading,
 isFetching: isUnmatchedGoogleEventsFetching,
 error: unmatchedGoogleEventsError,
 } = useQuery<UnmatchedGoogleEvent[] | UnmatchedGoogleEventsResponse>({
 queryKey: ["/api/google/events/unmatched", vendorAccount?.googleCalendarId, "dashboard"],
 enabled: isAuthenticated && isGoogleConnected && hasSelectedGoogleCalendar,
 retry: false,
 queryFn: async () => {
 const response = await apiRequest("GET", "/api/google/events/unmatched");
 const payload = (await response.json()) as UnmatchedGoogleEventsResponse | UnmatchedGoogleEvent[];
 if (Array.isArray(payload)) {
 return payload;
 }
 return Array.isArray(payload?.events) ? payload.events : [];
 },
 });
 const {
 data: googleBookingReconciliation,
 isLoading: isGoogleBookingReconciliationLoading,
 isFetching: isGoogleBookingReconciliationFetching,
 error: googleBookingReconciliationError,
 } = useQuery<GoogleBookingReconciliationResponse>({
 queryKey: ["/api/google/bookings/reconciliation", vendorAccount?.googleCalendarId, "dashboard"],
 enabled: isAuthenticated && isGoogleConnected && hasSelectedGoogleCalendar,
 retry: false,
 queryFn: async () => {
 const response = await apiRequest("GET", "/api/google/bookings/reconciliation");
 return (await response.json()) as GoogleBookingReconciliationResponse;
 },
 });
 const unmatchedGoogleEvents = useMemo(
 () =>
 Array.isArray(unmatchedGoogleEventsData)
 ? unmatchedGoogleEventsData
 : Array.isArray(unmatchedGoogleEventsData?.events)
 ? unmatchedGoogleEventsData.events
 : [],
 [unmatchedGoogleEventsData]
 );

 const {
 data: vendorProfile,
 isLoading: isProfileLoading,
 isError: isProfileError,
 } = useQuery<VendorProfileResponse>({
 queryKey: ["/api/vendor/profile"],
 enabled: isAuthenticated,
 retry: false,
 });
 const { data: vendorProfilesData } = useQuery<VendorProfilesResponse>({
 queryKey: ["/api/vendor/profiles", "dashboard-profile-details"],
 enabled: isAuthenticated,
 retry: false,
 queryFn: async () => {
 const token = await getAccessTokenSilently({
 authorizationParams: { audience: "https://eventhub-api" },
 });
 const res = await fetch("/api/vendor/profiles", {
 headers: { Authorization: `Bearer ${token}` },
 });
 if (!res.ok) {
 return { profiles: [] };
 }
 return res.json();
 },
 });

 // -------------------------
 // Draft fields (match onboarding inputs)
 // -------------------------
 const [keepProOpen, setKeepProOpen] = useState(false);
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
 const [isStripeSetupLoading, setIsStripeSetupLoading] = useState(false);
 const [isGoogleCalendarConnectLoading, setIsGoogleCalendarConnectLoading] = useState(false);
 const [selectedGoogleCalendarId, setSelectedGoogleCalendarId] = useState("");
 const [pendingGoogleCalendarSelection, setPendingGoogleCalendarSelection] =
 useState<PendingGoogleCalendarSelection | null>(null);
 const [isAccountSettingsDialogOpen, setIsAccountSettingsDialogOpen] = useState(false);
 const [isProfileLifecycleDialogOpen, setIsProfileLifecycleDialogOpen] = useState(false);
 const [isDeleteAccountDialogOpen, setIsDeleteAccountDialogOpen] = useState(false);
 const [selectedListingIdByGoogleEventId, setSelectedListingIdByGoogleEventId] = useState<Record<string, string>>({});
 const [googleEventMappingErrorMessage, setGoogleEventMappingErrorMessage] = useState<string | null>(null);
 const [googleBookingRepairMessage, setGoogleBookingRepairMessage] = useState<string | null>(null);
 // Availability state
 const [vacationStart, setVacationStart] = useState("");
 const [vacationEnd, setVacationEnd] = useState("");
 const [vacationFormError, setVacationFormError] = useState<string | null>(null);
 const [isShopShutdownDialogOpen, setIsShopShutdownDialogOpen] = useState(false);
 const [isDisconnectGoogleCalendarDialogOpen, setIsDisconnectGoogleCalendarDialogOpen] = useState(false);
 // Vacation blocks query
 const {
 data: vacationBlocks = [],
 isLoading: isVacationBlocksLoading,
 } = useQuery<VacationBlock[]>({
 queryKey: ["/api/vendor/vacation-blocks"],
 enabled: isAuthenticated,
 queryFn: async () => {
 const token = await getAccessTokenSilently({ authorizationParams: { audience: "https://eventhub-api" } });
 const res = await fetch("/api/vendor/vacation-blocks", { headers: { Authorization: `Bearer ${token}` } });
 if (!res.ok) return [];
 return res.json();
 },
 });

 const vendorProfiles = Array.isArray(vendorProfilesData?.profiles) ? vendorProfilesData.profiles : [];
 const activeProfileId =
 (typeof vendorProfile?.activeProfileId === "string" ? vendorProfile.activeProfileId : null) ||
 (typeof vendorProfilesData?.activeProfileId === "string" ? vendorProfilesData.activeProfileId : null) ||
 vendorProfiles.find((profile) => profile.isActive)?.id ||
 null;
 const persistedProfileBusinessName = useMemo(() => {
 const online = (vendorProfile?.onlineProfiles ?? {}) as any;
 const onlineProfileName =
 typeof online?.profileBusinessName === "string" ? online.profileBusinessName.trim() : "";
 if (onlineProfileName) return onlineProfileName;

 const profileName = typeof vendorProfile?.profileName === "string" ? vendorProfile.profileName.trim() : "";
 if (profileName) return profileName;

 return vendorAccount?.businessName || "";
 }, [vendorProfile?.onlineProfiles, vendorProfile?.profileName, vendorAccount?.businessName]);
 const activeProfileLabel =
 vendorProfiles.find((profile) => profile.id === activeProfileId)?.profileName ||
 persistedProfileBusinessName ||
 "Vendor Profile";
 const selectedProfileSummary = vendorProfiles.find((profile) => profile.id === activeProfileId) || null;
 const isSelectedProfileOperational = selectedProfileSummary?.isOperational !== false;

 // hydrate drafts
 useEffect(() => {
 // If profile doesn't exist yet, keep safe defaults
 const p = vendorProfile;
 const online = (p?.onlineProfiles ?? {}) as any;
 setBusinessNameDraft(persistedProfileBusinessName);

 setCityDraft(p?.city || "");
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
 }, [vendorProfile, vendorAccount?.email, persistedProfileBusinessName]);

 useEffect(() => {
 setSelectedGoogleCalendarId(vendorAccount?.googleCalendarId || "");
 }, [vendorAccount?.googleCalendarId]);

 useEffect(() => {
 setSelectedListingIdByGoogleEventId((prev) => {
 const activeIds = new Set(unmatchedGoogleEvents.map((event) => event.id));
 let changed = false;
 const next: Record<string, string> = {};
 for (const [googleEventId, listingId] of Object.entries(prev)) {
 if (activeIds.has(googleEventId)) {
 next[googleEventId] = listingId;
 } else {
 changed = true;
 }
 }
 return changed ? next : prev;
 });
 }, [unmatchedGoogleEvents]);

 const switchProfile = useMutation({
 mutationFn: async (profileId: string) => {
 const token = await getAccessTokenSilently({
 authorizationParams: { audience: "https://eventhub-api" },
 });
 const res = await fetch("/api/vendor/profiles/switch", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({ profileId }),
 });
 if (!res.ok) {
 const text = await res.text().catch(() => "");
 throw new Error(text || `Failed to switch profile (${res.status})`);
 }
 return res.json();
 },
 onSuccess: async () => {
 await Promise.all([
 qc.invalidateQueries({ queryKey: ["/api/vendor/me"] }),
 qc.invalidateQueries({ queryKey: ["/api/vendor/profile"] }),
 qc.invalidateQueries({ queryKey: ["/api/vendor/profiles"] }),
 qc.invalidateQueries({ queryKey: ["/api/vendor/stats"] }),
 qc.invalidateQueries({ queryKey: ["/api/vendor/listings"] }),
 qc.invalidateQueries({ queryKey: ["/api/vendor/bookings"] }),
 qc.invalidateQueries({ queryKey: ["/api/vendor/payments"] }),
 ]);
 },
 onError: (error: any) => {
 toast({
 title: "Unable to switch profile",
 description: error?.message || "Please try again.",
 variant: "destructive",
 });
 },
 });

 const saveProfile = useMutation({
 mutationFn: async () => {
 const token = await getAccessTokenSilently({
 authorizationParams: { audience: "https://eventhub-api" },
 });

 // Update active vendor profile (profile-scoped fields only).
 // DB notes:
 // - vendor_profiles has city + service_radius + travel_mode
 // - state/zip/phone aren’t columns; store them inside onlineProfiles JSONB
 const onlineProfilesNext = {
 ...(vendorProfile?.onlineProfiles ?? {}),
 profileBusinessName: businessNameDraft,
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
 body: JSON.stringify({
 profileName: businessNameDraft,
 // Keep serviceType stable; set default if missing.
 serviceType: vendorProfile?.serviceType || "prop-decor",

 // Store address in both fields to be safe with legacy usage.
 serviceAddress,
 address: serviceAddress,

 city: cityDraft,

 serviceRadius: Number(serviceRadiusMilesDraft || 0),

 // minimal encoding for MVP
 travelMode: "included",

 onlineProfiles: onlineProfilesNext,
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
 qc.invalidateQueries({ queryKey: ["/api/vendor/profiles"] });
 },
 });

 // Vacation block mutations
 const addVacationBlockMutation = useMutation({
 mutationFn: async ({ startDate, endDate }: { startDate: string; endDate: string }) => {
 const token = await getAccessTokenSilently({ authorizationParams: { audience: "https://eventhub-api" } });
 const res = await fetch("/api/vendor/vacation-blocks", {
 method: "POST",
 headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
 body: JSON.stringify({ startDate, endDate }),
 });
 if (!res.ok) {
 const text = await res.text().catch(() => "");
 let message = "";
 if (text) {
 try {
 const parsed = JSON.parse(text);
 message = typeof parsed?.error === "string" ? parsed.error : text;
 } catch {
 message = text;
 }
 }
 throw new Error(message || `Failed (${res.status})`);
 }
 return res.json();
 },
 onSuccess: () => {
 qc.invalidateQueries({ queryKey: ["/api/vendor/vacation-blocks"] });
 setVacationStart("");
 setVacationEnd("");
 setVacationFormError(null);
 },
 onError: (error: any) => {
 setVacationFormError(error?.message || "Unable to add vacation block.");
 },
 });

 const deleteVacationBlockMutation = useMutation({
 mutationFn: async (blockId: string) => {
 const token = await getAccessTokenSilently({ authorizationParams: { audience: "https://eventhub-api" } });
 const res = await fetch(`/api/vendor/vacation-blocks/${blockId}`, {
 method: "DELETE",
 headers: { Authorization: `Bearer ${token}` },
 });
 if (!res.ok) throw new Error(`Failed (${res.status})`);
 return res.json();
 },
 onSuccess: () => {
 qc.invalidateQueries({ queryKey: ["/api/vendor/vacation-blocks"] });
 },
 onError: (error: any) => {
 toast({ title: "Unable to delete vacation block", description: error?.message, variant: "destructive" });
 },
 });

 const toggleShopStatusMutation = useMutation({
 mutationFn: async (shopActive: boolean) => {
 const token = await getAccessTokenSilently({ authorizationParams: { audience: "https://eventhub-api" } });
 const res = await fetch("/api/vendor/shop-status", {
 method: "PATCH",
 headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
 body: JSON.stringify({ shopActive }),
 });
 if (!res.ok) throw new Error(`Failed (${res.status})`);
 return res.json();
 },
 onSuccess: () => {
 qc.invalidateQueries({ queryKey: ["/api/vendor/me"] });
 setIsShopShutdownDialogOpen(false);
 toast({ title: "Shop status updated" });
 },
 onError: (error: any) => {
 toast({ title: "Unable to update shop status", description: error?.message, variant: "destructive" });
 },
 });

 const shopActive = vendorAccount?.shopActive !== false; // default true

 const selectGoogleCalendarMutation = useMutation({
 mutationFn: async (calendarId: string) => {
 const response = await apiRequest("POST", "/api/google/calendars/select", { calendarId });
 return (await response.json()) as GoogleCalendarSummary;
 },
 onSuccess: async (calendar) => {
 setSelectedGoogleCalendarId(calendar.id);
 await Promise.all([
 qc.invalidateQueries({ queryKey: ["/api/vendor/me"] }),
 qc.invalidateQueries({ queryKey: ["/api/vendor/bookings"] }),
 qc.invalidateQueries({ queryKey: ["/api/google/calendars"] }),
 qc.invalidateQueries({ queryKey: ["/api/google/bookings/reconciliation"] }),
 ]);
 },
 onError: (error: any) => {
 toast({
 title: "Unable to save Google calendar",
 description: error?.message || "Please try again.",
 variant: "destructive",
 });
 },
 });



 const syncExistingGoogleBookingsMutation = useMutation({
 mutationFn: async () => {
 const response = await apiRequest("POST", "/api/google/calendars/sync-existing", {});
 return (await response.json()) as GoogleCalendarSyncExistingResponse;
 },
 onSuccess: async () => {
 await Promise.all([
 qc.invalidateQueries({ queryKey: ["/api/vendor/bookings"] }),
 qc.invalidateQueries({ queryKey: ["/api/google/bookings/reconciliation"] }),
 qc.invalidateQueries({ queryKey: ["/api/google/bookings/verification/run"] }),
 ]);
 },
 onError: (error: any) => {
 toast({
 title: "Unable to sync existing bookings",
 description: error?.message || "Please try again.",
 variant: "destructive",
 });
 },
 });

 const disconnectGoogleCalendarMutation = useMutation({
 mutationFn: async () => {
 const response = await apiRequest("POST", "/api/google/oauth/disconnect", {});
 if (!response.ok) {
 const body = await response.json().catch(() => ({}));
 throw new Error((body as any)?.error || "Failed to disconnect");
 }
 return response.json();
 },
 onSuccess: async () => {
 setIsDisconnectGoogleCalendarDialogOpen(false);
 await qc.invalidateQueries({ queryKey: ["/api/vendor/me"] });
 toast({ title: "Google Calendar disconnected" });
 },
 onError: (error: any) => {
 toast({
 title: "Unable to disconnect Google Calendar",
 description: error?.message || "Please try again.",
 variant: "destructive",
 });
 },
 });

 const mapGoogleEventMutation = useMutation({
 mutationFn: async (input: { googleEventId: string; listingId: string }) => {
 const response = await apiRequest("POST", "/api/google/events/map", input);
 return response.json();
 },
 onSuccess: async (_result, variables) => {
 setGoogleEventMappingErrorMessage(null);
 setSelectedListingIdByGoogleEventId((prev) => {
 const next = { ...prev };
 delete next[variables.googleEventId];
 return next;
 });
 await qc.invalidateQueries({ queryKey: ["/api/google/events/unmatched"] });
 toast({
 title: "Google event mapped",
 description: "That event is now linked to the selected listing.",
 });
 },
 onError: (error: any) => {
 const message = error?.message || "Unable to save Google event mapping.";
 setGoogleEventMappingErrorMessage(message);
 toast({
 title: "Unable to map Google event",
 description: message,
 variant: "destructive",
 });
 },
 });

 const markGoogleEventAsVacationMutation = useMutation({
 mutationFn: async (googleEventId: string) => {
 const response = await apiRequest("POST", "/api/google/events/mark-vacation", { googleEventId });
 return response.json();
 },
 onSuccess: async () => {
 await qc.invalidateQueries({ queryKey: ["/api/google/events/unmatched"] });
 await qc.invalidateQueries({ queryKey: ["/api/vendor/vacation-blocks"] });
 toast({
 title: "Vacation block created",
 description: "This Google Calendar event is now marked as a vacation block.",
 });
 },
 onError: (error: any) => {
 toast({
 title: "Unable to mark as vacation block",
 description: error?.message || "Something went wrong.",
 variant: "destructive",
 });
 },
 });

 const repairGoogleBookingMutation = useMutation({
 mutationFn: async (bookingId: string) => {
 const response = await apiRequest("POST", `/api/google/bookings/reconciliation/${bookingId}/repair`, {});
 return response.json();
 },
 onSuccess: async () => {
 setGoogleBookingRepairMessage(null);
 await qc.invalidateQueries({ queryKey: ["/api/google/bookings/reconciliation"] });
 toast({
 title: "Google booking repaired",
 description: "Booking sync was refreshed against the selected Google calendar.",
 });
 },
 onError: (error: any) => {
 const message = error?.message || "Unable to repair Google booking sync.";
 setGoogleBookingRepairMessage(message);
 toast({
 title: "Unable to repair Google booking sync",
 description: message,
 variant: "destructive",
 });
 },
 });

 const profileLifecycleMutation = useMutation({
 mutationFn: async () => {
 if (!activeProfileId) {
 throw new Error("Select a profile first.");
 }
 const action = isSelectedProfileOperational ? "deactivate" : "reactivate";
 const response = await apiRequest("POST", `/api/vendor/profiles/${activeProfileId}/${action}`, {});
 return response.json() as Promise<{
 active?: boolean;
 listingsInactivated?: number;
 }>;
 },
 onSuccess: async (payload) => {
 setIsProfileLifecycleDialogOpen(false);
 await Promise.all([
 qc.invalidateQueries({ queryKey: ["/api/vendor/me"] }),
 qc.invalidateQueries({ queryKey: ["/api/vendor/profile"] }),
 qc.invalidateQueries({ queryKey: ["/api/vendor/profiles"] }),
 qc.invalidateQueries({ queryKey: ["/api/vendor/listings"] }),
 qc.invalidateQueries({ queryKey: ["/api/listings/public"] }),
 qc.invalidateQueries({ queryKey: ["/api/vendor/bookings"] }),
 qc.invalidateQueries({ queryKey: ["/api/vendor/stats"] }),
 ]);

 const listingsInactivated = Number(payload?.listingsInactivated || 0);
 if (payload?.active === false) {
 toast({
 title: "Profile deactivated",
 description:
 `${activeProfileLabel} is inactive. ${listingsInactivated} listing${listingsInactivated === 1 ? "" : "s"} moved to inactive. ` +
 "Profile data is preserved and can be reactivated later.",
 });
 } else {
 toast({
 title: "Profile reactivated",
 description:
 `${activeProfileLabel} is active again. Existing listings stay inactive until you manually republish them.`,
 });
 }
 },
 onError: (error: any) => {
 toast({
 title: "Unable to update profile status",
 description: error?.message || "Please try again.",
 variant: "destructive",
 });
 },
 });

 const deleteVendorAccountMutation = useMutation({
 mutationFn: async () => {
 const response = await apiRequest("POST", "/api/vendor/me/delete", {});
 return response.json() as Promise<{
 deleted?: boolean;
 listingsInactivated?: number;
 profilesDeactivated?: number;
 preservedHistoricalBookings?: number;
 }>;
 },
 onSuccess: async (payload) => {
 setIsDeleteAccountDialogOpen(false);
 await Promise.all([
 qc.invalidateQueries({ queryKey: ["/api/vendor/me"] }),
 qc.invalidateQueries({ queryKey: ["/api/vendor/profile"] }),
 qc.invalidateQueries({ queryKey: ["/api/vendor/profiles"] }),
 qc.invalidateQueries({ queryKey: ["/api/vendor/listings"] }),
 qc.invalidateQueries({ queryKey: ["/api/listings/public"] }),
 ]);

 const listingsInactivated = Number(payload?.listingsInactivated || 0);
 const profilesDeactivated = Number(payload?.profilesDeactivated || 0);
 const preservedBookings = Number(payload?.preservedHistoricalBookings || 0);
 toast({
 title: "Account deleted",
 description:
 `Vendor access removed. ${profilesDeactivated} profile${profilesDeactivated === 1 ? "" : "s"} and ` +
 `${listingsInactivated} listing${listingsInactivated === 1 ? "" : "s"} were set inactive. ` +
 `${preservedBookings} historical booking${preservedBookings === 1 ? "" : "s"} preserved.`,
 });

 setTimeout(() => {
 logout({ logoutParams: { returnTo: window.location.origin } });
 }, 700);
 },
 onError: (error: any) => {
 toast({
 title: "Unable to delete account",
 description: error?.message || "Please try again.",
 variant: "destructive",
 });
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

 const handleConnectGoogleCalendar = async () => {
 try {
 setIsGoogleCalendarConnectLoading(true);

 const token = await getAccessTokenSilently({
 authorizationParams: {
 audience: "https://eventhub-api",
 scope: "openid profile email",
 },
 });

 const response = await fetch("/api/google/oauth/start?returnTo=%2Fvendor%2Fdashboard", {
 method: "GET",
 headers: {
 Authorization: `Bearer ${token}`,
 },
 credentials: "include",
 });

 const data = (await response.json()) as { url?: string | null; error?: string };
 if (!response.ok) {
 throw new Error(data?.error || "Unable to start Google Calendar connection");
 }

 const url = typeof data?.url === "string" ? data.url.trim() : "";
 if (!url) {
 throw new Error("Google OAuth start URL was not returned");
 }

 window.location.assign(url);
 } catch (error: any) {
 setIsGoogleCalendarConnectLoading(false);
 toast({
 title: "Unable to connect Google Calendar",
 description: error?.message || "Please try again.",
 variant: "destructive",
 });
 }
 };

 useEffect(() => {
 const params = new URLSearchParams(window.location.search);
 const googleCalendarParam = params.get("google_calendar");
 if (!googleCalendarParam) return;

 // Clean the query param from the URL immediately
 params.delete("google_calendar");
 const newSearch = params.toString();
 const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "");
 window.history.replaceState(null, "", newUrl);

 if (googleCalendarParam === "connected") {
 toast({
 title: "Google Calendar connected",
 description: "Your Google Calendar has been successfully linked.",
 });
 qc.invalidateQueries({ queryKey: ["/api/vendor/me"] });
 } else if (googleCalendarParam === "error") {
 toast({
 title: "Google Calendar connection failed",
 description: "Something went wrong connecting your calendar. Please try again.",
 variant: "destructive",
 });
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 useEffect(() => {
 if (!isAuthLoading && !isAuthenticated) {
 const returnTo =
 typeof window !== "undefined"
 ? `${window.location.pathname}${window.location.search}${window.location.hash}`
 : location || "/vendor/dashboard";
 setLocation(`/vendor/login?returnTo=${encodeURIComponent(returnTo)}`);
 }
 }, [isAuthLoading, isAuthenticated, location, setLocation]);

 const showLoading = isAuthLoading || vendorDetection.status === "loading" || isStatsLoading || isProfileLoading;
 const formatMoneyFromCents = (cents: number) =>
 new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
 const showStripeSetupCard = !vendorAccount?.stripeOnboardingComplete;
 // Launch-comp publish countdown. daysLeft floors at 0 ("due today") — past-due
 // vendors keep seeing the banner until the daily enforcement job runs.
 const compPublishDeadline = vendorAccount?.compPublishRequirement?.deadline
 ? new Date(vendorAccount.compPublishRequirement.deadline)
 : null;
 const compPublishDaysLeft = compPublishDeadline
 ? Math.max(0, Math.ceil((compPublishDeadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
 : null;
 const dashboardDividerBorderClass = "border-[rgba(74,106,125,0.22)]";
 const dashboardDividerBgClass = "bg-[rgba(74,106,125,0.22)]";
 const selectedGoogleCalendar = googleCalendars.find((calendar) => calendar.id === (vendorAccount?.googleCalendarId || ""));
 const googleCalendarErrorMessage =
 googleCalendarsError instanceof Error ? googleCalendarsError.message : null;
 const vendorListingsErrorMessage =
 vendorListingsError instanceof Error ? vendorListingsError.message : null;
 const unmatchedGoogleEventsErrorMessage =
 unmatchedGoogleEventsError instanceof Error ? unmatchedGoogleEventsError.message : null;
 const googleBookingReconciliationErrorMessage =
 googleBookingReconciliationError instanceof Error ? googleBookingReconciliationError.message : null;
 const vendorListingOptions = useMemo(
 () =>
 vendorListings
 .map((listing) => {
 const title = typeof listing.title === "string" && listing.title.trim() ? listing.title.trim() : null;
 if (!title) return null;
 const status = typeof listing.status === "string" && listing.status.trim() ? listing.status.trim() : null;
 return {
 id: listing.id,
 label: status && status !== "active" ? `${title} (${status})` : title,
 };
 })
 .filter((listing): listing is { id: string; label: string } => Boolean(listing)),
 [vendorListings]
 );
 const canSaveSelectedGoogleCalendar =
 Boolean(selectedGoogleCalendarId) &&
 selectedGoogleCalendarId !== (vendorAccount?.googleCalendarId || "") &&
 !selectGoogleCalendarMutation.isPending;
 const isGoogleCalendarSelectionSubmitting =
 selectGoogleCalendarMutation.isPending ||
 syncExistingGoogleBookingsMutation.isPending;



 const openGoogleCalendarSelectionPrompt = () => {
 if (!selectedGoogleCalendarId) return;
 const calendar =
 googleCalendars.find((item) => item.id === selectedGoogleCalendarId) ||
 (selectedGoogleCalendarId
 ? ({
 id: selectedGoogleCalendarId,
 summary: selectedGoogleCalendarId,
 primary: false,
 accessRole: null,
 backgroundColor: null,
 } as GoogleCalendarSummary)
 : null);
 if (!calendar) return;

 setPendingGoogleCalendarSelection({
 calendarId: calendar.id,
 calendarSummary: calendar.summary,
 alreadySelected: false,
 isSwitch:
 Boolean(vendorAccount?.googleCalendarId) &&
 vendorAccount?.googleCalendarId !== calendar.id,
 });
 };

 const handleConfirmGoogleCalendarSelection = async (syncExisting: boolean) => {
 const pendingSelection = pendingGoogleCalendarSelection;
 if (!pendingSelection) return;

 try {
 let selectedCalendarSummary = pendingSelection.calendarSummary;

 if (!pendingSelection.alreadySelected) {
 const savedCalendar = await selectGoogleCalendarMutation.mutateAsync(pendingSelection.calendarId);
 selectedCalendarSummary = savedCalendar.summary;
 }

 if (syncExisting) {
 const syncSummary = await syncExistingGoogleBookingsMutation.mutateAsync();
 toast({
 title: "Google calendar synced",
 description:
 syncSummary.failedCount > 0
 ? `${syncSummary.syncedCount} booking${syncSummary.syncedCount === 1 ? "" : "s"} synced to ${selectedCalendarSummary}. ${syncSummary.failedCount} failed.`
 : `${syncSummary.syncedCount} booking${syncSummary.syncedCount === 1 ? "" : "s"} synced to ${selectedCalendarSummary}.`,
 variant: syncSummary.failedCount > 0 ? "destructive" : "default",
 });
 } else {
 toast({
 title: "Google calendar saved",
 description: `${selectedCalendarSummary} is now selected for EventHub.`,
 });
 }

 setPendingGoogleCalendarSelection(null);
 } catch {
 // Individual mutations already surface clear error toasts.
 }
 };

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

 if (vendorDetection.status === "auth_error") {
 return (
 <VendorShell onOpenAccountSettings={() => setIsAccountSettingsDialogOpen(true)}>
 <div className="mx-auto max-w-2xl rounded-lg border p-5 text-sm text-muted-foreground">
 {t("vendorDashboard.authError")}
 </div>
 </VendorShell>
 );
 }

 if (vendorDetection.status === "non_vendor") {
 return (
 <VendorShell onOpenAccountSettings={() => setIsAccountSettingsDialogOpen(true)}>
 <div className="mx-auto max-w-2xl space-y-3 rounded-lg border p-5 text-sm text-muted-foreground">
 <p>{t("vendorDashboard.nonVendor")}</p>
 </div>
 </VendorShell>
 );
 }

 const showNoActiveProfilePrompt =
 vendorDetection.status === "vendor" &&
 vendorDetection.hasVendorAccount &&
 !vendorDetection.hasActiveVendorProfile;

 return (
 <VendorShell onOpenAccountSettings={() => setIsAccountSettingsDialogOpen(true)}>
 <div className="max-w-7xl mx-auto space-y-6">
 <div>
 <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
 {t("vendorDashboard.pageTitle")}
 </h1>
 </div>

 {showNoActiveProfilePrompt ? (
 <div className="rounded-lg border p-4">
 <p className="text-sm text-muted-foreground">
 {t("vendorDashboard.noActiveProfileDesc")}
 {vendorDetection.hasAnyVendorProfiles
 ? t("vendorDashboard.noActiveProfileSelectOrCreate")
 : t("vendorDashboard.noActiveProfileCreateFirst")}
 </p>
 <div className="mt-3">
 <Button
 type="button"
 variant="outline"
 onClick={() => setLocation("/vendor/onboarding?createProfile=1")}
 data-testid="button-dashboard-no-active-profile-create"
 >
 {t("vendorDashboard.createProfile")}
 </Button>
 </div>
 </div>
 ) : null}

 <div className="space-y-0">
 <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-0">
 {/* Total bookings — lifetime total always visible; monthly trend is Pro-only */}
 <div className="px-5 py-4">
 <div className="mb-3 flex items-center justify-between">
 <h2 className="font-heading text-[20px] leading-none tracking-tight">{t("vendorDashboard.totalBookings")}</h2>
 <Calendar className="h-4 w-4 text-muted-foreground" />
 </div>
 <div className="text-2xl font-bold" data-testid="stat-bookings">
 {stats?.totalBookings ?? 0}
 </div>
 {analyticsLocked ? (
 <p className="text-sm text-muted-foreground">Lifetime</p>
 ) : (
 <p className="text-sm text-muted-foreground flex items-center gap-1">
 <TrendingUp className="h-3 w-3" />+{stats?.bookingsThisMonth ?? 0} {t("vendorDashboard.thisMonth")}
 </p>
 )}
 </div>

 <div className="hidden px-2 md:flex md:items-center md:justify-center">
 <div className={cn("h-14 w-px", dashboardDividerBgClass)} />
 </div>

 {/* Revenue — lifetime total always visible; growth % is Pro-only */}
 <div className="px-5 py-4">
 <div className="mb-3 flex items-center justify-between">
 <h2 className="font-heading text-[20px] leading-none tracking-tight">{t("vendorDashboard.revenue")}</h2>
 <DollarSign className="h-4 w-4 text-muted-foreground" />
 </div>
 <div className="text-2xl font-bold" data-testid="stat-revenue">
 {formatMoneyFromCents(Number(stats?.revenue ?? 0))}
 </div>
 {analyticsLocked ? (
 <p className="text-sm text-muted-foreground">Lifetime</p>
 ) : (
 <p className="text-sm text-muted-foreground flex items-center gap-1">
 <TrendingUp className="h-3 w-3" />
 {Number(stats?.revenueGrowth ?? 0) >= 0 ? "+" : ""}{stats?.revenueGrowth ?? 0}{t("vendorDashboard.fromLastMonth")}
 </p>
 )}
 </div>

 <div className="hidden px-2 md:flex md:items-center md:justify-center">
 <div className={cn("h-14 w-px", dashboardDividerBgClass)} />
 </div>

 {/* Profile views — Pro-only; replaced with an upsell for Free vendors */}
 {analyticsLocked ? (
 <button type="button" onClick={() => upgrade.open()} className="group flex flex-col justify-center px-5 py-4 text-left" data-testid="analytics-upsell">
 <div className="mb-1 flex items-center gap-2">
 <h2 className="font-heading text-[20px] leading-none tracking-tight text-[#4a6a7d]">{t("vendorDashboard.profileViews")}</h2>
 <Lock className="h-3.5 w-3.5 text-[#4a6a7d]" />
 </div>
 <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[#4a6a7d] px-3 py-1 text-sm font-medium text-[#f5f0e8] group-hover:bg-[#3f5c6d]">
 <Sparkles className="h-3.5 w-3.5" /> {t("vendorDashboard.unlockWithPro")}
 </span>
 <p className="mt-1.5 text-xs text-muted-foreground">{t("vendorDashboard.analyticsUpsellDesc")}</p>
 </button>
 ) : (
 <div className="px-5 py-4">
 <div className="mb-3 flex items-center justify-between">
 <h2 className="font-heading text-[20px] leading-none tracking-tight">{t("vendorDashboard.profileViews")}</h2>
 <Users className="h-4 w-4 text-muted-foreground" />
 </div>
 <div className="text-2xl font-bold" data-testid="stat-views">
 {(stats?.profileViews ?? 0).toLocaleString()}
 </div>
 <p className="text-sm text-muted-foreground flex items-center gap-1">
 <TrendingUp className="h-3 w-3" />
 {Number(stats?.profileViewsGrowth ?? 0) >= 0 ? "+" : ""}{stats?.profileViewsGrowth ?? 0}{t("vendorDashboard.thisWeek")}
 </p>
 </div>
 )}
 </div>

 <div className="space-y-8">

 <KeepProModal
 open={keepProOpen}
 onOpenChange={setKeepProOpen}
 daysLeft={vendorAccount?.reverseTrial?.daysLeft ?? null}
 trialEndsAt={vendorAccount?.reverseTrial?.trialEndsAt ?? null}
 />

 {vendorAccount?.reverseTrial?.active ? (
 <div
 className="rounded-xl border border-[#4a6a7d]/40 bg-[#4a6a7d]/10 p-6"
 data-testid="section-reverse-trial-card-prompt"
 >
 <div className="flex flex-wrap items-center gap-3">
 <h2 className="font-heading text-[20px] leading-none tracking-tight">
 You're on Pro — free for now
 </h2>
 <span className="inline-flex items-center gap-1.5 rounded-full bg-[#4a6a7d] px-3 py-1 text-sm font-semibold text-white">
 <Clock className="h-3.5 w-3.5" />
 {(vendorAccount.reverseTrial.daysLeft ?? 0) <= 0
 ? "Trial ends today"
 : `${vendorAccount.reverseTrial.daysLeft} day${vendorAccount.reverseTrial.daysLeft === 1 ? "" : "s"} left`}
 </span>
 </div>
 <p className="mt-3 text-sm text-[#2a3a42]">
 You're enjoying full Pro — unlimited listings, analytics, and calendar sync. Add a card to
 keep it when your free trial ends. You won't be charged until then, and you can cancel anytime.
 </p>
 <div className="mt-5">
 <Button onClick={() => setKeepProOpen(true)} data-testid="button-reverse-trial-keep-pro">
 Add a card to keep Pro
 </Button>
 </div>
 </div>
 ) : null}

 {compPublishDeadline && compPublishDaysLeft !== null ? (
 <div
 className="rounded-xl border border-[#E07A6A]/50 bg-[#E07A6A]/10 p-6"
 data-testid="section-comp-publish-countdown"
 >
 <div className="flex flex-wrap items-center gap-3">
 <h2 className="font-heading text-[20px] leading-none tracking-tight">
 {t("vendorDashboard.compPublishTitle")}
 </h2>
 <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E07A6A] px-3 py-1 text-sm font-semibold text-white">
 <Clock className="h-3.5 w-3.5" />
 {compPublishDaysLeft === 0
 ? t("vendorDashboard.compPublishDueToday")
 : t("vendorDashboard.compPublishDaysLeft", { count: compPublishDaysLeft })}
 </span>
 </div>
 <p className="mt-3 text-sm text-[#2a3a42]">
 {t("vendorDashboard.compPublishBody", {
 deadline: compPublishDeadline.toLocaleDateString(i18n.language, {
 month: "long",
 day: "numeric",
 }),
 })}
 </p>
 {vendorAccount?.compPublishRequirement?.graceApplied ? (
 <p className="mt-2 text-sm text-muted-foreground">
 {t("vendorDashboard.compPublishGraceNote")}
 </p>
 ) : null}
 <div className="mt-5">
 <Button
 onClick={() => setLocation("/vendor/listings")}
 data-testid="button-comp-publish-cta"
 >
 {t("vendorDashboard.compPublishCta")}
 </Button>
 </div>
 </div>
 ) : null}

 {showStripeSetupCard ? (
 <div className="rounded-xl border border-[hsl(var(--secondary-accent)/0.45)] bg-[hsl(var(--secondary-accent)/0.12)] p-6" data-testid="section-stripe-setup">
 <h2 className="font-heading text-[20px] leading-none tracking-tight">{t("vendorDashboard.completeSetup")}</h2>
 <div className="mt-6">
 <Button
 onClick={handleCompletePaymentSetup}
 disabled={isStripeSetupLoading}
 data-testid="button-complete-setup"
 >
 {isStripeSetupLoading ? t("vendorDashboard.openingStripe") : t("vendorDashboard.completePaymentSetup")}
 </Button>
 </div>
 </div>
 ) : null}

 <div className="rounded-xl border border-[hsl(var(--secondary-accent)/0.45)] bg-[hsl(var(--secondary-accent)/0.12)] p-6" data-testid="section-google-calendar">
 <h2 className="font-heading text-[20px] leading-none tracking-tight">{t("vendorDashboard.googleCalendar")}</h2>
 <div className="mt-4 text-sm">
 <span className="font-medium text-foreground">{t("vendorDashboard.statusLabel")} </span>
 <span className={isGoogleConnected ? "text-foreground" : "text-muted-foreground"}>
 {isGoogleConnected ? t("vendorDashboard.googleConnected") : t("vendorDashboard.googleNotConnected")}
 </span>
 </div>
 {vendorAccount?.googleAccountEmail ? (
 <div className="mt-1 text-sm text-muted-foreground">
 Connected as {vendorAccount.googleAccountEmail}
 </div>
 ) : null}
 {vendorAccount?.googleCalendarId ? (
 <div className="mt-2 text-sm text-muted-foreground">
 {t("vendorDashboard.currentCalendar")} {selectedGoogleCalendar?.summary || vendorAccount.googleCalendarId}
 </div>
 ) : null}

 {vendorAccount?.canUseGoogleSync === false ? (
 <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-[#4a6a7d]/30 bg-[#4a6a7d]/8 p-4">
 <Lock className="h-4 w-4 shrink-0 text-[#4a6a7d]" />
 <p className="flex-1 text-sm text-[#2a3a42]">
 {t("vendorDashboard.googleSyncProFeature")}
 </p>
 <Button onClick={() => upgrade.open()} size="sm" className="bg-[#4a6a7d] hover:bg-[#3f5c6d] text-[#f5f0e8]">
 <Sparkles className="mr-1 h-3.5 w-3.5" /> {t("vendorDashboard.upgradeToPro")}
 </Button>
 </div>
 ) : !isGoogleConnected ? (
 <div className="mt-6">
 <Button
 onClick={handleConnectGoogleCalendar}
 disabled={isGoogleCalendarConnectLoading}
 data-testid="button-connect-google-calendar"
 >
 {isGoogleCalendarConnectLoading ? t("vendorDashboard.openingGoogle") : t("vendorDashboard.googleConnectButton")}
 </Button>
 </div>
 ) : (
 <div className="mt-6 space-y-4">
 <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
 <div className="space-y-2">
 <Label htmlFor="google-calendar-select">{t("vendorDashboard.selectedCalendar")}</Label>
 <Select value={selectedGoogleCalendarId || undefined} onValueChange={setSelectedGoogleCalendarId}>
 <SelectTrigger id="google-calendar-select" data-testid="select-google-calendar">
 <SelectValue placeholder={t("vendorDashboard.chooseGoogleCalendar")} />
 </SelectTrigger>
 <SelectContent>
 {googleCalendars.map((calendar) => (
 <SelectItem key={calendar.id} value={calendar.id}>
 {calendar.primary ? `${calendar.summary} (Primary)` : calendar.summary}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>

 <Button
 onClick={openGoogleCalendarSelectionPrompt}
 disabled={!canSaveSelectedGoogleCalendar}
 data-testid="button-save-google-calendar"
 >
 {selectGoogleCalendarMutation.isPending ? t("vendorDashboard.savingCalendar") : t("vendorDashboard.saveCalendar")}
 </Button>
 </div>

 <div className="flex flex-wrap gap-3">
 <Button
 variant="outline"
 onClick={handleConnectGoogleCalendar}
 disabled={isGoogleCalendarConnectLoading}
 data-testid="button-reconnect-google-calendar"
 >
 {isGoogleCalendarConnectLoading ? t("vendorDashboard.openingGoogle") : t("vendorDashboard.reconnectGoogle")}
 </Button>
 <Button
 variant="outline"
 onClick={() => setIsDisconnectGoogleCalendarDialogOpen(true)}
 disabled={disconnectGoogleCalendarMutation.isPending}
 data-testid="button-disconnect-google-calendar"
 className="text-destructive hover:text-destructive"
 >
 Disconnect
 </Button>
 </div>

 {isGoogleCalendarsLoading || isGoogleCalendarsFetching ? (
 <div className="text-sm text-muted-foreground">{t("vendorDashboard.loadingCalendars")}</div>
 ) : null}
 {!isGoogleCalendarsLoading && googleCalendars.length === 0 ? (
 <div className="text-sm text-muted-foreground">
 {t("vendorDashboard.noGoogleCalendarsFound")}
 </div>
 ) : null}
 {googleCalendarErrorMessage ? (
 <div className="text-sm text-destructive">{googleCalendarErrorMessage}</div>
 ) : null}

 {hasSelectedGoogleCalendar ? (
 <div className={cn("border-t pt-6", dashboardDividerBorderClass)}>
 <h3 className="font-heading text-[18px] leading-none tracking-tight">
 {t("vendorDashboard.unmatchedGoogleEvents")}
 </h3>
 <p className="mt-3 text-sm text-muted-foreground">
 {t("vendorDashboard.reviewGoogleEventsDesc")}
 </p>

 {googleEventMappingErrorMessage ? (
 <div className="mt-4 text-sm text-destructive">{googleEventMappingErrorMessage}</div>
 ) : null}
 {vendorListingsErrorMessage ? (
 <div className="mt-4 text-sm text-destructive">{vendorListingsErrorMessage}</div>
 ) : null}
 {unmatchedGoogleEventsErrorMessage ? (
 <div className="mt-4 text-sm text-destructive">{unmatchedGoogleEventsErrorMessage}</div>
 ) : null}

 {isVendorListingsLoading || isUnmatchedGoogleEventsLoading || isUnmatchedGoogleEventsFetching ? (
 <div className="mt-4 text-sm text-muted-foreground">{t("vendorDashboard.loadingGoogleEvents")}</div>
 ) : null}

 {!isVendorListingsLoading &&
 !isUnmatchedGoogleEventsLoading &&
 !isUnmatchedGoogleEventsFetching &&
 !vendorListingsErrorMessage &&
 !unmatchedGoogleEventsErrorMessage ? (
 vendorListingOptions.length === 0 ? (
 <div className="mt-4 rounded-lg border border-[rgba(74,106,125,0.22)] p-4 text-sm text-muted-foreground">
 {t("vendorDashboard.noListingsForMapping")}
 </div>
 ) : unmatchedGoogleEvents.length === 0 ? (
 <div className="mt-4 rounded-lg border border-[rgba(74,106,125,0.22)] p-4 text-sm text-muted-foreground">
 {t("vendorDashboard.noUnmatchedGoogleEvents")}
 </div>
 ) : (
 <div className="mt-4 space-y-3">
 {unmatchedGoogleEvents.map((event) => {
 const selectedListingId = selectedListingIdByGoogleEventId[event.id] || "";
 const isSavingThisEvent =
 mapGoogleEventMutation.isPending &&
 mapGoogleEventMutation.variables?.googleEventId === event.id;
 const isMarkingVacation =
 markGoogleEventAsVacationMutation.isPending &&
 markGoogleEventAsVacationMutation.variables === event.id;

 return (
 <div
 key={event.id}
 className="rounded-lg border border-[rgba(74,106,125,0.22)] p-4"
 >
 <div className="space-y-2">
 <div className="font-medium text-foreground">
 {event.summary || t("vendorDashboard.untitledGoogleEvent")}
 </div>
 <div className="text-sm text-muted-foreground">
 {t("vendorDashboard.startLabel")} {formatGoogleEventBoundary(event.start)}
 </div>
 <div className="text-sm text-muted-foreground">
 {t("vendorDashboard.endLabel")} {formatGoogleEventBoundary(event.end, { isEnd: true })}
 </div>
 {event.status ? (
 <div className="text-sm text-muted-foreground">
 {t("vendorDashboard.statusEventLabel")} {event.status}
 </div>
 ) : null}
 </div>

 <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
 <div className="space-y-2">
 <Label htmlFor={`google-event-listing-${event.id}`}>{t("vendorDashboard.mapToListing")}</Label>
 <Select
 value={selectedListingId || undefined}
 onValueChange={(listingId) => {
 setGoogleEventMappingErrorMessage(null);
 setSelectedListingIdByGoogleEventId((prev) => ({
 ...prev,
 [event.id]: listingId,
 }));
 }}
 >
 <SelectTrigger
 id={`google-event-listing-${event.id}`}
 data-testid={`select-google-event-listing-${event.id}`}
 >
 <SelectValue placeholder={t("vendorDashboard.chooseListing")} />
 </SelectTrigger>
 <SelectContent>
 {vendorListingOptions.map((listing) => (
 <SelectItem key={listing.id} value={listing.id}>
 {listing.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>

 <Button
 onClick={() => {
 if (!selectedListingId) return;
 mapGoogleEventMutation.mutate({
 googleEventId: event.id,
 listingId: selectedListingId,
 });
 }}
 disabled={!selectedListingId || isSavingThisEvent || isMarkingVacation}
 data-testid={`button-map-google-event-${event.id}`}
 >
 {isSavingThisEvent ? t("vendorDashboard.savingMapping") : t("vendorDashboard.saveMapping")}
 </Button>
 </div>

 <div className="mt-3 border-t border-[rgba(74,106,125,0.12)] pt-3">
 <p className="text-xs text-muted-foreground mb-2">
 {t("vendorDashboard.orTimeOff")}
 </p>
 <Button
 variant="outline"
 size="sm"
 onClick={() => markGoogleEventAsVacationMutation.mutate(event.id)}
 disabled={isMarkingVacation || isSavingThisEvent}
 data-testid={`button-mark-vacation-${event.id}`}
 >
 {isMarkingVacation ? t("vendorDashboard.savingVacation") : t("vendorDashboard.markAsVacation")}
 </Button>
 </div>
 </div>
 );
 })}
 </div>
 )
 ) : null}
 </div>
 ) : null}

 {hasSelectedGoogleCalendar ? (
 <div className={cn("border-t pt-6", dashboardDividerBorderClass)}>
 <h3 className="font-heading text-[18px] leading-none tracking-tight">
 {t("vendorDashboard.googleSyncIssues")}
 </h3>
 <p className="mt-3 text-sm text-muted-foreground">
 {t("vendorDashboard.repairSyncDesc")}
 </p>

 {googleBookingRepairMessage ? (
 <div className="mt-4 text-sm text-destructive">{googleBookingRepairMessage}</div>
 ) : null}
 {googleBookingReconciliationErrorMessage ? (
 <div className="mt-4 text-sm text-destructive">{googleBookingReconciliationErrorMessage}</div>
 ) : null}
 {googleBookingReconciliation?.googleCalendarReadStatus === "failed" &&
 googleBookingReconciliation.googleCalendarReadError ? (
 <div className="mt-4 text-sm text-destructive">
 {googleBookingReconciliation.googleCalendarReadError}
 </div>
 ) : null}

 {isGoogleBookingReconciliationLoading || isGoogleBookingReconciliationFetching ? (
 <div className="mt-4 text-sm text-muted-foreground">
 {t("vendorDashboard.loadingGoogleSyncIssues")}
 </div>
 ) : null}

 {!isGoogleBookingReconciliationLoading &&
 !isGoogleBookingReconciliationFetching &&
 !googleBookingReconciliationErrorMessage ? (
 googleBookingReconciliation?.issues?.length ? (
 <div className="mt-4 space-y-3">
 {googleBookingReconciliation.issues.map((issue) => {
 const bookingId = issue.bookingId || "";
 const isRepairingThisBooking =
 repairGoogleBookingMutation.isPending &&
 repairGoogleBookingMutation.variables === bookingId;

 return (
 <div
 key={bookingId || `${issue.listingId || "listing"}-${issue.createdAt || issue.googleEventId || "issue"}`}
 className="rounded-lg border border-[rgba(74,106,125,0.22)] p-4"
 >
 <div className="space-y-2">
 <div className="font-medium text-foreground">{issue.listingTitle}</div>
 <div className="text-sm text-muted-foreground">
 {t("vendorDashboard.bookingWindow")} {formatDateTimeValue(issue.bookingStartAt)} to{" "}
 {formatDateTimeValue(issue.bookingEndAt)}
 </div>
 <div className="flex flex-wrap gap-2">
 {issue.issueCodes.map((issueCode) => (
 <span
 key={`${bookingId}-${issueCode}`}
 className="rounded-full border border-[rgba(74,106,125,0.22)] px-2 py-1 text-sm text-muted-foreground"
 >
 {formatGoogleSyncIssueCode(issueCode)}
 </span>
 ))}
 </div>
 {issue.googleSyncError ? (
 <div className="text-sm text-destructive">{issue.googleSyncError}</div>
 ) : null}
 </div>

 <div className="mt-4 flex items-center justify-between gap-3">
 <div className="text-sm text-muted-foreground">
 {t("vendorDashboard.bookingId")} {bookingId || t("vendorDashboard.unknownBookingId")}
 </div>
 <Button
 onClick={() => {
 if (!bookingId) return;
 setGoogleBookingRepairMessage(null);
 repairGoogleBookingMutation.mutate(bookingId);
 }}
 disabled={!bookingId || isRepairingThisBooking}
 data-testid={`button-repair-google-booking-${bookingId}`}
 >
 {isRepairingThisBooking ? t("vendorDashboard.repairing") : t("vendorDashboard.repairSync")}
 </Button>
 </div>
 </div>
 );
 })}
 </div>
 ) : (
 <div className="mt-4 rounded-lg border border-[rgba(74,106,125,0.22)] p-4 text-sm text-muted-foreground">
 {t("vendorDashboard.noGoogleSyncIssues")}
 </div>
 )
 ) : null}
 </div>
 ) : null}
 </div>
 )}
 </div>
 </div>

 <div className={cn("my-4 border-t", dashboardDividerBorderClass)} />

 <section className="px-5 py-4">
 <h2 className="font-heading text-[20px] leading-none tracking-tight">{t("vendorDashboard.quickActions")}</h2>
 <div className="mt-5 flex flex-wrap gap-2">
 <Button
 variant="outline"
 size="sm"
 data-testid="button-manage-listings"
 onClick={() => setLocation("/vendor/listings")}
 >
 {t("vendorDashboard.manageListings")}
 </Button>
 <Button
 variant="outline"
 size="sm"
 data-testid="button-view-calendar"
 onClick={() => setLocation("/vendor/bookings")}
 >
 {t("vendorDashboard.viewCalendar")}
 </Button>
 <Button
 variant="outline"
 size="sm"
 data-testid="button-view-payments"
 onClick={() => setLocation("/vendor/payments")}
 >
 {t("vendorDashboard.viewPayments")}
 </Button>
 </div>
 </section>

 <div className={cn("my-4 border-t", dashboardDividerBorderClass)} />
 </div>

 {/* ── Availability ─────────────────────────────────────────────────── */}
 <section className="px-5 pt-4 pb-28 md:pb-32">
 <h2 className="font-heading text-[20px] leading-none tracking-tight">{t("vendorDashboard.availability")}</h2>

 {/* Shop Shutdown panel */}
 <div className={cn(
 "mt-6 rounded-lg border p-4",
 shopActive
 ? "border-[rgba(74,106,125,0.22)]"
 : "border-destructive/40 bg-destructive/5"
 )}>
 <div className="flex items-start justify-between gap-4">
 <div>
 <h3 className="font-medium">
 {t("vendorDashboard.shopStatus")}{" "}
 <span className={shopActive ? "text-green-600 " : "text-destructive"}>
 {shopActive ? t("vendorDashboard.shopOpen") : t("vendorDashboard.shopClosed")}
 </span>
 </h3>
 <p className="mt-1 text-sm text-muted-foreground">
 {shopActive
 ? t("vendorDashboard.shopAcceptingBookings")
 : t("vendorDashboard.shopClosedMessage")}
 </p>
 </div>
 <Button
 variant={shopActive ? "outline" : "default"}
 onClick={() => {
 if (shopActive) {
 setIsShopShutdownDialogOpen(true);
 } else {
 toggleShopStatusMutation.mutate(true);
 }
 }}
 disabled={toggleShopStatusMutation.isPending}
 >
 {toggleShopStatusMutation.isPending
 ? t("vendorDashboard.updating")
 : shopActive
 ? t("vendorDashboard.closeShop")
 : t("vendorDashboard.reopenShop")}
 </Button>
 </div>
 {!shopActive && (
 <div className="mt-3 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
 {t("vendorDashboard.shopClosedWarning")}
 </div>
 )}
 </div>

 {/* Vacation Mode panel */}
 <div className="mt-6 rounded-lg border border-[rgba(74,106,125,0.22)] p-4">
 <h3 className="font-medium">{t("vendorDashboard.vacationBlocks")}</h3>

 <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
 <div className="space-y-1">
 <label className="text-sm font-medium">{t("vendorDashboard.startDate")}</label>
 <input
 type="date"
 value={vacationStart}
 min={new Date().toISOString().split("T")[0]}
 onChange={(e) => { setVacationStart(e.target.value); setVacationFormError(null); }}
 className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
 />
 </div>
 <div className="space-y-1">
 <label className="text-sm font-medium">{t("vendorDashboard.endDate")}</label>
 <input
 type="date"
 value={vacationEnd}
 min={vacationStart || new Date().toISOString().split("T")[0]}
 onChange={(e) => { setVacationEnd(e.target.value); setVacationFormError(null); }}
 className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
 />
 </div>
 <Button
 onClick={() => {
 if (!vacationStart || !vacationEnd) {
 setVacationFormError(t("vendorDashboard.vacationErrorBothDates"));
 return;
 }
 if (vacationEnd < vacationStart) {
 setVacationFormError(t("vendorDashboard.vacationErrorEndDate"));
 return;
 }
 addVacationBlockMutation.mutate({ startDate: vacationStart, endDate: vacationEnd });
 }}
 disabled={addVacationBlockMutation.isPending}
 >
 {addVacationBlockMutation.isPending ? t("vendorDashboard.adding") : t("vendorDashboard.addBlock")}
 </Button>
 </div>

 {vacationFormError && (
 <p className="mt-2 text-sm text-destructive">{vacationFormError}</p>
 )}

 <div className="mt-4">
 {isVacationBlocksLoading ? (
 <div className="text-sm text-muted-foreground">{t("vendorDashboard.loading")}</div>
 ) : vacationBlocks.length === 0 ? (
 <div className="rounded-lg border border-[rgba(74,106,125,0.22)] p-4 text-sm text-muted-foreground">
 {t("vendorDashboard.noVacationBlocks")}
 </div>
 ) : (
 <div className="space-y-2">
 {vacationBlocks.map((block) => (
 <div
 key={block.id}
 className="flex items-center justify-between rounded-lg border border-[rgba(74,106,125,0.22)] px-4 py-2"
 >
 <span className="text-sm">
 {fmtDate(block.startDate)} → {fmtDate(block.endDate)}
 </span>
 <Button
 variant="ghost"
 size="sm"
 className="text-destructive hover:text-destructive"
 onClick={() => deleteVacationBlockMutation.mutate(block.id)}
 disabled={deleteVacationBlockMutation.isPending && deleteVacationBlockMutation.variables === block.id}
 >
 {t("vendorDashboard.remove")}
 </Button>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 </section>

 <section className="px-5 py-4">
 <h2 className="font-heading text-[20px] leading-none tracking-tight">{t("vendorDashboard.profileDetails")}</h2>

 <div className="mt-5 space-y-6">
 {isProfileError ? (
 <div className="rounded-lg border p-4 text-sm text-muted-foreground">
 No vendor profile found yet. Complete onboarding first, then you can edit your
 profile here.
 </div>
 ) : null}

 <div className="space-y-3">
 <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{t("vendorDashboard.accountInfo")}</h3>
 <div className="grid gap-4 md:grid-cols-2">
 <div className="space-y-2">
 <Label>{t("vendorDashboard.accountName")}</Label>
 <Input value={vendorAccount?.accountBusinessName || vendorAccount?.businessName || ""} readOnly />
 </div>
 <div className="space-y-2">
 <Label>{t("vendorDashboard.accountEmail")}</Label>
 <Input value={vendorAccount?.email || ""} readOnly />
 </div>
 </div>
 </div>

 <div className="space-y-3">
 <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{t("vendorDashboard.profileInfo")}</h3>
 </div>

 <div className="space-y-2">
 <Label>{t("vendorDashboard.publicBusinessName")}</Label>
 <Input
 value={businessNameDraft}
 onChange={(e) => setBusinessNameDraft(e.target.value)}
 onBlur={(e) => setBusinessNameDraft(normalizeProfileNameInput(e.target.value))}
 placeholder={t("vendorDashboard.publicBusinessNamePlaceholder")}
 maxLength={120}
 />
 </div>

 {vendorProfiles.length > 0 ? (
 <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
 <div className="space-y-2">
 <Label>{t("vendorDashboard.selectedProfile")}</Label>
 <Select
 value={activeProfileId || undefined}
 onValueChange={(nextProfileId) => {
 if (!nextProfileId || nextProfileId === activeProfileId || switchProfile.isPending) return;
 switchProfile.mutate(nextProfileId);
 }}
 disabled={switchProfile.isPending}
 >
 <SelectTrigger data-testid="select-dashboard-active-profile">
 <SelectValue placeholder={t("vendorDashboard.selectProfilePlaceholder")} />
 </SelectTrigger>
 <SelectContent>
 {vendorProfiles.map((profile) => (
 <SelectItem key={profile.id} value={profile.id}>
 {profile.profileName}
 {profile.isOperational === false ? t("vendorDashboard.profileInactive") : ""}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </div>
 ) : null}

 <div className="grid gap-4 md:grid-cols-2">
 <div className="space-y-2">
 <Label>{t("vendorDashboard.businessPhone")}</Label>
 <Input
 value={businessPhoneDraft}
 onChange={(e) => setBusinessPhoneDraft(e.target.value)}
 placeholder={t("vendorDashboard.businessPhonePlaceholder")}
 />
 </div>

 <div className="space-y-2">
 <Label>{t("vendorDashboard.businessEmail")}</Label>
 <Input
 value={businessEmailDraft}
 onChange={(e) => setBusinessEmailDraft(e.target.value)}
 placeholder={t("vendorDashboard.businessEmailPlaceholder")}
 type="email"
 />
 </div>
 </div>

 <div className="space-y-2">
 <Label>{t("vendorDashboard.businessAddress")}</Label>

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
 placeholder={t("vendorDashboard.businessAddressPlaceholder")}
 />

 {!homeBaseLocationDraft ? (
 <p className="text-sm text-destructive">
 {t("vendorDashboard.addressVerifyRequired")}
 </p>
 ) : (
 <p className="text-sm text-muted-foreground">
 {t("vendorDashboard.addressVerifyHint")}
 </p>
 )}
 </div>

 <div className="space-y-2">
 <Label>{t("vendorDashboard.streetAddress")}</Label>
 <Input
 value={streetAddressDraft}
 onChange={(e) => {
 setStreetAddressDraft(e.target.value);
 setHomeBaseLocationDraft(null);
 setMarketLocationDraft(null);
 }}
 placeholder={t("vendorDashboard.streetAddressPlaceholder")}
 />
 </div>

 <div className="grid gap-4 md:grid-cols-3">
 <div className="space-y-2">
 <Label>{t("vendorDashboard.city")}</Label>
 <Input
 value={cityDraft}
 onChange={(e) => {
 setCityDraft(e.target.value);
 setHomeBaseLocationDraft(null);
 setMarketLocationDraft(null);
 }}
 placeholder={t("vendorDashboard.cityPlaceholder")}
 />
 </div>

 <div className="space-y-2">
 <Label>{t("vendorDashboard.state")}</Label>
 <Input
 value={stateDraft}
 onChange={(e) => {
 setStateDraft(e.target.value);
 setHomeBaseLocationDraft(null);
 setMarketLocationDraft(null);
 }}
 placeholder={t("vendorDashboard.statePlaceholder")}
 />
 </div>

 <div className="space-y-2">
 <Label>{t("vendorDashboard.zip")}</Label>
 <Input
 value={zipCodeDraft}
 onChange={(e) => {
 setZipCodeDraft(e.target.value);
 setHomeBaseLocationDraft(null);
 setMarketLocationDraft(null);
 }}
 placeholder={t("vendorDashboard.zipPlaceholder")}
 />
 </div>
 </div>

 <div className="grid gap-4 md:grid-cols-2 items-end">
 <div className="space-y-2">
 <Label>{t("vendorDashboard.serviceRadius")}</Label>
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

 <div className="flex items-center justify-end gap-2">
 <Button
 onClick={() => saveProfile.mutate()}
 disabled={saveProfile.isPending || isProfileError}
 data-testid="button-save-profile-details"
 >
 {saveProfile.isPending ? t("vendorDashboard.saving") : t("vendorDashboard.saveChanges")}
 </Button>
 </div>

 </div>
 </section>

 <section id="vendor-billing" className="scroll-mt-24 rounded-xl border border-[rgba(74,106,125,0.22)] p-6">
 <VendorBillingPanel />
 </section>

 {/* Disconnect Google Calendar confirmation dialog */}
 <Dialog open={isDisconnectGoogleCalendarDialogOpen} onOpenChange={setIsDisconnectGoogleCalendarDialogOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle>Disconnect Google Calendar?</DialogTitle>
 <DialogDescription>
 Your existing bookings will keep their calendar events, but no new events will be synced until you reconnect.
 </DialogDescription>
 </DialogHeader>
 <DialogFooter className="flex gap-2 sm:justify-end">
 <Button
 variant="outline"
 onClick={() => setIsDisconnectGoogleCalendarDialogOpen(false)}
 disabled={disconnectGoogleCalendarMutation.isPending}
 >
 Cancel
 </Button>
 <Button
 variant="destructive"
 onClick={() => disconnectGoogleCalendarMutation.mutate()}
 disabled={disconnectGoogleCalendarMutation.isPending}
 >
 {disconnectGoogleCalendarMutation.isPending ? "Disconnecting…" : "Disconnect"}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* Shop Shutdown confirmation dialog */}
 <Dialog open={isShopShutdownDialogOpen} onOpenChange={setIsShopShutdownDialogOpen}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle>{t("vendorDashboard.closeShopDialogTitle")}</DialogTitle>
 <DialogDescription>
 {t("vendorDashboard.closeShopDialogDescription")}
 </DialogDescription>
 </DialogHeader>
 <div className="rounded-md border border-destructive/35 bg-destructive/10 p-3 text-sm text-muted-foreground">
 <ul className="list-disc space-y-1 pl-5">
 <li>{t("vendorDashboard.closeShopBullet1")}</li>
 <li>{t("vendorDashboard.closeShopBullet2")}</li>
 <li>{t("vendorDashboard.closeShopBullet3")}</li>
 </ul>
 </div>
 <DialogFooter className="gap-2 sm:justify-end">
 <Button
 variant="outline"
 onClick={() => setIsShopShutdownDialogOpen(false)}
 disabled={toggleShopStatusMutation.isPending}
 >
 {t("vendorDashboard.cancel")}
 </Button>
 <Button
 variant="destructive"
 onClick={() => toggleShopStatusMutation.mutate(false)}
 disabled={toggleShopStatusMutation.isPending}
 >
 {toggleShopStatusMutation.isPending ? t("vendorDashboard.closing") : t("vendorDashboard.closeShop")}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 <Dialog
 open={isAccountSettingsDialogOpen}
 onOpenChange={(open) => setIsAccountSettingsDialogOpen(open)}
 >
 <DialogContent className="sm:max-w-2xl">
 <DialogHeader>
 <DialogTitle>{t("vendorDashboard.accountSettings")}</DialogTitle>
 <DialogDescription>
 {t("vendorDashboard.accountSettingsDescription")}
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-3">
 <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{t("vendorDashboard.dangerZone")}</h3>

 <div className="rounded-lg border border-destructive/35 bg-destructive/10 p-4">
 <div className="text-sm font-medium text-destructive">
 {isSelectedProfileOperational ? t("vendorDashboard.deactivateProfile") : t("vendorDashboard.reactivateProfile")}
 </div>
 <p className="mt-2 text-sm text-muted-foreground">
 {isSelectedProfileOperational
 ? t("vendorDashboard.deactivateProfileDesc", { name: activeProfileLabel })
 : t("vendorDashboard.reactivateProfileDesc", { name: activeProfileLabel })}
 </p>
 <div className="mt-4">
 <Button
 type="button"
 variant={isSelectedProfileOperational ? "destructive" : "outline"}
 onClick={() => {
 setIsAccountSettingsDialogOpen(false);
 setIsProfileLifecycleDialogOpen(true);
 }}
 disabled={!activeProfileId}
 data-testid="button-open-profile-lifecycle"
 >
 {isSelectedProfileOperational ? t("vendorDashboard.deactivateProfileButton") : t("vendorDashboard.reactivateProfileButton")}
 </Button>
 </div>
 </div>

 <div className="rounded-lg border border-destructive/35 bg-destructive/10 p-4">
 <div className="text-sm font-medium text-destructive">{t("vendorDashboard.deleteAccountFinal")}</div>
 <p className="mt-2 text-sm text-muted-foreground">
 {t("vendorDashboard.deleteAccountDesc")}
 </p>
 <div className="mt-4">
 <Button
 type="button"
 variant="destructive"
 onClick={() => {
 setIsAccountSettingsDialogOpen(false);
 setIsDeleteAccountDialogOpen(true);
 }}
 data-testid="button-open-delete-vendor-account"
 >
 {t("vendorDashboard.deleteAccount")}
 </Button>
 </div>
 </div>
 </div>

 <DialogFooter className="gap-2 sm:justify-end">
 <Button variant="outline" onClick={() => setIsAccountSettingsDialogOpen(false)}>
 {t("vendorDashboard.close")}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 <Dialog
 open={isProfileLifecycleDialogOpen}
 onOpenChange={(open) => {
 if (!profileLifecycleMutation.isPending) {
 setIsProfileLifecycleDialogOpen(open);
 }
 }}
 >
 <DialogContent className="sm:max-w-lg">
 <DialogHeader>
 <DialogTitle>
 {isSelectedProfileOperational ? t("vendorDashboard.deactivateDialogTitle") : t("vendorDashboard.reactivateDialogTitle")}
 </DialogTitle>
 <DialogDescription>
 {isSelectedProfileOperational
 ? t("vendorDashboard.deactivateDialogDesc")
 : t("vendorDashboard.reactivateDialogDesc")}
 </DialogDescription>
 </DialogHeader>

 <div className="rounded-md border border-destructive/35 bg-destructive/10 p-3 text-sm text-muted-foreground">
 <ul className="list-disc space-y-1 pl-5">
 {isSelectedProfileOperational ? (
 <>
 <li>{t("vendorDashboard.deactivateBullet1")}</li>
 <li>{t("vendorDashboard.deactivateBullet2")}</li>
 <li>{t("vendorDashboard.deactivateBullet3")}</li>
 </>
 ) : (
 <>
 <li>{t("vendorDashboard.reactivateBullet1")}</li>
 <li>{t("vendorDashboard.reactivateBullet2")}</li>
 <li>{t("vendorDashboard.reactivateBullet3")}</li>
 </>
 )}
 </ul>
 </div>

 <DialogFooter className="gap-2 sm:justify-end">
 <Button
 variant="outline"
 onClick={() => setIsProfileLifecycleDialogOpen(false)}
 disabled={profileLifecycleMutation.isPending}
 data-testid="button-cancel-profile-lifecycle"
 >
 {t("vendorDashboard.cancel")}
 </Button>
 <Button
 variant={isSelectedProfileOperational ? "destructive" : "default"}
 onClick={() => profileLifecycleMutation.mutate()}
 disabled={profileLifecycleMutation.isPending || !activeProfileId}
 data-testid="button-confirm-profile-lifecycle"
 >
 {profileLifecycleMutation.isPending
 ? isSelectedProfileOperational
 ? t("vendorDashboard.deactivating")
 : t("vendorDashboard.reactivating")
 : isSelectedProfileOperational
 ? t("vendorDashboard.deactivateProfileButton")
 : t("vendorDashboard.reactivateProfileButton")}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 <Dialog
 open={isDeleteAccountDialogOpen}
 onOpenChange={(open) => {
 if (!deleteVendorAccountMutation.isPending) {
 setIsDeleteAccountDialogOpen(open);
 }
 }}
 >
 <DialogContent className="sm:max-w-lg">
 <DialogHeader>
 <DialogTitle>{t("vendorDashboard.deleteAccountDialogTitle")}</DialogTitle>
 <DialogDescription>
 {t("vendorDashboard.deleteAccountDialogDesc")}
 </DialogDescription>
 </DialogHeader>

 <div className="rounded-md border border-destructive/35 bg-destructive/10 p-3 text-sm text-muted-foreground">
 <ul className="list-disc space-y-1 pl-5">
 <li>{t("vendorDashboard.deleteAccountBullet1")}</li>
 <li>{t("vendorDashboard.deleteAccountBullet2")}</li>
 <li>{t("vendorDashboard.deleteAccountBullet3")}</li>
 <li>{t("vendorDashboard.deleteAccountBullet4")}</li>
 </ul>
 </div>

 <DialogFooter className="gap-2 sm:justify-end">
 <Button
 variant="outline"
 onClick={() => setIsDeleteAccountDialogOpen(false)}
 disabled={deleteVendorAccountMutation.isPending}
 data-testid="button-cancel-delete-vendor-account"
 >
 {t("vendorDashboard.cancel")}
 </Button>
 <Button
 variant="destructive"
 onClick={() => deleteVendorAccountMutation.mutate()}
 disabled={deleteVendorAccountMutation.isPending}
 data-testid="button-confirm-delete-vendor-account"
 >
 {deleteVendorAccountMutation.isPending ? t("vendorDashboard.deleting") : t("vendorDashboard.deleteAccount")}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 <Dialog
 open={Boolean(pendingGoogleCalendarSelection)}
 onOpenChange={(open) => {
 if (!open && !isGoogleCalendarSelectionSubmitting) {
 setPendingGoogleCalendarSelection(null);
 }
 }}
 >
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle>
 {pendingGoogleCalendarSelection?.isSwitch
 ? t("vendorDashboard.calendarSwitchDialogTitle", { calendarName: pendingGoogleCalendarSelection.calendarSummary })
 : t("vendorDashboard.calendarUseDialogTitle", { calendarName: pendingGoogleCalendarSelection?.calendarSummary ?? t("vendorDashboard.keepCurrentCalendar") })}
 </DialogTitle>
 <DialogDescription>
 {t("vendorDashboard.calendarSyncDescription")}
 </DialogDescription>
 </DialogHeader>

 <DialogFooter className="gap-2 sm:justify-end">
 <Button
 variant="outline"
 onClick={() => setPendingGoogleCalendarSelection(null)}
 disabled={isGoogleCalendarSelectionSubmitting}
 >
 {t("vendorDashboard.cancel")}
 </Button>
 <Button
 onClick={() => void handleConfirmGoogleCalendarSelection(true)}
 disabled={isGoogleCalendarSelectionSubmitting}
 data-testid="button-google-calendar-sync"
 >
 {isGoogleCalendarSelectionSubmitting
 ? t("vendorDashboard.switching")
 : pendingGoogleCalendarSelection?.isSwitch
 ? t("vendorDashboard.yesSwitchCalendar")
 : t("vendorDashboard.yesUseCalendar")}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 </VendorShell>
 );

}
