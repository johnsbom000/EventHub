import { z } from "zod";

export type ProfileWizardStep =
  | "serviceType"
  | "about"
  | "location"
  | "photos"
  | "service"
  | "readyToList"
  | "done";

export interface ProfileStepMetadata {
  id: ProfileWizardStep;
  title: string;
  number: number;
}

export const PROFILE_STEP_METADATA: ProfileStepMetadata[] = [
  { id: "serviceType", title: "Service Type", number: 1 },
  { id: "about", title: "About You", number: 2 },
  { id: "location", title: "Location", number: 3 },
  { id: "photos", title: "Photos", number: 4 },
  { id: "service", title: "Service Description", number: 5 },
  { id: "readyToList", title: "Ready to Create Listing?", number: 6 },
  { id: "done", title: "Complete", number: 7 },
];

export interface OnlineProfile {
  platform: string;
  url: string;
}

export interface ProfileFormData {
  serviceType: string;
  experience: number;
  qualifications: string[];
  onlineProfiles: OnlineProfile[];
  address: string;
  city: string;
  travelMode: "travel-to-guests" | "guests-come-to-me";
  serviceRadius?: number;
  serviceAddress?: string;
  photos: string[];
  serviceDescription: string;
}

export const DEFAULT_PROFILE_DATA: ProfileFormData = {
  serviceType: "",
  experience: 0,
  qualifications: [],
  onlineProfiles: [],
  address: "",
  city: "",
  travelMode: "travel-to-guests",
  serviceRadius: 25,
  serviceAddress: "",
  photos: [],
  serviceDescription: "",
};

export const profileSchema = z.object({
  serviceType: z.string().min(1, "Service type is required"),
  experience: z.number().min(0, "Experience must be a positive number"),
  qualifications: z.array(z.string()),
  onlineProfiles: z.array(z.object({
    platform: z.string(),
    url: z.string().url(),
  })),
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  travelMode: z.enum(["travel-to-guests", "guests-come-to-me"]),
  serviceRadius: z.number().optional(),
  serviceAddress: z.string().optional(),
  photos: z.array(z.string()).min(1, "At least one photo is required"),
  serviceDescription: z.string().min(50, "Description must be at least 50 characters"),
});
