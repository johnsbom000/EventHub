import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileWizardStep, PROFILE_STEP_METADATA, ProfileFormData, DEFAULT_PROFILE_DATA } from "./types";
import { ServiceTypeStep } from "../create-listing/steps/ServiceTypeStep";
import { AboutYouStep } from "../create-listing/steps/AboutYouStep";
import { LocationStep } from "../create-listing/steps/LocationStep";
import { PhotosStep } from "../create-listing/steps/PhotosStep";
import { ServiceStep } from "../create-listing/steps/ServiceStep";
import { ReadyToListStep } from "./steps/ReadyToListStep";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface VendorProfileWizardProps {
  onComplete: (createListing: boolean) => void;
  onSkip?: () => void;
}

export function VendorProfileWizard({ onComplete, onSkip }: VendorProfileWizardProps) {
  const [currentStep, setCurrentStep] = useState<ProfileWizardStep>("serviceType");
  const [formData, setFormData] = useState<ProfileFormData>(DEFAULT_PROFILE_DATA);
  const [completedSteps, setCompletedSteps] = useState<Set<ProfileWizardStep>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const currentStepIndex = PROFILE_STEP_METADATA.findIndex(s => s.id === currentStep);

  // Load draft from localStorage
  useEffect(() => {
    const savedData = localStorage.getItem("vendorProfileDraft");
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.version === "1.0") {
          setFormData(parsed.formData || DEFAULT_PROFILE_DATA);
          setCurrentStep(parsed.currentStep || "serviceType");
          setCompletedSteps(new Set(parsed.completedSteps || []));
        }
      } catch (e) {
        console.error("Failed to load profile draft:", e);
      }
    }
  }, []);

  // Auto-save to localStorage
  useEffect(() => {
    const draftData = {
      version: "1.0",
      formData,
      currentStep,
      completedSteps: Array.from(completedSteps),
    };
    localStorage.setItem("vendorProfileDraft", JSON.stringify(draftData));
  }, [formData, currentStep, completedSteps]);

  const goNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < PROFILE_STEP_METADATA.length) {
      setCompletedSteps(prev => new Set([...Array.from(prev), currentStep]));
      setCurrentStep(PROFILE_STEP_METADATA[nextIndex].id);
    }
  };

  const goBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(PROFILE_STEP_METADATA[prevIndex].id);
    }
  };

  const updateFormData = (updates: Partial<ProfileFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const saveProfile = async () => {
    setIsSaving(true);
    try {
      await apiRequest("/api/vendor/profile", {
        method: "POST",
        body: JSON.stringify(formData),
      });
      
      // Clear draft after successful save
      localStorage.removeItem("vendorProfileDraft");
      
      // Invalidate vendor account query to refresh profileComplete status
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/me"] });
      
      return true;
    } catch (error) {
      console.error("Failed to save profile:", error);
      toast({
        title: "Error",
        description: "Failed to save your profile. Please try again.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleYes = async () => {
    const success = await saveProfile();
    if (success) {
      onComplete(true);
    }
  };

  const handleNo = async () => {
    const success = await saveProfile();
    if (success) {
      onComplete(false);
    }
  };

  const renderStep = () => {
    const stepProps = { formData, updateFormData, goNext, goBack };

    switch (currentStep) {
      case "serviceType":
        return <ServiceTypeStep {...stepProps} />;
      case "about":
        return <AboutYouStep {...stepProps} />;
      case "location":
        return <LocationStep {...stepProps} />;
      case "photos":
        return <PhotosStep {...stepProps} />;
      case "service":
        return <ServiceStep {...stepProps} />;
      case "readyToList":
        return <ReadyToListStep {...stepProps} onYes={handleYes} onNo={handleNo} />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background" data-testid="profile-wizard-overlay">
      <div className="fixed inset-0 flex">
        {/* Sidebar */}
        <div className="w-64 bg-card border-r border-border p-6 overflow-y-auto" data-testid="profile-wizard-sidebar">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-lg font-semibold">Vendor Profile</h2>
            {onSkip && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onSkip}
                data-testid="button-close-wizard"
              >
                <X className="w-5 h-5" />
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {PROFILE_STEP_METADATA.filter(s => s.id !== "done").map((step) => {
              const isActive = step.id === currentStep;
              const isCompleted = completedSteps.has(step.id);
              const isCurrent = step.id === currentStep;

              return (
                <div
                  key={step.id}
                  className={`p-3 rounded-lg transition-colors ${
                    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground"
                  }`}
                  data-testid={`step-${step.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                        isCompleted ? "bg-primary text-primary-foreground" :
                        isCurrent ? "bg-primary/20 text-primary" :
                        "bg-muted text-muted-foreground"
                      }`}
                    >
                      {step.number}
                    </div>
                    <span className="text-sm font-medium">{step.title}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
