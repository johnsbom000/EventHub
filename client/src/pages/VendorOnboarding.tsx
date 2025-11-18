import { useState } from "react";
import { useLocation } from "wouter";
import { Check } from "lucide-react";
import Step1_ServiceSetup from "@/features/vendor/onboarding/Step1_ServiceSetup";
import Step2_AboutYou from "@/features/vendor/onboarding/Step2_AboutYou";
import Step3_Location from "@/features/vendor/onboarding/Step3_Location";
import Step4_Portfolio from "@/features/vendor/onboarding/Step4_Portfolio";
import Step5_ServiceDescription from "@/features/vendor/onboarding/Step5_ServiceDescription";
import Step6_ReadyToCreateListing from "@/features/vendor/onboarding/Step6_ReadyToCreateListing";

export interface VendorOnboardingData {
  serviceType: string;
  businessName: string;
  contactName: string;
  bio: string;
  website?: string;
  instagram?: string;
  tiktok?: string;
  introVideoUrl?: string;
  city: string;
  state?: string;
  serviceRadius?: string;
  portfolioImages: string[];
  coverImageIndex: number;
  serviceHeadline: string;
  serviceDescription: string;
}

const STEPS = [
  { id: 1, label: "Service Type" },
  { id: 2, label: "About You" },
  { id: 3, label: "Location" },
  { id: 4, label: "Portfolio" },
  { id: 5, label: "Service Description" },
  { id: 6, label: "Ready to Create Listing?" },
];

export default function VendorOnboarding() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<VendorOnboardingData>({
    serviceType: "",
    businessName: "",
    contactName: "",
    bio: "",
    website: "",
    instagram: "",
    tiktok: "",
    introVideoUrl: "",
    city: "",
    state: "",
    serviceRadius: "",
    portfolioImages: [],
    coverImageIndex: 0,
    serviceHeadline: "",
    serviceDescription: "",
  });

  const updateFormData = (updates: Partial<VendorOnboardingData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async (createListing: boolean) => {
    // TODO: Save vendor profile data to backend
    // TODO: Upgrade customer to vendor role if needed
    // Redirect to vendor dashboard or listing creation
    if (createListing) {
      setLocation("/vendor/listings/new");
    } else {
      setLocation("/vendor/dashboard");
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1_ServiceSetup
            selectedService={formData.serviceType}
            onSelect={(serviceType) => updateFormData({ serviceType })}
            onNext={handleNext}
          />
        );
      case 2:
        return (
          <Step2_AboutYou
            formData={formData}
            updateFormData={updateFormData}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 3:
        return (
          <Step3_Location
            formData={formData}
            updateFormData={updateFormData}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 4:
        return (
          <Step4_Portfolio
            formData={formData}
            updateFormData={updateFormData}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 5:
        return (
          <Step5_ServiceDescription
            formData={formData}
            updateFormData={updateFormData}
            onNext={handleNext}
            onBack={handleBack}
          />
        );
      case 6:
        return (
          <Step6_ReadyToCreateListing
            onComplete={handleComplete}
            onBack={handleBack}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Sidebar */}
      <div className="w-64 bg-card border-r border-border p-6">
        <h2 className="text-xl font-bold mb-8">Vendor Profile</h2>
        <div className="space-y-4">
          {STEPS.map((step) => (
            <div
              key={step.id}
              className="flex items-center gap-3"
              data-testid={`sidebar-step-${step.id}`}
            >
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors ${
                  step.id === currentStep
                    ? "bg-primary border-primary text-primary-foreground"
                    : step.id < currentStep
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-border bg-background"
                }`}
              >
                {step.id < currentStep ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <span className="text-sm font-medium">{step.id}</span>
                )}
              </div>
              <span
                className={`text-sm ${
                  step.id === currentStep
                    ? "font-semibold text-foreground"
                    : step.id < currentStep
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-12 px-6">{renderStep()}</div>
      </div>
    </div>
  );
}
