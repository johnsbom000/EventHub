export type WizardStep =
  | "serviceType"
  | "locationSelection"
  | "createIntro"
  | "about"
  | "location"
  | "photos"
  | "service"
  | "offerings"
  | "offeringDetails"
  | "businessHours"
  | "discounts"
  | "requirements"
  | "reviewSubmit"
  | "done";

export interface StepMetadata {
  id: WizardStep;
  label: string;
  icon: string;
}

export interface Offering {
  id: string;
  photo?: File | string;
  title: string;
  description: string;
  price: number;
  duration: number;
}

export interface BusinessHours {
  day: string;
  enabled: boolean;
  timeRanges: { start: string; end: string }[];
}

export interface Discount {
  type: "limited-time" | "early-bird" | "large-group";
  percentage: number;
  enabled: boolean;
}

export interface ListingFormData {
  serviceType: string;
  city: string;
  experience: number;
  qualifications: string[];
  onlineProfiles: { platform: string; url: string }[];
  address: string;
  introVideo?: File | string;
  travelMode: "travel-to-guests" | "guests-come-to-me";
  serviceRadius?: number;
  serviceAddress?: string;
  photos: (File | string)[];
  serviceDescription: string;
  offerings: Offering[];
  businessHours: BusinessHours[];
  discounts: Discount[];
  agreeToTerms: boolean;
  agreeToGuidelines: boolean;
}

export const DEFAULT_FORM_DATA: ListingFormData = {
  serviceType: "",
  city: "",
  experience: 0,
  qualifications: [],
  onlineProfiles: [],
  address: "",
  travelMode: "travel-to-guests",
  photos: [],
  serviceDescription: "",
  offerings: [],
  businessHours: [
    { day: "Monday", enabled: false, timeRanges: [] },
    { day: "Tuesday", enabled: false, timeRanges: [] },
    { day: "Wednesday", enabled: false, timeRanges: [] },
    { day: "Thursday", enabled: false, timeRanges: [] },
    { day: "Friday", enabled: false, timeRanges: [] },
    { day: "Saturday", enabled: false, timeRanges: [] },
    { day: "Sunday", enabled: false, timeRanges: [] },
  ],
  discounts: [
    { type: "limited-time", percentage: 0, enabled: false },
    { type: "early-bird", percentage: 0, enabled: false },
    { type: "large-group", percentage: 0, enabled: false },
  ],
  agreeToTerms: false,
  agreeToGuidelines: false,
};

export const STEP_METADATA: StepMetadata[] = [
  { id: "serviceType", label: "Service Type", icon: "1" },
  { id: "locationSelection", label: "Location", icon: "2" },
  { id: "createIntro", label: "Get Started", icon: "3" },
  { id: "about", label: "About You", icon: "4" },
  { id: "location", label: "Service Area", icon: "5" },
  { id: "photos", label: "Photos", icon: "6" },
  { id: "service", label: "Description", icon: "7" },
  { id: "offerings", label: "Offerings", icon: "8" },
  { id: "offeringDetails", label: "Offering Details", icon: "9" },
  { id: "businessHours", label: "Hours", icon: "10" },
  { id: "discounts", label: "Discounts", icon: "11" },
  { id: "requirements", label: "Requirements", icon: "12" },
  { id: "reviewSubmit", label: "Review", icon: "13" },
  { id: "done", label: "Complete", icon: "✓" },
];
