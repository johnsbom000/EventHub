import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { useLocation } from "wouter";
import VendorShell from "@/components/VendorShell";


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


import { Calendar, DollarSign, Users, TrendingUp, Loader2 } from "lucide-react";

type VendorMe = {
  id?: string | null;
  businessName?: string | null;
  accountBusinessName?: string | null;
  email?: string | null;
  stripeOnboardingComplete?: boolean | null;
  googleConnectionStatus?: string | null;
  googleCalendarId?: string | null;
  hasVendorAccount?: boolean | null;
  hasAnyVendorProfiles?: boolean | null;
  hasActiveVendorProfile?: boolean | null;
  needsNewVendorProfileOnboarding?: boolean | null;
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
    .replace(/[^a-zA-Z0-9\s']/g, " ")
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
  const { isAuthenticated, isLoading: isAuthLoading, getAccessTokenSilently, logout } = useAuth0();
  const [location, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

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
    enabled: isAuthenticated,
  });
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
  const {
    data: vendorListings = [],
    isLoading: isVendorListingsLoading,
    error: vendorListingsError,
  } = useQuery<VendorListingSummary[]>({
    queryKey: ["/api/vendor/listings", "dashboard-google-event-mapping"],
    enabled: isAuthenticated && isGoogleConnected && hasSelectedGoogleCalendar,
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

  const createGoogleCalendarMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/google/calendars/create", {});
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
      setPendingGoogleCalendarSelection({
        calendarId: calendar.id,
        calendarSummary: calendar.summary,
        alreadySelected: true,
        isSwitch: Boolean(vendorAccount?.googleCalendarId && vendorAccount.googleCalendarId !== calendar.id),
      });
    },
    onError: (error: any) => {
      toast({
        title: "Unable to create Google calendar",
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

      const response = await fetch("/api/google/oauth/start", {
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
    createGoogleCalendarMutation.isPending ||
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
          We could not verify your vendor session right now. Refresh and try again.
        </div>
      </VendorShell>
    );
  }

  if (vendorDetection.status === "non_vendor") {
    return (
      <VendorShell onOpenAccountSettings={() => setIsAccountSettingsDialogOpen(true)}>
        <div className="mx-auto max-w-2xl rounded-lg border p-5 text-sm text-muted-foreground">
          This account does not have a vendor account yet. Complete vendor onboarding to continue.
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
            Dashboard
          </h1>
        </div>

        {showNoActiveProfilePrompt ? (
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">
              Your vendor account is active, but no vendor profile is currently selected.
              {vendorDetection.hasAnyVendorProfiles
                ? " Select a profile below or create a new one."
                : " Create your first vendor profile to continue setup."}
            </p>
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/vendor/onboarding?createProfile=1")}
                data-testid="button-dashboard-no-active-profile-create"
              >
                Create profile
              </Button>
            </div>
          </div>
        ) : null}

        <div className="space-y-0">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-0">
            <div className="px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-heading text-[20px] leading-none tracking-tight">Total Bookings</h2>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold" data-testid="stat-bookings">
                {stats?.totalBookings ?? 0}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />+{stats?.bookingsThisMonth ?? 0} this month
              </p>
            </div>

            <div className="hidden px-2 md:flex md:items-center md:justify-center">
              <div className={cn("h-14 w-px", dashboardDividerBgClass)} />
            </div>

            <div className="px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-heading text-[20px] leading-none tracking-tight">Revenue</h2>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold" data-testid="stat-revenue">
                {formatMoneyFromCents(Number(stats?.revenue ?? 0))}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {Number(stats?.revenueGrowth ?? 0) >= 0 ? "+" : ""}
                {stats?.revenueGrowth ?? 0}% from last month
              </p>
            </div>

            <div className="hidden px-2 md:flex md:items-center md:justify-center">
              <div className={cn("h-14 w-px", dashboardDividerBgClass)} />
            </div>

            <div className="px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-heading text-[20px] leading-none tracking-tight">Profile Views</h2>
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold" data-testid="stat-views">
                {(stats?.profileViews ?? 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {Number(stats?.profileViewsGrowth ?? 0) >= 0 ? "+" : ""}
                {stats?.profileViewsGrowth ?? 0}% this week
              </p>
            </div>
          </div>

          <div className="space-y-8">
            {showStripeSetupCard ? (
              <div className="rounded-xl border border-[hsl(var(--secondary-accent)/0.45)] bg-[hsl(var(--secondary-accent)/0.12)] p-6">
                <h2 className="font-heading text-[20px] leading-none tracking-tight">Complete Your Setup</h2>
                <p className="mt-4 text-sm text-muted-foreground">
                  Connect your Stripe account to start accepting payments from customers.
                </p>
                <div className="mt-6">
                  <Button
                    onClick={handleCompletePaymentSetup}
                    disabled={isStripeSetupLoading}
                    data-testid="button-complete-setup"
                  >
                    {isStripeSetupLoading ? "Opening Stripe..." : "Complete Payment Setup"}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-[hsl(var(--secondary-accent)/0.45)] bg-[hsl(var(--secondary-accent)/0.12)] p-6">
              <h2 className="font-heading text-[20px] leading-none tracking-tight">Connect Google Calendar</h2>
              <p className="mt-4 text-sm text-muted-foreground">
                {isGoogleConnected
                  ? "Google Calendar is connected. Choose which calendar EventHub should use."
                  : "Connect your Google Calendar to prepare for availability syncing."}
              </p>
              <div className="mt-4 text-sm">
                <span className="font-medium text-foreground">Status: </span>
                <span className={isGoogleConnected ? "text-foreground" : "text-muted-foreground"}>
                  {isGoogleConnected ? "Connected" : "Not connected"}
                </span>
              </div>
              {vendorAccount?.googleCalendarId ? (
                <div className="mt-2 text-sm text-muted-foreground">
                  Current calendar: {selectedGoogleCalendar?.summary || vendorAccount.googleCalendarId}
                </div>
              ) : null}

              {!isGoogleConnected ? (
                <div className="mt-6">
                  <Button
                    onClick={handleConnectGoogleCalendar}
                    disabled={isGoogleCalendarConnectLoading}
                    data-testid="button-connect-google-calendar"
                  >
                    {isGoogleCalendarConnectLoading ? "Opening Google..." : "Connect Google Calendar"}
                  </Button>
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                    <div className="space-y-2">
                      <Label htmlFor="google-calendar-select">Selected calendar</Label>
                      <Select value={selectedGoogleCalendarId || undefined} onValueChange={setSelectedGoogleCalendarId}>
                        <SelectTrigger id="google-calendar-select" data-testid="select-google-calendar">
                          <SelectValue placeholder="Choose a Google calendar" />
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
                      {selectGoogleCalendarMutation.isPending ? "Saving..." : "Save Calendar"}
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      onClick={() => createGoogleCalendarMutation.mutate()}
                      disabled={createGoogleCalendarMutation.isPending}
                      data-testid="button-create-google-calendar"
                    >
                      {createGoogleCalendarMutation.isPending
                        ? "Creating..."
                        : "Create EventHub Bookings Calendar"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleConnectGoogleCalendar}
                      disabled={isGoogleCalendarConnectLoading}
                      data-testid="button-reconnect-google-calendar"
                    >
                      {isGoogleCalendarConnectLoading ? "Opening Google..." : "Reconnect Google"}
                    </Button>
                  </div>

                  {isGoogleCalendarsLoading || isGoogleCalendarsFetching ? (
                    <div className="text-sm text-muted-foreground">Loading available calendars...</div>
                  ) : null}
                  {!isGoogleCalendarsLoading && googleCalendars.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No Google calendars were found. You can create an EventHub Bookings calendar above.
                    </div>
                  ) : null}
                  {googleCalendarErrorMessage ? (
                    <div className="text-sm text-destructive">{googleCalendarErrorMessage}</div>
                  ) : null}

                  {hasSelectedGoogleCalendar ? (
                    <div className={cn("border-t pt-6", dashboardDividerBorderClass)}>
                      <h3 className="font-heading text-[18px] leading-none tracking-tight">
                        Unmatched Google Events
                      </h3>
                      <p className="mt-3 text-sm text-muted-foreground">
                        Review calendar events EventHub could not confidently match and link them to a listing.
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
                        <div className="mt-4 text-sm text-muted-foreground">Loading unmatched Google events...</div>
                      ) : null}

                      {!isVendorListingsLoading &&
                      !isUnmatchedGoogleEventsLoading &&
                      !isUnmatchedGoogleEventsFetching &&
                      !vendorListingsErrorMessage &&
                      !unmatchedGoogleEventsErrorMessage ? (
                        vendorListingOptions.length === 0 ? (
                          <div className="mt-4 rounded-lg border border-[rgba(74,106,125,0.22)] p-4 text-sm text-muted-foreground">
                            Add at least one listing before mapping unmatched Google events.
                          </div>
                        ) : unmatchedGoogleEvents.length === 0 ? (
                          <div className="mt-4 rounded-lg border border-[rgba(74,106,125,0.22)] p-4 text-sm text-muted-foreground">
                            No unmatched Google events
                          </div>
                        ) : (
                          <div className="mt-4 space-y-3">
                            {unmatchedGoogleEvents.map((event) => {
                              const selectedListingId = selectedListingIdByGoogleEventId[event.id] || "";
                              const isSavingThisEvent =
                                mapGoogleEventMutation.isPending &&
                                mapGoogleEventMutation.variables?.googleEventId === event.id;

                              return (
                                <div
                                  key={event.id}
                                  className="rounded-lg border border-[rgba(74,106,125,0.22)] p-4"
                                >
                                  <div className="space-y-2">
                                    <div className="font-medium text-foreground">
                                      {event.summary || "Untitled Google event"}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      Start: {formatGoogleEventBoundary(event.start)}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      End: {formatGoogleEventBoundary(event.end, { isEnd: true })}
                                    </div>
                                    {event.status ? (
                                      <div className="text-sm text-muted-foreground">
                                        Status: {event.status}
                                      </div>
                                    ) : null}
                                  </div>

                                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                                    <div className="space-y-2">
                                      <Label htmlFor={`google-event-listing-${event.id}`}>Map to listing</Label>
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
                                          <SelectValue placeholder="Choose a listing" />
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
                                      disabled={!selectedListingId || isSavingThisEvent}
                                      data-testid={`button-map-google-event-${event.id}`}
                                    >
                                      {isSavingThisEvent ? "Saving..." : "Save Mapping"}
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
                        Google Booking Sync Issues
                      </h3>
                      <p className="mt-3 text-sm text-muted-foreground">
                        Repair bookings whose Google sync metadata is missing, stale, or tied to the wrong calendar.
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
                          Loading Google booking sync issues...
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
                                      Booking window: {formatDateTimeValue(issue.bookingStartAt)} to{" "}
                                      {formatDateTimeValue(issue.bookingEndAt)}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {issue.issueCodes.map((issueCode) => (
                                        <span
                                          key={`${bookingId}-${issueCode}`}
                                          className="rounded-full border border-[rgba(74,106,125,0.22)] px-2 py-1 text-xs text-muted-foreground"
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
                                    <div className="text-xs text-muted-foreground">
                                      Booking ID: {bookingId || "Unknown"}
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
                                      {isRepairingThisBooking ? "Repairing..." : "Repair Sync"}
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="mt-4 rounded-lg border border-[rgba(74,106,125,0.22)] p-4 text-sm text-muted-foreground">
                            No Google sync issues
                          </div>
                        )
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <section className="px-5 py-4">
            <h2 className="font-heading text-[20px] leading-none tracking-tight">Recent Activity</h2>
            <p className="mt-3 text-sm text-muted-foreground">Your latest bookings and inquiries</p>
            <div className="mt-5">
              {!stats?.recentBookings || stats.recentBookings.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  No recent bookings yet. Your upcoming bookings will appear here.
                </div>
              ) : (
                <div className="space-y-3">
                  {stats.recentBookings.slice(0, 5).map((booking) => (
                    <div
                      key={booking.id}
                      className="rounded-lg border border-[rgba(74,106,125,0.22)] p-3 flex items-center justify-between gap-3"
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
            </div>
          </section>

          <div className={cn("my-4 border-t", dashboardDividerBorderClass)} />

          <section className="px-5 py-4">
            <h2 className="font-heading text-[20px] leading-none tracking-tight">Quick Actions</h2>
            <p className="mt-3 text-sm text-muted-foreground">Common tasks and shortcuts</p>
            <div className="mt-5 flex flex-wrap gap-2">
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
            </div>
          </section>

          <div className={cn("my-4 border-t", dashboardDividerBorderClass)} />
        </div>

        <section className="px-5 py-4">
          <h2 className="font-heading text-[20px] leading-none tracking-tight">Profile Details</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Edit the same details collected during vendor onboarding.
          </p>

          <div className="mt-5 space-y-6">
            {isProfileError ? (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                No vendor profile found yet. Complete onboarding first, then you can edit your
                profile here.
              </div>
            ) : null}

            <div className="space-y-3">
              <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Account Info</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Account Name</Label>
                  <Input value={vendorAccount?.accountBusinessName || vendorAccount?.businessName || ""} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Account Email</Label>
                  <Input value={vendorAccount?.email || ""} readOnly />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Profile Info</h3>
            </div>

            <div className="space-y-2">
              <Label>Public Business Name</Label>
              <Input
                value={businessNameDraft}
                onChange={(e) => setBusinessNameDraft(e.target.value)}
                onBlur={(e) => setBusinessNameDraft(normalizeProfileNameInput(e.target.value))}
                placeholder="Public business name"
                maxLength={120}
              />
            </div>

            {vendorProfiles.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <div className="space-y-2">
                  <Label>Selected Profile</Label>
                  <Select
                    value={activeProfileId || undefined}
                    onValueChange={(nextProfileId) => {
                      if (!nextProfileId || nextProfileId === activeProfileId || switchProfile.isPending) return;
                      switchProfile.mutate(nextProfileId);
                    }}
                    disabled={switchProfile.isPending}
                  >
                    <SelectTrigger data-testid="select-dashboard-active-profile">
                      <SelectValue placeholder="Select profile" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendorProfiles.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.profileName}
                          {profile.isOperational === false ? " (Inactive)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/vendor/onboarding?createProfile=1")}
                  className="md:self-end"
                  data-testid="button-dashboard-create-profile"
                >
                  Create another profile
                </Button>
              </div>
            ) : null}

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

            <div className="flex items-center justify-end gap-2">
              <Button
                onClick={() => saveProfile.mutate()}
                disabled={saveProfile.isPending || isProfileError}
                data-testid="button-save-profile-details"
              >
                {saveProfile.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>

          </div>
        </section>

        <Dialog
          open={isAccountSettingsDialogOpen}
          onOpenChange={(open) => setIsAccountSettingsDialogOpen(open)}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Account Settings</DialogTitle>
              <DialogDescription>
                Manage profile lifecycle and final account deletion.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Danger Zone</h3>

              <div className="rounded-lg border border-destructive/35 bg-destructive/10 p-4">
                <div className="text-sm font-medium text-destructive">
                  {isSelectedProfileOperational ? "Deactivate profile" : "Reactivate profile"}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {isSelectedProfileOperational
                    ? `${activeProfileLabel} will be hidden from public view and its active/draft listings will move to inactive. Your profile data and history are preserved and can be reactivated later.`
                    : `${activeProfileLabel} will be restored as an active profile. Existing listings remain inactive until you manually republish them.`}
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
                    {isSelectedProfileOperational ? "Deactivate Profile" : "Reactivate Profile"}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-destructive/35 bg-destructive/10 p-4">
                <div className="text-sm font-medium text-destructive">Delete account (final)</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  This permanently removes future vendor access for this account. Historical booking/payment data is
                  preserved for integrity, but account auth/integration linkage is cleared.
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
                    Delete Account
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-end">
              <Button variant="outline" onClick={() => setIsAccountSettingsDialogOpen(false)}>
                Close
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
                {isSelectedProfileOperational ? "Deactivate selected profile?" : "Reactivate selected profile?"}
              </DialogTitle>
              <DialogDescription>
                {isSelectedProfileOperational
                  ? "This is reversible. You can reactivate the profile later."
                  : "This restores profile operation. Listings stay inactive until manually republished."}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border border-destructive/35 bg-destructive/10 p-3 text-sm text-muted-foreground">
              <ul className="list-disc space-y-1 pl-5">
                {isSelectedProfileOperational ? (
                  <>
                    <li>Only this profile is deactivated. Your account stays accessible.</li>
                    <li>Active and draft listings on this profile move to inactive.</li>
                    <li>Historical bookings, payouts, reviews, and profile settings are preserved.</li>
                  </>
                ) : (
                  <>
                    <li>This profile will become active again.</li>
                    <li>Saved profile/listing configuration remains intact.</li>
                    <li>Listings remain inactive until you manually republish.</li>
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
                Cancel
              </Button>
              <Button
                variant={isSelectedProfileOperational ? "destructive" : "default"}
                onClick={() => profileLifecycleMutation.mutate()}
                disabled={profileLifecycleMutation.isPending || !activeProfileId}
                data-testid="button-confirm-profile-lifecycle"
              >
                {profileLifecycleMutation.isPending
                  ? isSelectedProfileOperational
                    ? "Deactivating..."
                    : "Reactivating..."
                  : isSelectedProfileOperational
                    ? "Deactivate Profile"
                    : "Reactivate Profile"}
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
              <DialogTitle>Delete vendor account permanently?</DialogTitle>
              <DialogDescription>
                This action is final and cannot be self-reversed in the product.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border border-destructive/35 bg-destructive/10 p-3 text-sm text-muted-foreground">
              <ul className="list-disc space-y-1 pl-5">
                <li>Future vendor access for this account is removed.</li>
                <li>All profiles/listings under this account are set inactive.</li>
                <li>Auth linkage and integration/session tokens are cleared.</li>
                <li>Historical booking/payment/audit records remain preserved for integrity.</li>
              </ul>
            </div>

            <DialogFooter className="gap-2 sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setIsDeleteAccountDialogOpen(false)}
                disabled={deleteVendorAccountMutation.isPending}
                data-testid="button-cancel-delete-vendor-account"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteVendorAccountMutation.mutate()}
                disabled={deleteVendorAccountMutation.isPending}
                data-testid="button-confirm-delete-vendor-account"
              >
                {deleteVendorAccountMutation.isPending ? "Deleting..." : "Delete Account"}
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
              <DialogTitle>Sync existing EventHub bookings?</DialogTitle>
              <DialogDescription>
                {pendingGoogleCalendarSelection
                  ? pendingGoogleCalendarSelection.isSwitch
                    ? `Do you want to sync EventHub to your ${pendingGoogleCalendarSelection.calendarSummary} calendar?`
                    : `Do you want to sync EventHub to ${pendingGoogleCalendarSelection.calendarSummary} calendar?`
                  : ""}
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="gap-2 sm:justify-end">
              <Button
                variant="outline"
                onClick={() => void handleConfirmGoogleCalendarSelection(false)}
                disabled={isGoogleCalendarSelectionSubmitting}
                data-testid="button-google-calendar-dont-sync"
              >
                {selectGoogleCalendarMutation.isPending ? "Saving..." : "Don't Sync"}
              </Button>
              <Button
                onClick={() => void handleConfirmGoogleCalendarSelection(true)}
                disabled={isGoogleCalendarSelectionSubmitting}
                data-testid="button-google-calendar-sync"
              >
                {isGoogleCalendarSelectionSubmitting ? "Syncing..." : "Sync"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </VendorShell>
  );

}
