import { Button } from "@/components/ui/button";
import OnboardingStepHeader from "@/features/vendor/onboarding/OnboardingStepHeader";

interface Step4ConfirmProps {
  formData: {
    vendorType: string;
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
    shopProfilePhotoDataUrl?: string;
    shopCoverPhotoDataUrl?: string;
  };
  onBack: () => void;
  onComplete: (createListing: boolean, destination?: "dashboard" | "myHub") => void;
  isSubmitting?: boolean;
  submittingAction?: "createListing" | "myHub" | "dashboard" | null;
}

type ConfirmField = {
  label: string;
  value: string;
};

function formatValue(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  return trimmed || "—";
}

export default function Step4_Confirm({
  formData,
  onBack,
  onComplete,
  isSubmitting = false,
  submittingAction = null,
}: Step4ConfirmProps) {
  const businessFields: ConfirmField[] = [
    {
      label: "Business name",
      value: formatValue(formData.businessName),
    },
    {
      label: "Business address",
      value: formatValue(
        [formData.streetAddress, formData.city, formData.state, formData.zipCode].filter(Boolean).join(", ")
      ),
    },
    {
      label: "Street address",
      value: formatValue(formData.streetAddress),
    },
    {
      label: "City",
      value: formatValue(formData.city),
    },
    {
      label: "State",
      value: formatValue(formData.state),
    },
    {
      label: "Zip",
      value: formatValue(formData.zipCode),
    },
    {
      label: "Business phone",
      value: formatValue(formData.businessPhone),
    },
    {
      label: "Business email",
      value: formatValue(formData.businessEmail),
    },
    {
      label: "About the business",
      value: formatValue(formData.aboutBusiness),
    },
    {
      label: "Tagline",
      value: formatValue(formData.shopTagline),
    },
    {
      label: "In Business Since (Year)",
      value: formatValue(formData.inBusinessSinceYear),
    },
    {
      label: "Specialties",
      value: formatValue(formData.specialties),
    },
    {
      label: "Events Served To Date",
      value: formatValue(formData.eventsServedBaseline),
    },
  ];

  const ownerFields: ConfirmField[] = [
    {
      label: "Your Introduction",
      value: formatValue(formData.aboutVendor),
    },
    {
      label: "Hobbies",
      value: formatValue(formData.hobbies),
    },
    {
      label: "From",
      value: formatValue(formData.homeState),
    },
    {
      label: "Fun Facts",
      value: formatValue(formData.funFacts),
    },
    {
      label: "Profile photo",
      value: formData.shopProfilePhotoDataUrl?.trim() ? "Added" : "Not added",
    },
    {
      label: "Cover photo",
      value: formData.shopCoverPhotoDataUrl?.trim() ? "Added" : "Not added",
    },
  ];

  return (
    <div className="space-y-6 pb-28">
      <div className="space-y-2">
        <OnboardingStepHeader currentStep={3} />
        <h1 className="text-[3rem] font-semibold">Confirm</h1>
      </div>

      <div className="vendor-onboarding-step-content">
        <div className="grid w-full max-w-[1400px] gap-6 md:grid-cols-2">
          <div className="rounded-xl border p-4 space-y-6">
            <section className="space-y-3">
              <h2 className="!text-[25px] leading-tight font-semibold">Business Details</h2>
              <div className="space-y-2">
                {businessFields.map((field) => (
                  <div key={field.label} className="space-y-2">
                    <div className="text-[14.5px] leading-normal">
                      <span className="text-[14.5px] font-semibold">{field.label}:</span>{" "}
                      <span>{field.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="rounded-xl border p-4 space-y-6">
            <section className="space-y-3">
              <h2 className="!text-[25px] leading-tight font-semibold">About the Owner</h2>
              <div className="space-y-2">
                {ownerFields.map((field) => (
                  <div key={field.label} className="space-y-2">
                    <div className="text-[14.5px] leading-normal">
                      <span className="text-[14.5px] font-semibold">{field.label}:</span>{" "}
                      <span>{field.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="fixed bottom-0 left-24 right-0 z-30 bg-[#ffffff]/96 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-6 pt-4 pb-8 sm:px-12 lg:px-16">
            <Button
              variant="outline"
              type="button"
              onClick={onBack}
              disabled={isSubmitting}
              className="min-h-[2.7rem] px-6 font-sans text-[1.2rem] font-medium"
            >
              Back
            </Button>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                type="button"
                onClick={() => onComplete(false, "myHub")}
                disabled={isSubmitting}
                className="min-h-[2.7rem] px-6 font-sans text-[1.2rem] font-medium"
              >
                {isSubmitting && submittingAction === "myHub" ? "Opening My Hub..." : "Go To My Hub"}
              </Button>
              <Button
                type="button"
                onClick={() => onComplete(true)}
                disabled={isSubmitting}
                className="min-h-[2.7rem] px-6 font-sans text-[1.2rem] font-medium"
              >
                {isSubmitting && submittingAction === "createListing" ? "Opening listing wizard..." : "Create first listing"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
