import { apiRequest } from "@/lib/queryClient";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Check } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import { useAuth0 } from "@auth0/auth0-react";


// Step components
import Step2_BusinessDetails from "@/features/vendor/onboarding/Step2_BusinessDetails";
import Step3_Market from "@/features/vendor/onboarding/Step3_Market";
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

  // Business Details
  businessName: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  businessPhone: string;

  // Derived
  homeBaseLocation?: {
    lat: number;
    lng: number;
  };

  // Market
  serviceRadiusMiles: number; // 0, 15, 30, ...
  chargesTravelFee: boolean;
}

/* -----------------------------
   Steps
------------------------------ */

const STEPS = SINGLE_VENDOR_MODE
  ? [
      { id: 1, label: "Business Details" },
      { id: 2, label: "Market" },
      { id: 3, label: "Confirm" },
    ]
  : [
      { id: 1, label: "Vendor Type" },
      { id: 2, label: "Business Details" },
      { id: 3, label: "Market" },
      { id: 4, label: "Confirm" },
    ];

const STORAGE_KEY = "vendorOnboarding:v1";

const DEFAULT_ONBOARDING_DATA: VendorOnboardingData = {
  vendorType: SINGLE_VENDOR_MODE ? SINGLE_VENDOR_TYPE : "",
  businessName: "",
  streetAddress: "",
  city: "",
  state: "",
  zipCode: "",
  businessPhone: "",
  serviceRadiusMiles: 0,
  chargesTravelFee: false,
};

export default function VendorOnboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { getAccessTokenSilently } = useAuth0();

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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ currentStep, formData }));
    }, 250);

    return () => clearTimeout(t);
  }, [currentStep, formData]);

  const handleNext = () => {
    if (currentStep < STEPS.length) setCurrentStep((s) => s + 1);
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
    
    const res = await fetch("/api/vendor/onboarding/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({} as any));
      throw new Error(err?.error || err?.message || "Failed to complete onboarding");
    }

    return res.json();
  },




    onSuccess: (data) => {
      if (data.vendorAccountId) localStorage.setItem("vendorAccountId", data.vendorAccountId);
      if (data.profileId) localStorage.setItem("vendorProfileId", data.profileId);

      queryClient.invalidateQueries({ queryKey: ["/api/vendor/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer/me"] });

      toast({ title: "Vendor profile created" });
    },
  });

  const handleComplete = async (createListing: boolean) => {
    try {
      await completeOnboardingMutation.mutateAsync(formData);
      localStorage.removeItem(STORAGE_KEY);
      setLocation(createListing ? "/vendor/listings/new" : "/vendor/dashboard");
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
    // 1 = Business Details, 2 = Market, 3 = Confirm
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
            <Step3_Market
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
          <Step3_Market
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
    <div className="min-h-screen bg-white flex flex-col">
      <Navigation />
      
      <div className="flex flex-1">
        {/* Sidebar */}
        <div className="w-64 border-r p-6">
          <h2 className="text-xl font-bold mb-8">Vendor Onboarding</h2>
          <div className="space-y-4">
            {STEPS.map((step) => (
              <div key={step.id} className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 flex items-center justify-center rounded-full border ${
                    step.id <= currentStep
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-muted"
                  }`}
                >
                  {step.id < currentStep ? <Check className="w-4 h-4" /> : step.id}
                </div>
                <span
                  className={
                    step.id === currentStep ? "font-semibold" : "text-muted-foreground"
                  }
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto py-12 px-6">{renderStep()}</div>
        </div>
      </div>
    </div>
  );
}
