import { getApiErrorStatus } from "@/lib/queryClient";

export type VendorMeState = {
  id?: string | null;
  email?: string | null;
  businessName?: string | null;
  accountBusinessName?: string | null;
  profileId?: string | null;
  activeProfileId?: string | null;
  profileComplete?: boolean | null;
  hasVendorAccount?: boolean | null;
  hasAnyVendorProfiles?: boolean | null;
  hasActiveVendorProfile?: boolean | null;
  needsNewVendorProfileOnboarding?: boolean | null;
  onboardingCompleted?: boolean | null;
  vendorOnlySignup?: boolean | null;
  dashboardTourCompletedAt?: string | null;
  // Vendor Pro subscription entitlements (from /api/vendor/me).
  isPro?: boolean | null;
  subscriptionPlan?: "free" | "pro" | null;
  subscriptionStatus?: string | null;
  subscriptionReason?: string | null;
  maxActiveListings?: number | null; // null = unlimited (Pro)
  canUseAnalytics?: boolean | null;
  canUseGoogleSync?: boolean | null;
  subscriptionCurrentPeriodEnd?: string | null;
  subscriptionCancelAtPeriodEnd?: boolean | null;
  compEndsAt?: string | null;
  // Reverse-trial state (from /api/vendor/me). Non-null once auto-enrolled at
  // signup. `active` = still on the free trial with no card, so the dashboard
  // "add a card to keep Pro" prompt should show.
  reverseTrial?: {
    daysLeft?: number | null;
    trialEndsAt?: string | null;
    cardCaptured?: boolean | null;
    active?: boolean | null;
  } | null;
};

export type VendorDetectionStatus =
  | "loading"
  | "vendor"
  | "non_vendor"
  | "auth_error"
  | "transient_error"
  | "unknown";

export type VendorDetection = {
  status: VendorDetectionStatus;
  errorStatus: number | null;
  hasVendorAccount: boolean;
  hasAnyVendorProfiles: boolean;
  hasActiveVendorProfile: boolean;
  needsNewVendorProfileOnboarding: boolean;
};

function deriveFlags(data: VendorMeState | null | undefined) {
  const hasVendorAccount = Boolean(data?.hasVendorAccount ?? data?.id);
  const hasAnyVendorProfiles = Boolean(data?.hasAnyVendorProfiles ?? data?.profileComplete);
  const hasActiveVendorProfile = Boolean(
    data?.hasActiveVendorProfile ?? data?.activeProfileId ?? data?.profileId
  );
  const needsNewVendorProfileOnboarding = Boolean(
    data?.needsNewVendorProfileOnboarding ?? (hasVendorAccount && !hasAnyVendorProfiles)
  );

  return {
    hasVendorAccount,
    hasAnyVendorProfiles,
    hasActiveVendorProfile,
    needsNewVendorProfileOnboarding,
  };
}

export function deriveVendorDetection(params: {
  data?: VendorMeState | null;
  isLoading?: boolean;
  isFetching?: boolean;
  error?: unknown;
}): VendorDetection {
  const flags = deriveFlags(params.data);
  const errorStatus = getApiErrorStatus(params.error);

  if (params.isLoading || params.isFetching) {
    return {
      status: "loading",
      errorStatus,
      ...flags,
    };
  }

  if (flags.hasVendorAccount) {
    return {
      status: "vendor",
      errorStatus,
      ...flags,
    };
  }

  if (errorStatus === 404) {
    return {
      status: "non_vendor",
      errorStatus,
      ...flags,
    };
  }

  if (errorStatus === 401) {
    return {
      status: "auth_error",
      errorStatus,
      ...flags,
    };
  }

  if (errorStatus !== null || params.error) {
    return {
      status: "transient_error",
      errorStatus,
      ...flags,
    };
  }

  return {
    status: "unknown",
    errorStatus,
    ...flags,
  };
}
