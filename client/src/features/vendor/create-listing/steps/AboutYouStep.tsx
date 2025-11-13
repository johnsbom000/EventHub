import { useState } from "react";
import { ListingFormData } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";

interface AboutYouStepProps {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  goNext: () => void;
  goBack: () => void;
}

export function AboutYouStep({ formData, updateFormData, goNext, goBack }: AboutYouStepProps) {
  const [experience, setExperience] = useState(formData.experience || 0);
  const [qualifications, setQualifications] = useState(formData.qualifications || []);
  const [profiles, setProfiles] = useState(formData.onlineProfiles || []);
  const [address, setAddress] = useState(formData.address || "");
  const [city, setCity] = useState(formData.city || "");
  const [newQualification, setNewQualification] = useState("");
  const [newProfile, setNewProfile] = useState({ platform: "", url: "" });

  const addQualification = () => {
    if (newQualification) {
      setQualifications([...qualifications, newQualification]);
      setNewQualification("");
    }
  };

  const removeQualification = (index: number) => {
    setQualifications(qualifications.filter((_, i) => i !== index));
  };

  const addProfile = () => {
    if (newProfile.platform && newProfile.url) {
      setProfiles([...profiles, newProfile]);
      setNewProfile({ platform: "", url: "" });
    }
  };

  const removeProfile = (index: number) => {
    setProfiles(profiles.filter((_, i) => i !== index));
  };

  const handleNext = () => {
    // Validate required fields
    if (!address.trim()) {
      return; // Don't proceed if address is empty
    }
    if (!city.trim()) {
      return; // Don't proceed if city is empty
    }
    updateFormData({ experience, qualifications, onlineProfiles: profiles, address, city });
    goNext();
  };

  return (
    <div className="max-w-3xl mx-auto p-8" data-testid="step-content-about">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Tell us about yourself</h2>
        <p className="text-muted-foreground">
          Share your experience and credentials
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <Label>Years of Experience</Label>
          <Input
            type="number"
            value={experience || ""}
            onChange={(e) => setExperience(e.target.value === "" ? 0 : parseInt(e.target.value))}
            placeholder="e.g., 5"
            min="0"
            data-testid="input-experience"
          />
        </div>

        <div>
          <Label>Qualifications & Certifications</Label>
          <div className="space-y-2">
            {qualifications.map((qual, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input value={qual} readOnly className="flex-1" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeQualification(index)}
                  data-testid={`button-remove-qualification-${index}`}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                value={newQualification}
                onChange={(e) => setNewQualification(e.target.value)}
                placeholder="Add a qualification"
                data-testid="input-new-qualification"
              />
              <Button onClick={addQualification} data-testid="button-add-qualification">
                <Plus className="w-4 h-4 mr-2" />
                Add
              </Button>
            </div>
          </div>
        </div>

        <div>
          <Label>Online Profiles</Label>
          <div className="space-y-2">
            {profiles.map((profile, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input value={profile.platform} readOnly className="w-32" />
                <Input value={profile.url} readOnly className="flex-1" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeProfile(index)}
                  data-testid={`button-remove-profile-${index}`}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Select
                value={newProfile.platform}
                onValueChange={(value) => setNewProfile({ ...newProfile, platform: value })}
              >
                <SelectTrigger className="w-40" data-testid="select-profile-platform">
                  <SelectValue placeholder="Platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Instagram">Instagram</SelectItem>
                  <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                  <SelectItem value="X">X</SelectItem>
                  <SelectItem value="VSCO">VSCO</SelectItem>
                  <SelectItem value="Youtube">Youtube</SelectItem>
                  <SelectItem value="Personal Website">Personal Website</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={newProfile.url}
                onChange={(e) => setNewProfile({ ...newProfile, url: e.target.value })}
                placeholder="URL"
                className="flex-1"
                data-testid="input-profile-url"
              />
              <Button onClick={addProfile} data-testid="button-add-profile">
                <Plus className="w-4 h-4 mr-2" />
                Add
              </Button>
            </div>
          </div>
        </div>

        <div>
          <Label>City</Label>
          <Input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="New York"
            data-testid="input-city"
          />
        </div>

        <div>
          <Label>Business Address</Label>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, State ZIP"
            data-testid="input-address"
          />
        </div>
      </div>

      <div className="flex justify-between mt-8">
        <Button variant="outline" onClick={goBack} data-testid="button-back">
          Back
        </Button>
        <Button onClick={handleNext} data-testid="button-next">
          Next
        </Button>
      </div>
    </div>
  );
}
