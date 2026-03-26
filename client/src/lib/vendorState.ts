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
