// client/src/features/vendor/onboarding/onboardingDraft.ts
//
// Best-effort localStorage persistence for the vendor onboarding wizard so a
// refresh, closed tab, or the Auth0 login redirect doesn't lose progress.
// Photos are intentionally excluded: they are large data-URLs and optional.

import type { VendorOnboardingData } from "@/pages/VendorOnboarding";

const STORAGE_KEY = "vendorOnboardingDraft:v1";
const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type PersistedOnboardingFormData = Omit<
  VendorOnboardingData,
  "shopProfilePhotoDataUrl" | "shopCoverPhotoDataUrl"
>;

export type OnboardingDraft = {
  formData: PersistedOnboardingFormData;
  currentStep: number;
  completedStepIds: number[];
  savedAt: number;
};

export function saveOnboardingDraft(input: {
  formData: VendorOnboardingData;
  currentStep: number;
  completedStepIds: number[];
}): void {
  if (typeof window === "undefined") return;
  const {
    shopProfilePhotoDataUrl: _profilePhoto,
    shopCoverPhotoDataUrl: _coverPhoto,
    ...persistedFormData
  } = input.formData;
  const draft: OnboardingDraft = {
    formData: persistedFormData,
    currentStep: input.currentStep,
    completedStepIds: input.completedStepIds,
    savedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage unavailable (private browsing, quota). Onboarding still works
    // without drafts; behavior degrades to no persistence.
  }
}

export function loadOnboardingDraft(): OnboardingDraft | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft> | null;
    const isShapeValid =
      !!parsed &&
      typeof parsed === "object" &&
      typeof parsed.savedAt === "number" &&
      typeof parsed.currentStep === "number" &&
      !!parsed.formData &&
      typeof parsed.formData === "object" &&
      !Array.isArray(parsed.formData) &&
      Array.isArray(parsed.completedStepIds) &&
      parsed.completedStepIds.every((id) => typeof id === "number");

    if (!isShapeValid) {
      clearOnboardingDraft();
      return null;
    }
    if (Date.now() - (parsed as OnboardingDraft).savedAt > DRAFT_TTL_MS) {
      clearOnboardingDraft();
      return null;
    }
    return parsed as OnboardingDraft;
  } catch {
    clearOnboardingDraft();
    return null;
  }
}

export function clearOnboardingDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — storage is unavailable, so there is no draft to clear.
  }
}
