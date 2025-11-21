import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Calendar } from "lucide-react";

export default function CustomerProfileQuestions() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state (all optional)
  const [location, setFormLocation] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [hobbies, setHobbies] = useState("");
  const [funFacts, setFunFacts] = useState("");
  const [socialMedia, setSocialMedia] = useState("");
  const [profilePicture, setProfilePicture] = useState<File | null>(null);

  const handleSkip = () => {
    toast({
      title: "Profile setup skipped",
      description: "You can complete your profile later from your dashboard.",
    });
    setLocation("/dashboard");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // TODO: Send profile data to backend
      const profileData = {
        location,
        age: age ? parseInt(age) : null,
        gender,
        hobbies,
        funFacts,
        socialMedia,
        // TODO: Handle profile picture upload
      };

      console.log("Profile data:", profileData);

      toast({
        title: "Profile updated!",
        description: "Your profile has been saved successfully.",
      });

      setLocation("/dashboard");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl" data-testid="card-profile-questions">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          <Calendar className="h-8 w-8 text-primary" />
          <div className="flex-1">
            <CardTitle className="font-serif text-3xl">Let's get to know you</CardTitle>
            <CardDescription className="text-base mt-2">
              Help us personalize your experience. All fields are optional.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              {/* Location */}
              <div className="space-y-2">
                <Label htmlFor="location">Where are you from?</Label>
                <Input
                  id="location"
                  placeholder="City, State"
                  value={location}
                  onChange={(e) => setFormLocation(e.target.value)}
                  data-testid="input-location"
                />
              </div>

              {/* Age */}
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  placeholder="25"
                  min="18"
                  max="120"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  data-testid="input-age"
                />
              </div>

              {/* Gender */}
              <div className="space-y-2">
                <Label htmlFor="gender">Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger id="gender" data-testid="select-gender">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="non-binary">Non-binary</SelectItem>
                    <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Hobbies */}
              <div className="space-y-2">
                <Label htmlFor="hobbies">Preferred hobbies</Label>
                <Textarea
                  id="hobbies"
                  placeholder="Photography, travel, cooking..."
                  value={hobbies}
                  onChange={(e) => setHobbies(e.target.value)}
                  rows={3}
                  data-testid="textarea-hobbies"
                />
              </div>

              {/* Fun Facts */}
              <div className="space-y-2">
                <Label htmlFor="funFacts">Fun facts</Label>
                <Textarea
                  id="funFacts"
                  placeholder="Tell us something interesting about yourself"
                  value={funFacts}
                  onChange={(e) => setFunFacts(e.target.value)}
                  rows={3}
                  data-testid="textarea-fun-facts"
                />
              </div>

              {/* Social Media */}
              <div className="space-y-2">
                <Label htmlFor="socialMedia">Social media link</Label>
                <Input
                  id="socialMedia"
                  type="url"
                  placeholder="https://instagram.com/username"
                  value={socialMedia}
                  onChange={(e) => setSocialMedia(e.target.value)}
                  data-testid="input-social-media"
                />
              </div>

              {/* Profile Picture */}
              <div className="space-y-2">
                <Label htmlFor="profilePicture">Profile picture upload</Label>
                <Input
                  id="profilePicture"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setProfilePicture(e.target.files?.[0] || null)}
                  data-testid="input-profile-picture"
                />
                <p className="text-sm text-muted-foreground">
                  Note: Only vendors/family you book with can see this
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={handleSkip}
                data-testid="button-skip"
              >
                Skip for now
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isSubmitting}
                data-testid="button-save"
              >
                {isSubmitting ? "Saving..." : "Save & Continue"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
