import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WizardStep, STEP_METADATA, ListingFormData, DEFAULT_FORM_DATA } from "./types";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Define API response types
interface ApiResponse<T> {
  data?: T;
  error?: string;
  success: boolean;
}

interface ListingResponse {
  id: string;
  [key: string]: any;
}
import { ServiceTypeStep } from "./steps/ServiceTypeStep";
import { LocationSelectionStep } from "./steps/LocationSelectionStep";
import { CreateListingIntroStep } from "./steps/CreateListingIntroStep";
import { AboutYouStep } from "./steps/AboutYouStep";
import { LocationStep } from "./steps/LocationStep";
import { PhotosStep } from "./steps/PhotosStep";
import { ServiceStep } from "./steps/ServiceStep";
import { OfferingsStep } from "./steps/OfferingsStep";
import { OfferingDetailsStep } from "./steps/OfferingDetailsStep";
import { BusinessHoursStep } from "./steps/BusinessHoursStep";
import { DiscountsStep } from "./steps/DiscountsStep";
import { RequirementsStep } from "./steps/RequirementsStep";
import { ReviewSubmitStep } from "./steps/ReviewSubmitStep";
import { ListingDoneStep } from "./steps/ListingDoneStep";

interface CreateListingWizardProps {
  onClose: () => void;
  initialData?: ListingFormData;
  editMode?: boolean;
  listingId?: string; // For editing existing drafts
}

export function CreateListingWizard({ onClose, initialData, editMode = false, listingId: existingListingId }: CreateListingWizardProps) {
  // Initialize with edit context if provided
  const [currentStep, setCurrentStep] = useState<WizardStep>(
    initialData ? "reviewSubmit" : "serviceType"
  );
  const [formData, setFormData] = useState<ListingFormData>(initialData || DEFAULT_FORM_DATA);
  const [completedSteps, setCompletedSteps] = useState<Set<WizardStep>>(
    initialData ? new Set(STEP_METADATA.map(s => s.id)) : new Set()
  );
  const [isDraft, setIsDraft] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [listingId, setListingId] = useState<string | null>(existingListingId || null);

  const currentStepIndex = STEP_METADATA.findIndex(s => s.id === currentStep);

  const { toast } = useToast();

  // Create draft mutation with error handling
  const createDraft = useMutation<ApiResponse<ListingResponse>, Error, ListingFormData>({
    mutationFn: async (data: ListingFormData) => {
      try {
        const response = await apiRequest("POST", "/api/vendor/listings", { listingData: data });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || 'Failed to create draft');
        }
        return result;
      } catch (error) {
        console.error('Draft creation failed:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      if (data?.data?.id) {
        setListingId(data.data.id);
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create draft. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Update draft mutation
  const updateDraft = useMutation({
    mutationFn: async (data: { id: string; listingData: ListingFormData }) => {
      const response = await apiRequest("PATCH", `/api/vendor/listings/${data.id}`, { listingData: data.listingData });
      return await response.json();
    },
  });

  // Create draft on mount (for new listings only)
  useEffect(() => {
    if (!existingListingId && !listingId && !initialData) {
      createDraft.mutate(DEFAULT_FORM_DATA);
    }
    
    // Cleanup function to cancel any pending API calls
    return () => {
      // Optionally cancel any pending requests here if needed
    };
  }, [existingListingId, listingId, initialData, createDraft]);

  // Auto-save to database when formData changes
  useEffect(() => {
    if (!listingId || isSavingDraft) return;

    const debounceTimer = setTimeout(() => {
      updateDraft.mutate({ id: listingId, listingData: formData });
    }, 1000); // Debounce for 1 second

    // Cleanup function to clear the timeout
    return () => clearTimeout(debounceTimer);
  }, [formData, listingId, isSavingDraft, updateDraft]);


  const goNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEP_METADATA.length) {
      setCompletedSteps(prev => new Set([...Array.from(prev), currentStep]));
      setCurrentStep(STEP_METADATA[nextIndex].id);
    }
  };

  const saveDraft = useCallback(() => {
    if (!listingId) {
      toast({
        title: "Error",
        description: "Unable to save draft: No listing ID",
        variant: "destructive",
      });
      return;
    }
    
    // Save to database and navigate to done
    setIsSavingDraft(true);
    updateDraft.mutate(
      { id: listingId, listingData: formData },
      {
        onSuccess: () => {
          setIsDraft(true);
          toast({
            title: "Draft saved",
            description: "Your listing has been saved as a draft.",
          });
          setCurrentStep("done");
          setIsSavingDraft(false);
        },
        onError: () => {
          setIsSavingDraft(false);
        },
      }
    );
  }, [listingId, formData, updateDraft, toast]);

  const goBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEP_METADATA[prevIndex].id);
    }
  };

  const goTo = (step: WizardStep) => {
    const stepIndex = STEP_METADATA.findIndex(s => s.id === step);
    if (stepIndex <= currentStepIndex || completedSteps.has(step)) {
      setCurrentStep(step);
    }
  };

  const handleSaveAndExit = () => {
    if (listingId) {
      updateDraft.mutate({ id: listingId, listingData: formData });
    }
    onClose();
  };

  const updateFormData = (updates: Partial<ListingFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const renderStep = () => {
    const stepProps = { formData, updateFormData, goNext, goBack };

    switch (currentStep) {
      case "serviceType":
        return <ServiceTypeStep {...stepProps} />;
      case "locationSelection":
        return <LocationSelectionStep {...stepProps} />;
      case "createIntro":
        return <CreateListingIntroStep {...stepProps} />;
      case "about":
        return <AboutYouStep {...stepProps} />;
      case "location":
        return <LocationStep {...stepProps} />;
      case "photos":
        return <PhotosStep {...stepProps} />;
      case "service":
        return <ServiceStep {...stepProps} />;
      case "offerings":
        return <OfferingsStep {...stepProps} />;
      case "offeringDetails":
        return <OfferingDetailsStep {...stepProps} />;
      case "businessHours":
        return <BusinessHoursStep {...stepProps} />;
      case "discounts":
        return <DiscountsStep {...stepProps} />;
      case "requirements":
        return <RequirementsStep {...stepProps} />;
      case "reviewSubmit":
        return <ReviewSubmitStep {...stepProps} saveDraft={saveDraft} listingId={listingId} updateDraft={updateDraft} />;
      case "done":
        return <ListingDoneStep onClose={onClose} formData={formData} />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" data-testid="wizard-overlay">
      <div className="fixed inset-0 flex">
        <div className="w-64 bg-card border-r border-border p-6 overflow-y-auto" data-testid="wizard-sidebar">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-lg font-semibold">Create Listing</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSaveAndExit}
              data-testid="button-save-exit"
            >
              <Save className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-4">
            {STEP_METADATA.map((step, index) => {
              const isActive = step.id === currentStep;
              const isCompleted = completedSteps.has(step.id);
              const isAccessible = index <= currentStepIndex || isCompleted;

              return (
                <button
                  key={step.id}
                  onClick={() => isAccessible && goTo(step.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                    isActive
                      ? "bg-primary text-white"
                      : isCompleted
                      ? "bg-muted hover-elevate cursor-pointer"
                      : isAccessible
                      ? "hover-elevate cursor-pointer"
                      : "opacity-50 cursor-not-allowed"
                  }`}
                  disabled={!isAccessible}
                  aria-current={isActive ? "step" : undefined}
                  aria-disabled={!isAccessible}
                  aria-label={`${step.label}${isCompleted ? " (completed)" : isActive ? " (current)" : ""}`}
                  data-testid={`step-${step.id}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      isActive
                        ? "bg-white text-primary"
                        : isCompleted
                        ? "bg-primary text-white"
                        : "bg-muted"
                    }`}
                  >
                    {step.icon}
                  </div>
                  <span className="text-sm font-medium">{step.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-border bg-card">
            <h1 className="text-xl font-semibold">
              {STEP_METADATA[currentStepIndex]?.label}
            </h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSaveAndExit}
              data-testid="button-close-wizard"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto bg-background">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                {renderStep()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
