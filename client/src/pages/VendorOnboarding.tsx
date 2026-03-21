// client/src/pages/VendorOnboarding.tsx

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { BadgeCheck, Building2, Check, ClipboardList, Sparkles } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import { useAuth0 } from "@auth0/auth0-react";
import { cn } from "@/lib/utils";

// Step components (Prop/Decor-only flow)
import Step2_BusinessDetails from "@/features/vendor/onboarding/Step2_BusinessDetails";
import Step3_AboutOwner from "@/features/vendor/onboarding/Step3_AboutOwner";
import Step4_Confirm from "@/features/vendor/onboarding/Step4_Confirm";

// Temporary: hide vendor type selection while we are Prop/Decor-only.
// Flip to false when we re-enable multi-vendor onboarding.
const SINGLE_VENDOR_MODE = true;

// Canonical vendorType value for Decor Rental in your current onboarding options
const SINGLE_VENDOR_TYPE = "prop-decor";

/* -----------------------------
   Types
------------------------------ */

export interface VendorOnboardingData {
  // Step 1 (hidden in single-vendor mode)
  vendorType: string;

  // Business Details (current flow)
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
  hobbies: string;
  homeState: string;
  funFacts: string;
  shopProfilePhotoDataUrl: string;
  shopCoverPhotoDataUrl: string;


  // Derived
  homeBaseLocation?: {
    lat: number;
    lng: number;
  };

  marketLocation?: {
    id: string;
    label: string;
    lat: number;
    lng: number;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  } | null;
}

const STEPS = SINGLE_VENDOR_MODE
  ? [
      { id: 1, label: "Business Details" },
      { id: 2, label: "About the Owner" },
      { id: 3, label: "Confirm" },
    ]
  : [
      { id: 1, label: "Vendor Type" },
      { id: 2, label: "Business Details" },
      { id: 3, label: "About the Owner" },
      { id: 4, label: "Confirm" },
    ];

function getStepMeta(stepLabel: string): {
  icon: typeof Building2;
  description: string;
} {
  const normalized = stepLabel.trim().toLowerCase();

  if (normalized === "business details") {
    return {
      icon: Building2,
      description: "",
    };
  }

  if (normalized === "confirm") {
    return {
      icon: BadgeCheck,
      description: "",
    };
  }

  if (normalized === "about the owner") {
    return {
      icon: Sparkles,
      description: "",
    };
  }

  return {
    icon: ClipboardList,
    description: "Complete this onboarding section.",
  };
}

const STORAGE_KEY = "vendorOnboarding:v1";

const DEFAULT_ONBOARDING_DATA: VendorOnboardingData = {
  vendorType: SINGLE_VENDOR_MODE ? SINGLE_VENDOR_TYPE : "",

  // current flow
  businessName: "",
  streetAddress: "",
  city: "",
  state: "",
  zipCode: "",
  businessPhone: "",
  businessEmail: "",
  showBusinessPhoneToCustomers: false,
  showBusinessEmailToCustomers: false,
  showBusinessAddressToCustomers: false,
  aboutVendor: "",
  aboutBusiness: "",
  shopTagline: "",
  inBusinessSinceYear: "",
  specialties: "",
  eventsServedBaseline: "",
  hobbies: "",
  homeState: "",
  funFacts: "",
  shopProfilePhotoDataUrl: "",
  shopCoverPhotoDataUrl: "",
  marketLocation: null,
};

export default function VendorOnboarding() {

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { getAccessTokenSilently } = useAuth0();
  const isCreatingAdditionalProfile =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("createProfile") === "1";

  // If the user leaves the onboarding page entirely, start fresh next time.
  useEffect(() => {
    return () => {
      localStorage.removeItem(STORAGE_KEY);
    };
  }, []);

  const [currentStep, setCurrentStep] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return 1;
      const parsed = JSON.parse(raw);
      const step = Number(parsed?.currentStep);
      return step >= 1 && step <= STEPS.length ? step : 1;
    } catch {
      return 1;
    }
  });

  const [formData, setFormData] = useState<VendorOnboardingData>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_ONBOARDING_DATA;
      const parsed = JSON.parse(raw);

      const merged: VendorOnboardingData = {
        ...DEFAULT_ONBOARDING_DATA,
        ...(parsed?.formData || {}),
      };

      // Enforce vendorType in single vendor mode (even if older localStorage had something else)
      if (SINGLE_VENDOR_MODE) merged.vendorType = SINGLE_VENDOR_TYPE;

      return merged;
    } catch {
      return DEFAULT_ONBOARDING_DATA;
    }
  });

  const [completedStepIds, setCompletedStepIds] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const explicit: number[] = Array.isArray(parsed?.completedStepIds)
        ? (parsed.completedStepIds as unknown[])
            .map((value: unknown) => Number(value))
            .filter((value: number) => Number.isInteger(value) && value >= 1 && value <= STEPS.length)
        : [];
      if (explicit.length > 0) {
        return Array.from(new Set<number>(explicit)).sort((a: number, b: number) => a - b);
      }

      // Backward compatibility for localStorage created before completion-tracking existed.
      const inferredCurrentStep = Number(parsed?.currentStep);
      const inferred: number[] = [];
      if (inferredCurrentStep >= 2) inferred.push(1);
      if (inferredCurrentStep >= 3) inferred.push(2);
      if (inferredCurrentStep >= 4) inferred.push(3);
      return inferred;
    } catch {
      return [];
    }
  });

  const updateFormData = (updates: Partial<VendorOnboardingData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  // Enforce vendorType at runtime as well (handles hot reload / toggles)
  useEffect(() => {
    if (SINGLE_VENDOR_MODE && formData.vendorType !== SINGLE_VENDOR_TYPE) {
      setFormData((prev) => ({ ...prev, vendorType: SINGLE_VENDOR_TYPE }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ currentStep, formData, completedStepIds }));
    }, 250);

    return () => clearTimeout(t);
  }, [currentStep, formData, completedStepIds]);

  const isAddressVerified =
    !!formData.homeBaseLocation &&
    Number.isFinite(formData.homeBaseLocation.lat) &&
    Number.isFinite(formData.homeBaseLocation.lng);

  const isBusinessDetailsComplete =
    formData.businessName.trim() !== "" &&
    formData.businessPhone.trim() !== "" &&
    formData.businessEmail.trim() !== "" &&
    formData.streetAddress.trim() !== "" &&
    formData.city.trim() !== "" &&
    formData.state.trim() !== "" &&
    formData.zipCode.trim() !== "" &&
    isAddressVerified;

  const isAboutOwnerComplete =
    completedStepIds.includes(2) || currentStep > 2;

  const isStepComplete = (stepId: number) => {
    if (!SINGLE_VENDOR_MODE) return stepId < currentStep;
    if (stepId === 1) return isBusinessDetailsComplete;
    if (stepId === 2) return isAboutOwnerComplete;
    return false;
  };

  const isStepReachable = (stepId: number) => {
    if (!SINGLE_VENDOR_MODE) return stepId <= currentStep;
    if (stepId === 1) return true;
    if (stepId === 2) {
      return isBusinessDetailsComplete || currentStep >= 2;
    }
    if (stepId === 3) {
      return (isBusinessDetailsComplete && isAboutOwnerComplete) || currentStep >= 3;
    }
    return false;
  };

  const markStepComplete = (stepId: number) => {
    if (stepId < 1 || stepId >= STEPS.length) return;
    setCompletedStepIds((prev) => (prev.includes(stepId) ? prev : [...prev, stepId].sort((a, b) => a - b)));
  };

  const handleNext = () => {
    if (currentStep >= STEPS.length) return;
    markStepComplete(currentStep);
    setCurrentStep((s) => s + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep((s) => s - 1);
  };

  /* -----------------------------
     Submit
  ------------------------------ */

  const completeOnboardingMutation = useMutation({
    mutationFn: async (data: VendorOnboardingData) => {
      const token = await getAccessTokenSilently();
      const browserTimeZone =
        typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || undefined : undefined;

      const res = await fetch("/api/vendor/onboarding/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...data,
          operatingTimezone: browserTimeZone,
          createNewProfile: isCreatingAdditionalProfile,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        throw new Error(err?.error || err?.message || "Failed to complete onboarding");
      }

      return res.json();
    },

    onSuccess: (data: any) => {
      if (data?.vendorAccountId) localStorage.setItem("vendorAccountId", data.vendorAccountId);
      if (data?.profileId) localStorage.setItem("vendorProfileId", data.profileId);

      queryClient.invalidateQueries({ queryKey: ["/api/vendor/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer/me"] });

      toast({
        title: isCreatingAdditionalProfile ? "Vendor profile added" : "Vendor profile created",
        className: "bg-[#ffffff] text-[#16222D] border-0 outline-none ring-0 shadow-none",
      });
    },
  });

  const handleComplete = async (
    createListing: boolean,
    destination: "dashboard" | "myHub" = "dashboard",
  ) => {
    try {
      await completeOnboardingMutation.mutateAsync(formData);
      localStorage.removeItem(STORAGE_KEY);
      if (createListing) {
        setLocation("/vendor/listings/new");
      } else {
        setLocation(destination === "myHub" ? "/vendor/shop" : "/vendor/dashboard");
      }
    } catch (e: any) {
      toast({
        title: "Onboarding failed",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  /* -----------------------------
     Render step
  ------------------------------ */

  const renderStep = () => {
    // In single-vendor mode:
    // 1 = Business Details, 2 = About the Owner, 3 = Confirm
    if (SINGLE_VENDOR_MODE) {
      switch (currentStep) {
        case 1:
          return (
            <Step2_BusinessDetails
              formData={formData}
              updateFormData={updateFormData}
              onNext={handleNext}
              onBack={handleBack}
            />
          );
        case 2:
          return (
            <Step3_AboutOwner
              formData={formData}
              updateFormData={updateFormData}
              onNext={handleNext}
              onBack={handleBack}
            />
          );
        case 3:
          return (
            <Step4_Confirm
              formData={formData}
              onBack={handleBack}
              onComplete={handleComplete}
            />
          );
        default:
          return null;
      }
    }

    // Multi-vendor mode (kept for later)
    switch (currentStep) {
      case 1:
        // vendor type step is intentionally disabled right now in this file
        // (when you re-enable it, re-add Step1_VendorType import + component here)
        return null;
      case 2:
        return (
          <Step2_BusinessDetails
            formData={formData}
            updateFormData={updateFormData}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 3:
        return (
          <Step3_AboutOwner
            formData={formData}
            updateFormData={updateFormData}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 4:
        return (
          <Step4_Confirm
            formData={formData}
            onBack={handleBack}
            onComplete={handleComplete}
          />
        );
      default:
        return null;
    }
  };

  /* -----------------------------
     Layout
  ------------------------------ */

  return (
    <div className="swap-dashboard-whites min-h-screen bg-[#ffffff] flex flex-col">
      <Navigation />

      <div className="flex flex-1">
        {/* Sidebar */}
        <div className="w-24 shrink-0 border-r border-[rgba(74,106,125,0.22)] bg-[#ffffff] dark:bg-[#ffffff]">
          <div className="flex h-full flex-col items-center pt-6">
            <div className="flex flex-col items-center gap-3">
            {STEPS.map((step) => (
              (() => {
                const isActive = step.id === currentStep;
                const isCompleted = isStepComplete(step.id);
                const isReachable = isStepReachable(step.id);
                const meta = getStepMeta(step.label);
                const Icon = meta.icon;

                return (
                  <button
                    key={step.id}
                    type="button"
                    aria-label={step.label}
                    aria-current={isActive ? "step" : undefined}
                    aria-disabled={!isReachable}
                    onClick={() => {
                      if (isReachable) setCurrentStep(step.id);
                    }}
                    className={cn(
                      "group/step relative flex h-14 w-14 items-center justify-center rounded-2xl border border-transparent transition-colors",
                      isActive
                        ? "bg-[#4a6a7d] text-[#f5f0e8] hover:bg-[#4a6a7d]"
                        : isReachable
                        ? "text-[#2a3a42] hover:bg-[#e6e1d6] hover:text-[#2a3a42]"
                        : "cursor-not-allowed text-[#9aacb4]"
                    )}
                    data-testid={`onboarding-step-${step.id}`}
                  >
                    {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}

                    <span className="sr-only">{step.label}</span>

                    <span
                      className={cn(
                        "pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 min-w-[210px] -translate-y-1/2 rounded-md border border-[rgba(74,106,125,0.22)] bg-[#ffffff] px-2.5 py-2 text-left text-[#2a3a42] opacity-0 shadow-sm transition-opacity duration-150",
                        "group-hover/step:opacity-100"
                      )}
                    >
                      <span className="block text-sm font-semibold">{step.label}</span>
                      {meta.description ? (
                        <span className="mt-0.5 block text-xs leading-snug text-[#4a6a7d]">
                          {meta.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })()
            ))}
            </div>
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 overflow-y-auto">
          <div
            className={cn(
              "vendor-onboarding-input-surface mx-auto w-full max-w-[1400px] py-10 px-12 sm:px-24 lg:px-36"
            )}
          >
            {renderStep()}
          </div>
        </div>
      </div>
    </div>
  );
}
