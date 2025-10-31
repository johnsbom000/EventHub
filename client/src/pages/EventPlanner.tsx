import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ChevronRight, ChevronLeft, Sparkles, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { InsertEvent, PhotographerDetails, VideographerDetails, FloristDetails, CateringDetails, DJDetails, PropDecorDetails } from "@shared/schema";

const vendorTypes = [
  { id: "photographer", label: "Photographer" },
  { id: "videographer", label: "Videographer" },
  { id: "florist", label: "Florist" },
  { id: "catering", label: "Catering" },
  { id: "dj", label: "DJ" },
  { id: "prop-decor", label: "Prop / Décor Rental" },
];

export default function EventPlanner() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<'basic' | 'path-selection' | 'curated'>('basic');
  const [selectedPath, setSelectedPath] = useState<'browse' | 'curated' | null>(null);
  const [currentVendorIndex, setCurrentVendorIndex] = useState(0);

  const [eventType, setEventType] = useState("");
  const [location, setLocationValue] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);

  const [photographerDetails, setPhotographerDetails] = useState<Partial<PhotographerDetails>>({ 
    preEventShoots: false 
  });
  const [videographerDetails, setVideographerDetails] = useState<Partial<VideographerDetails>>({ 
    preEventShoots: false 
  });
  const [floristDetails, setFloristDetails] = useState<Partial<FloristDetails>>({ 
    arrangementsNeeded: [],
    beforeEventNeeds: false,
    touchUps: false
  });
  const [cateringDetails, setCateringDetails] = useState<Partial<CateringDetails>>({ 
    foodStyle: [],
    serviceType: [],
    allergyFriendly: false,
    beforeEventCatering: false
  });
  const [djDetails, setDJDetails] = useState<Partial<DJDetails>>({ 
    servicesNeeded: [],
    hasPlaylist: false
  });
  const [propDecorDetails, setPropDecorDetails] = useState<Partial<PropDecorDetails>>({ 
    itemsNeeded: "" 
  });

  const createEventMutation = useMutation({
    mutationFn: async (eventData: InsertEvent) => {
      const response = await apiRequest("POST", "/api/events", eventData);
      return await response.json();
    },
    onSuccess: (data, variables) => {
      if (variables.path === 'curated') {
        toast({
          title: "Event created successfully!",
          description: "Showing your curated recommendations...",
        });
        setLocation(`/recommendations/${data.id}`);
      } else {
        toast({
          title: "Event created successfully!",
          description: "Redirecting to browse vendors...",
        });
        setLocation("/browse");
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error creating event",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleVendor = (id: string) => {
    setSelectedVendors(prev =>
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
    );
  };

  const handleBasicSubmit = () => {
    if (!eventType || !location || !date || !startTime || !guestCount || selectedVendors.length === 0) {
      toast({
        title: "Please fill all required fields",
        variant: "destructive",
      });
      return;
    }
    setCurrentStep('path-selection');
  };

  const handlePathSelection = (path: 'browse' | 'curated') => {
    setSelectedPath(path);
    if (path === 'browse') {
      const eventData: InsertEvent = {
        eventType,
        location,
        date,
        startTime,
        guestCount: parseInt(guestCount),
        vendorsNeeded: selectedVendors,
        path: 'browse',
      };
      createEventMutation.mutate(eventData);
    } else {
      setCurrentStep('curated');
      setCurrentVendorIndex(0);
    }
  };

  const handleVendorQuestionnaireNext = () => {
    if (currentVendorIndex < selectedVendors.length - 1) {
      setCurrentVendorIndex(currentVendorIndex + 1);
    } else {
      handleCuratedSubmit();
    }
  };

  const handleVendorQuestionnaireBack = () => {
    if (currentVendorIndex > 0) {
      setCurrentVendorIndex(currentVendorIndex - 1);
    } else {
      setCurrentStep('path-selection');
    }
  };

  const handleCuratedSubmit = () => {
    const eventData: InsertEvent = {
      eventType,
      location,
      date,
      startTime,
      guestCount: parseInt(guestCount),
      vendorsNeeded: selectedVendors,
      path: 'curated',
      photographerDetails: selectedVendors.includes('photographer') ? photographerDetails as PhotographerDetails : undefined,
      videographerDetails: selectedVendors.includes('videographer') ? videographerDetails as VideographerDetails : undefined,
      floristDetails: selectedVendors.includes('florist') ? floristDetails as FloristDetails : undefined,
      cateringDetails: selectedVendors.includes('catering') ? cateringDetails as CateringDetails : undefined,
      djDetails: selectedVendors.includes('dj') ? djDetails as DJDetails : undefined,
      propDecorDetails: selectedVendors.includes('prop-decor') ? propDecorDetails as PropDecorDetails : undefined,
    };
    createEventMutation.mutate(eventData);
  };

  const currentVendor = selectedVendors[currentVendorIndex];

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1 bg-card/50 py-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-page-title">
              Event Planning Intake
            </h1>
            <p className="text-muted-foreground">
              Tell us about your event to get matched with perfect vendors
            </p>
          </div>

          {currentStep === 'basic' && (
            <Card>
              <CardHeader>
                <CardTitle>Basic Event Details</CardTitle>
                <CardDescription>Let's start with the essentials</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="event-type">Event Type *</Label>
                  <Select value={eventType} onValueChange={setEventType}>
                    <SelectTrigger id="event-type" data-testid="select-event-type">
                      <SelectValue placeholder="Select event type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wedding">Wedding</SelectItem>
                      <SelectItem value="corporate">Corporate Event</SelectItem>
                      <SelectItem value="birthday">Birthday</SelectItem>
                      <SelectItem value="anniversary">Anniversary</SelectItem>
                      <SelectItem value="baby-shower">Baby Shower</SelectItem>
                      <SelectItem value="graduation">Graduation</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">Location *</Label>
                  <Input
                    id="location"
                    placeholder="City, State or venue"
                    value={location}
                    onChange={(e) => setLocationValue(e.target.value)}
                    data-testid="input-location"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="date">Date *</Label>
                    <Input
                      id="date"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      data-testid="input-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="start-time">Start Time *</Label>
                    <Input
                      id="start-time"
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      data-testid="input-start-time"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="guest-count">Guest Count *</Label>
                  <Input
                    id="guest-count"
                    type="number"
                    placeholder="e.g., 150"
                    value={guestCount}
                    onChange={(e) => setGuestCount(e.target.value)}
                    data-testid="input-guest-count"
                  />
                </div>

                <div className="space-y-3">
                  <Label>Vendors Needed *</Label>
                  <div className="space-y-2">
                    {vendorTypes.map((vendor) => (
                      <div key={vendor.id} className="flex items-center gap-3 p-3 rounded-lg border hover-elevate">
                        <Checkbox
                          id={vendor.id}
                          checked={selectedVendors.includes(vendor.id)}
                          onCheckedChange={() => toggleVendor(vendor.id)}
                          data-testid={`checkbox-vendor-${vendor.id}`}
                        />
                        <Label htmlFor={vendor.id} className="cursor-pointer flex-1">
                          {vendor.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={handleBasicSubmit}
                  data-testid="button-submit-basic"
                >
                  Continue
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          )}

          {currentStep === 'path-selection' && (
            <div className="space-y-4">
              <Card className="hover-elevate cursor-pointer" onClick={() => handlePathSelection('browse')} data-testid="card-path-browse">
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10">
                      <Search className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-xl">Browse Vendors</CardTitle>
                      <CardDescription className="mt-2">
                        View all vendors filtered by your location, date, and selected vendor types. Perfect if you want to explore options on your own.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <Card className="hover-elevate cursor-pointer" onClick={() => handlePathSelection('curated')} data-testid="card-path-curated">
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-accent">
                      <Sparkles className="h-6 w-6 text-accent-foreground" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-xl">Get a Curated List</CardTitle>
                      <CardDescription className="mt-2">
                        Answer detailed questions about each vendor type to receive personalized recommendations. We'll match you with the perfect vendors for your specific needs.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <Button
                variant="outline"
                onClick={() => setCurrentStep('basic')}
                data-testid="button-back-to-basic"
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </div>
          )}

          {currentStep === 'curated' && currentVendor === 'photographer' && (
            <PhotographerQuestionnaire
              details={photographerDetails}
              onChange={setPhotographerDetails}
              onNext={handleVendorQuestionnaireNext}
              onBack={handleVendorQuestionnaireBack}
              isLast={currentVendorIndex === selectedVendors.length - 1}
              isPending={createEventMutation.isPending}
              eventDate={date}
            />
          )}

          {currentStep === 'curated' && currentVendor === 'videographer' && (
            <VideographerQuestionnaire
              details={videographerDetails}
              onChange={setVideographerDetails}
              onNext={handleVendorQuestionnaireNext}
              onBack={handleVendorQuestionnaireBack}
              isLast={currentVendorIndex === selectedVendors.length - 1}
              isPending={createEventMutation.isPending}
              eventDate={date}
            />
          )}

          {currentStep === 'curated' && currentVendor === 'florist' && (
            <FloristQuestionnaire
              details={floristDetails}
              onChange={setFloristDetails}
              onNext={handleVendorQuestionnaireNext}
              onBack={handleVendorQuestionnaireBack}
              isLast={currentVendorIndex === selectedVendors.length - 1}
              isPending={createEventMutation.isPending}
              eventDate={date}
            />
          )}

          {currentStep === 'curated' && currentVendor === 'catering' && (
            <CateringQuestionnaire
              details={cateringDetails}
              onChange={setCateringDetails}
              onNext={handleVendorQuestionnaireNext}
              onBack={handleVendorQuestionnaireBack}
              isLast={currentVendorIndex === selectedVendors.length - 1}
              isPending={createEventMutation.isPending}
            />
          )}

          {currentStep === 'curated' && currentVendor === 'dj' && (
            <DJQuestionnaire
              details={djDetails}
              onChange={setDJDetails}
              onNext={handleVendorQuestionnaireNext}
              onBack={handleVendorQuestionnaireBack}
              isLast={currentVendorIndex === selectedVendors.length - 1}
              isPending={createEventMutation.isPending}
            />
          )}

          {currentStep === 'curated' && currentVendor === 'prop-decor' && (
            <PropDecorQuestionnaire
              details={propDecorDetails}
              onChange={setPropDecorDetails}
              onNext={handleVendorQuestionnaireNext}
              onBack={handleVendorQuestionnaireBack}
              isLast={currentVendorIndex === selectedVendors.length - 1}
              isPending={createEventMutation.isPending}
            />
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

interface QuestionnaireProps<T> {
  details: Partial<T>;
  onChange: (details: Partial<T>) => void;
  onNext: () => void;
  onBack: () => void;
  isLast: boolean;
  isPending?: boolean;
  eventDate?: string;
}

function PhotographerQuestionnaire({ details, onChange, onNext, onBack, isLast, eventDate }: QuestionnaireProps<PhotographerDetails> & { eventDate?: string }) {
  const [preEventDates, setPreEventDates] = useState<string[]>(details.preEventDates || []);

  const addPreEventDate = () => {
    const newDates = [...preEventDates, ''];
    setPreEventDates(newDates);
    onChange({ ...details, preEventDates: newDates });
  };

  const updatePreEventDate = (index: number, value: string) => {
    const newDates = [...preEventDates];
    newDates[index] = value;
    setPreEventDates(newDates);
    onChange({ ...details, preEventDates: newDates });
  };

  const removePreEventDate = (index: number) => {
    const newDates = preEventDates.filter((_, i) => i !== index);
    setPreEventDates(newDates);
    onChange({ ...details, preEventDates: newDates });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Photographer Details</CardTitle>
        <CardDescription>Help us find the perfect photographer for your event</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Would you like to do photoshoots before event day?</Label>
          <RadioGroup
            value={details.preEventShoots ? "yes" : "no"}
            onValueChange={(value) => onChange({ ...details, preEventShoots: value === "yes" })}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="yes" id="photographer-pre-yes" data-testid="radio-photographer-pre-yes" />
              <Label htmlFor="photographer-pre-yes" className="cursor-pointer">Yes</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="no" id="photographer-pre-no" data-testid="radio-photographer-pre-no" />
              <Label htmlFor="photographer-pre-no" className="cursor-pointer">No</Label>
            </div>
          </RadioGroup>
        </div>

        {details.preEventShoots && (
          <div className="space-y-2">
            <Label>Pre-event dates</Label>
            {preEventDates.map((date, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => updatePreEventDate(index, e.target.value)}
                  data-testid={`input-photographer-pre-date-${index}`}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => removePreEventDate(index)}
                  data-testid={`button-remove-pre-date-${index}`}
                >
                  ×
                </Button>
              </div>
            ))}
            <Button variant="outline" onClick={addPreEventDate} data-testid="button-add-pre-date">
              Add Date
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="photographer-hours">Event-day coverage hours</Label>
          <Input
            id="photographer-hours"
            type="number"
            placeholder="e.g., 8"
            value={details.eventDayHours || ''}
            onChange={(e) => onChange({ ...details, eventDayHours: parseInt(e.target.value) || undefined })}
            data-testid="input-photographer-hours"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="photographer-start">Start time on event day</Label>
          <Input
            id="photographer-start"
            type="time"
            value={details.eventDayStartTime || ''}
            onChange={(e) => onChange({ ...details, eventDayStartTime: e.target.value })}
            data-testid="input-photographer-start"
          />
        </div>

        <div className="space-y-3">
          <Label>Budget</Label>
          <RadioGroup
            value={details.budgetSingle !== undefined ? "single" : "range"}
            onValueChange={(value) => {
              if (value === "single") {
                onChange({ ...details, budgetMin: undefined, budgetMax: undefined });
              } else {
                onChange({ ...details, budgetSingle: undefined });
              }
            }}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="single" id="photographer-budget-single" data-testid="radio-photographer-budget-single" />
                <Label htmlFor="photographer-budget-single" className="cursor-pointer">Single amount</Label>
              </div>
              {(details.budgetSingle !== undefined || (details.budgetMin === undefined && details.budgetMax === undefined)) && (
                <Input
                  type="number"
                  placeholder="e.g., 2000"
                  value={details.budgetSingle || ''}
                  onChange={(e) => onChange({ ...details, budgetSingle: parseInt(e.target.value) || undefined })}
                  data-testid="input-photographer-budget-single"
                />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="range" id="photographer-budget-range" data-testid="radio-photographer-budget-range" />
                <Label htmlFor="photographer-budget-range" className="cursor-pointer">Range</Label>
              </div>
              {(details.budgetMin !== undefined || details.budgetMax !== undefined) && (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={details.budgetMin || ''}
                    onChange={(e) => onChange({ ...details, budgetMin: parseInt(e.target.value) || undefined })}
                    data-testid="input-photographer-budget-min"
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={details.budgetMax || ''}
                    onChange={(e) => onChange({ ...details, budgetMax: parseInt(e.target.value) || undefined })}
                    data-testid="input-photographer-budget-max"
                  />
                </div>
              )}
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="photographer-notes">Any other notes for the photographer?</Label>
          <Textarea
            id="photographer-notes"
            placeholder="Share any specific requests or details..."
            value={details.notes || ''}
            onChange={(e) => onChange({ ...details, notes: e.target.value })}
            data-testid="textarea-photographer-notes"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="photographer-inspiration">Inspiration links (Pinterest, mood board, etc.)</Label>
          <Input
            id="photographer-inspiration"
            placeholder="https://..."
            value={details.inspirationLinks || ''}
            onChange={(e) => onChange({ ...details, inspirationLinks: e.target.value })}
            data-testid="input-photographer-inspiration"
          />
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} data-testid="button-back">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button className="flex-1" onClick={onNext} data-testid="button-next">
            {isLast ? 'Submit' : 'Next'}
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function VideographerQuestionnaire({ details, onChange, onNext, onBack, isLast, eventDate }: QuestionnaireProps<VideographerDetails> & { eventDate?: string }) {
  const [preEventDates, setPreEventDates] = useState<string[]>(details.preEventDates || []);

  const addPreEventDate = () => {
    const newDates = [...preEventDates, ''];
    setPreEventDates(newDates);
    onChange({ ...details, preEventDates: newDates });
  };

  const updatePreEventDate = (index: number, value: string) => {
    const newDates = [...preEventDates];
    newDates[index] = value;
    setPreEventDates(newDates);
    onChange({ ...details, preEventDates: newDates });
  };

  const removePreEventDate = (index: number) => {
    const newDates = preEventDates.filter((_, i) => i !== index);
    setPreEventDates(newDates);
    onChange({ ...details, preEventDates: newDates });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Videographer Details</CardTitle>
        <CardDescription>Let us know your video coverage needs</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Would you like to do a video shoot before event day?</Label>
          <RadioGroup
            value={details.preEventShoots ? "yes" : "no"}
            onValueChange={(value) => onChange({ ...details, preEventShoots: value === "yes" })}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="yes" id="videographer-pre-yes" data-testid="radio-videographer-pre-yes" />
              <Label htmlFor="videographer-pre-yes" className="cursor-pointer">Yes</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="no" id="videographer-pre-no" data-testid="radio-videographer-pre-no" />
              <Label htmlFor="videographer-pre-no" className="cursor-pointer">No</Label>
            </div>
          </RadioGroup>
        </div>

        {details.preEventShoots && (
          <div className="space-y-2">
            <Label>Pre-event dates</Label>
            {preEventDates.map((date, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => updatePreEventDate(index, e.target.value)}
                  data-testid={`input-videographer-pre-date-${index}`}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => removePreEventDate(index)}
                  data-testid={`button-remove-pre-date-${index}`}
                >
                  ×
                </Button>
              </div>
            ))}
            <Button variant="outline" onClick={addPreEventDate} data-testid="button-add-pre-date">
              Add Date
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="videographer-hours">Event-day coverage hours</Label>
          <Input
            id="videographer-hours"
            type="number"
            placeholder="e.g., 6"
            value={details.eventDayHours || ''}
            onChange={(e) => onChange({ ...details, eventDayHours: parseInt(e.target.value) || undefined })}
            data-testid="input-videographer-hours"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="videographer-start">Start time on event day</Label>
          <Input
            id="videographer-start"
            type="time"
            value={details.eventDayStartTime || ''}
            onChange={(e) => onChange({ ...details, eventDayStartTime: e.target.value })}
            data-testid="input-videographer-start"
          />
        </div>

        <div className="space-y-3">
          <Label>Budget</Label>
          <RadioGroup
            value={details.budgetSingle !== undefined ? "single" : "range"}
            onValueChange={(value) => {
              if (value === "single") {
                onChange({ ...details, budgetMin: undefined, budgetMax: undefined });
              } else {
                onChange({ ...details, budgetSingle: undefined });
              }
            }}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="single" id="videographer-budget-single" data-testid="radio-videographer-budget-single" />
                <Label htmlFor="videographer-budget-single" className="cursor-pointer">Single amount</Label>
              </div>
              {(details.budgetSingle !== undefined || (details.budgetMin === undefined && details.budgetMax === undefined)) && (
                <Input
                  type="number"
                  placeholder="e.g., 1500"
                  value={details.budgetSingle || ''}
                  onChange={(e) => onChange({ ...details, budgetSingle: parseInt(e.target.value) || undefined })}
                  data-testid="input-videographer-budget-single"
                />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="range" id="videographer-budget-range" data-testid="radio-videographer-budget-range" />
                <Label htmlFor="videographer-budget-range" className="cursor-pointer">Range</Label>
              </div>
              {(details.budgetMin !== undefined || details.budgetMax !== undefined) && (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={details.budgetMin || ''}
                    onChange={(e) => onChange({ ...details, budgetMin: parseInt(e.target.value) || undefined })}
                    data-testid="input-videographer-budget-min"
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={details.budgetMax || ''}
                    onChange={(e) => onChange({ ...details, budgetMax: parseInt(e.target.value) || undefined })}
                    data-testid="input-videographer-budget-max"
                  />
                </div>
              )}
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="videographer-deliverables">Deliverable notes</Label>
          <Textarea
            id="videographer-deliverables"
            placeholder="e.g., highlight reel, full ceremony, social media cuts..."
            value={details.deliverableNotes || ''}
            onChange={(e) => onChange({ ...details, deliverableNotes: e.target.value })}
            data-testid="textarea-videographer-deliverables"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="videographer-notes">Other notes</Label>
          <Textarea
            id="videographer-notes"
            placeholder="Any other specific requests..."
            value={details.otherNotes || ''}
            onChange={(e) => onChange({ ...details, otherNotes: e.target.value })}
            data-testid="textarea-videographer-notes"
          />
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} data-testid="button-back">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button className="flex-1" onClick={onNext} data-testid="button-next">
            {isLast ? 'Submit' : 'Next'}
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FloristQuestionnaire({ details, onChange, onNext, onBack, isLast }: QuestionnaireProps<FloristDetails>) {
  const arrangementOptions = [
    "Bridal bouquet",
    "Bridesmaid bouquets",
    "Boutonnieres",
    "Centerpieces",
    "Ceremony arch / install",
    "Aisle florals",
    "Cake florals",
    "Other",
  ];

  const toggleArrangement = (arrangement: string) => {
    const current = details.arrangementsNeeded || [];
    const updated = current.includes(arrangement)
      ? current.filter(a => a !== arrangement)
      : [...current, arrangement];
    onChange({ ...details, arrangementsNeeded: updated });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Florist Details</CardTitle>
        <CardDescription>Share your floral vision</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Arrangements needed</Label>
          <div className="space-y-2">
            {arrangementOptions.map((option) => (
              <div key={option} className="flex items-center gap-3 p-2 rounded-lg border hover-elevate">
                <Checkbox
                  id={`florist-${option}`}
                  checked={(details.arrangementsNeeded || []).includes(option)}
                  onCheckedChange={() => toggleArrangement(option)}
                  data-testid={`checkbox-florist-${option.toLowerCase().replace(/\s+/g, '-')}`}
                />
                <Label htmlFor={`florist-${option}`} className="cursor-pointer flex-1">
                  {option}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="florist-preferences">Flower types you want</Label>
          <Input
            id="florist-preferences"
            placeholder="e.g., roses, peonies, eucalyptus..."
            value={details.flowerPreferences || ''}
            onChange={(e) => onChange({ ...details, flowerPreferences: e.target.value })}
            data-testid="input-florist-preferences"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="florist-avoidances">Flower types you don't want</Label>
          <Input
            id="florist-avoidances"
            placeholder="e.g., lilies, carnations..."
            value={details.flowerAvoidances || ''}
            onChange={(e) => onChange({ ...details, flowerAvoidances: e.target.value })}
            data-testid="input-florist-avoidances"
          />
        </div>

        <div className="space-y-3">
          <Label>Do you need any arrangements before event day?</Label>
          <RadioGroup
            value={details.beforeEventNeeds ? "yes" : "no"}
            onValueChange={(value) => onChange({ ...details, beforeEventNeeds: value === "yes" })}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="yes" id="florist-before-yes" data-testid="radio-florist-before-yes" />
              <Label htmlFor="florist-before-yes" className="cursor-pointer">Yes</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="no" id="florist-before-no" data-testid="radio-florist-before-no" />
              <Label htmlFor="florist-before-no" className="cursor-pointer">No</Label>
            </div>
          </RadioGroup>
        </div>

        {details.beforeEventNeeds && (
          <div className="space-y-2">
            <Label htmlFor="florist-before-datetime">Date/time needed</Label>
            <Input
              id="florist-before-datetime"
              type="datetime-local"
              value={details.beforeEventDateTime || ''}
              onChange={(e) => onChange({ ...details, beforeEventDateTime: e.target.value })}
              data-testid="input-florist-before-datetime"
            />
          </div>
        )}

        {!details.beforeEventNeeds && (
          <div className="space-y-3">
            <Label>Would you like the florist to set up the arrangements?</Label>
            <RadioGroup
              value={details.floristSetup ? "yes" : "no"}
              onValueChange={(value) => onChange({ ...details, floristSetup: value === "yes" })}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="yes" id="florist-setup-yes" data-testid="radio-florist-setup-yes" />
                <Label htmlFor="florist-setup-yes" className="cursor-pointer">Yes (additional cost)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="no" id="florist-setup-no" data-testid="radio-florist-setup-no" />
                <Label htmlFor="florist-setup-no" className="cursor-pointer">No</Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {details.floristSetup && (
          <div className="space-y-2">
            <Label htmlFor="florist-setup-time">Setup time (when arrangements should be ready by)</Label>
            <Input
              id="florist-setup-time"
              type="time"
              value={details.setupTime || ''}
              onChange={(e) => onChange({ ...details, setupTime: e.target.value })}
              data-testid="input-florist-setup-time"
            />
          </div>
        )}

        <div className="space-y-3">
          <Label>Will you want touch-ups before/during the event?</Label>
          <RadioGroup
            value={details.touchUps ? "yes" : "no"}
            onValueChange={(value) => onChange({ ...details, touchUps: value === "yes" })}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="yes" id="florist-touchups-yes" data-testid="radio-florist-touchups-yes" />
              <Label htmlFor="florist-touchups-yes" className="cursor-pointer">Yes</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="no" id="florist-touchups-no" data-testid="radio-florist-touchups-no" />
              <Label htmlFor="florist-touchups-no" className="cursor-pointer">No</Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-3">
          <Label>Floral budget</Label>
          <RadioGroup
            value={details.budgetSingle !== undefined ? "single" : "range"}
            onValueChange={(value) => {
              if (value === "single") {
                onChange({ ...details, budgetMin: undefined, budgetMax: undefined });
              } else {
                onChange({ ...details, budgetSingle: undefined });
              }
            }}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="single" id="florist-budget-single" data-testid="radio-florist-budget-single" />
                <Label htmlFor="florist-budget-single" className="cursor-pointer">Single amount</Label>
              </div>
              {(details.budgetSingle !== undefined || (details.budgetMin === undefined && details.budgetMax === undefined)) && (
                <Input
                  type="number"
                  placeholder="e.g., 1200"
                  value={details.budgetSingle || ''}
                  onChange={(e) => onChange({ ...details, budgetSingle: parseInt(e.target.value) || undefined })}
                  data-testid="input-florist-budget-single"
                />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="range" id="florist-budget-range" data-testid="radio-florist-budget-range" />
                <Label htmlFor="florist-budget-range" className="cursor-pointer">Range</Label>
              </div>
              {(details.budgetMin !== undefined || details.budgetMax !== undefined) && (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={details.budgetMin || ''}
                    onChange={(e) => onChange({ ...details, budgetMin: parseInt(e.target.value) || undefined })}
                    data-testid="input-florist-budget-min"
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={details.budgetMax || ''}
                    onChange={(e) => onChange({ ...details, budgetMax: parseInt(e.target.value) || undefined })}
                    data-testid="input-florist-budget-max"
                  />
                </div>
              )}
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="florist-notes">Notes (color palette, theme, inspiration links)</Label>
          <Textarea
            id="florist-notes"
            placeholder="Share your vision..."
            value={details.notes || ''}
            onChange={(e) => onChange({ ...details, notes: e.target.value })}
            data-testid="textarea-florist-notes"
          />
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} data-testid="button-back">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button className="flex-1" onClick={onNext} data-testid="button-next">
            {isLast ? 'Submit' : 'Next'}
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CateringQuestionnaire({ details, onChange, onNext, onBack, isLast }: QuestionnaireProps<CateringDetails>) {
  const foodStyleOptions = [
    "American", "BBQ", "Mexican", "Italian", "Mediterranean", "Brunch", "Dessert bar", "Other"
  ];

  const serviceTypeOptions = [
    "Buffet", "Plated", "Cocktail / hors d'oeuvres", "Dessert only"
  ];

  const allergyOptions = [
    "Gluten-free", "Dairy-free", "Nut-free", "Vegetarian", "Vegan", "Kids' menu"
  ];

  const toggleFoodStyle = (style: string) => {
    const current = details.foodStyle || [];
    const updated = current.includes(style)
      ? current.filter(s => s !== style)
      : [...current, style];
    onChange({ ...details, foodStyle: updated });
  };

  const toggleServiceType = (type: string) => {
    const current = details.serviceType || [];
    const updated = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];
    onChange({ ...details, serviceType: updated });
  };

  const toggleAllergy = (allergy: string) => {
    const current = details.allergyList || [];
    const updated = current.includes(allergy)
      ? current.filter(a => a !== allergy)
      : [...current, allergy];
    onChange({ ...details, allergyList: updated });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Catering Details</CardTitle>
        <CardDescription>Tell us about your food preferences</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Food style / cuisine</Label>
          <div className="space-y-2">
            {foodStyleOptions.map((option) => (
              <div key={option} className="flex items-center gap-3 p-2 rounded-lg border hover-elevate">
                <Checkbox
                  id={`catering-style-${option}`}
                  checked={(details.foodStyle || []).includes(option)}
                  onCheckedChange={() => toggleFoodStyle(option)}
                  data-testid={`checkbox-catering-style-${option.toLowerCase().replace(/\s+/g, '-')}`}
                />
                <Label htmlFor={`catering-style-${option}`} className="cursor-pointer flex-1">
                  {option}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Label>Service type / courses</Label>
          <div className="space-y-2">
            {serviceTypeOptions.map((option) => (
              <div key={option} className="flex items-center gap-3 p-2 rounded-lg border hover-elevate">
                <Checkbox
                  id={`catering-service-${option}`}
                  checked={(details.serviceType || []).includes(option)}
                  onCheckedChange={() => toggleServiceType(option)}
                  data-testid={`checkbox-catering-service-${option.toLowerCase().replace(/\s+/g, '-')}`}
                />
                <Label htmlFor={`catering-service-${option}`} className="cursor-pointer flex-1">
                  {option}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Label>Allergy / dietary friendly?</Label>
          <RadioGroup
            value={details.allergyFriendly ? "yes" : "no"}
            onValueChange={(value) => onChange({ ...details, allergyFriendly: value === "yes" })}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="yes" id="catering-allergy-yes" data-testid="radio-catering-allergy-yes" />
              <Label htmlFor="catering-allergy-yes" className="cursor-pointer">Yes</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="no" id="catering-allergy-no" data-testid="radio-catering-allergy-no" />
              <Label htmlFor="catering-allergy-no" className="cursor-pointer">No</Label>
            </div>
          </RadioGroup>
        </div>

        {details.allergyFriendly && (
          <div className="space-y-2">
            <Label>Select dietary requirements</Label>
            <div className="space-y-2">
              {allergyOptions.map((option) => (
                <div key={option} className="flex items-center gap-3 p-2 rounded-lg border hover-elevate">
                  <Checkbox
                    id={`catering-allergy-${option}`}
                    checked={(details.allergyList || []).includes(option)}
                    onCheckedChange={() => toggleAllergy(option)}
                    data-testid={`checkbox-catering-allergy-${option.toLowerCase().replace(/\s+/g, '-')}`}
                  />
                  <Label htmlFor={`catering-allergy-${option}`} className="cursor-pointer flex-1">
                    {option}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <Label>Before-event catering? (e.g., rehearsal dinner, bridal shower)</Label>
          <RadioGroup
            value={details.beforeEventCatering ? "yes" : "no"}
            onValueChange={(value) => onChange({ ...details, beforeEventCatering: value === "yes" })}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="yes" id="catering-before-yes" data-testid="radio-catering-before-yes" />
              <Label htmlFor="catering-before-yes" className="cursor-pointer">Yes</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="no" id="catering-before-no" data-testid="radio-catering-before-no" />
              <Label htmlFor="catering-before-no" className="cursor-pointer">No</Label>
            </div>
          </RadioGroup>
        </div>

        {details.beforeEventCatering && (
          <div className="space-y-2">
            <Label htmlFor="catering-before-datetime">Date/time needed</Label>
            <Input
              id="catering-before-datetime"
              type="datetime-local"
              value={details.beforeEventDateTime || ''}
              onChange={(e) => onChange({ ...details, beforeEventDateTime: e.target.value })}
              data-testid="input-catering-before-datetime"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="catering-serving-time">Event-day serving time</Label>
          <Input
            id="catering-serving-time"
            type="time"
            placeholder="What time should food be ready?"
            value={details.eventDayServingTime || ''}
            onChange={(e) => onChange({ ...details, eventDayServingTime: e.target.value })}
            data-testid="input-catering-serving-time"
          />
        </div>

        <div className="space-y-3">
          <Label>Catering budget</Label>
          <RadioGroup
            value={details.budgetSingle !== undefined ? "single" : "range"}
            onValueChange={(value) => {
              if (value === "single") {
                onChange({ ...details, budgetMin: undefined, budgetMax: undefined });
              } else {
                onChange({ ...details, budgetSingle: undefined });
              }
            }}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="single" id="catering-budget-single" data-testid="radio-catering-budget-single" />
                <Label htmlFor="catering-budget-single" className="cursor-pointer">Single amount</Label>
              </div>
              {(details.budgetSingle !== undefined || (details.budgetMin === undefined && details.budgetMax === undefined)) && (
                <Input
                  type="number"
                  placeholder="e.g., 3000"
                  value={details.budgetSingle || ''}
                  onChange={(e) => onChange({ ...details, budgetSingle: parseInt(e.target.value) || undefined })}
                  data-testid="input-catering-budget-single"
                />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="range" id="catering-budget-range" data-testid="radio-catering-budget-range" />
                <Label htmlFor="catering-budget-range" className="cursor-pointer">Range</Label>
              </div>
              {(details.budgetMin !== undefined || details.budgetMax !== undefined) && (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={details.budgetMin || ''}
                    onChange={(e) => onChange({ ...details, budgetMin: parseInt(e.target.value) || undefined })}
                    data-testid="input-catering-budget-min"
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={details.budgetMax || ''}
                    onChange={(e) => onChange({ ...details, budgetMax: parseInt(e.target.value) || undefined })}
                    data-testid="input-catering-budget-max"
                  />
                </div>
              )}
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="catering-notes">Notes (staffed vs drop-off, rentals, tableware)</Label>
          <Textarea
            id="catering-notes"
            placeholder="Any other details..."
            value={details.notes || ''}
            onChange={(e) => onChange({ ...details, notes: e.target.value })}
            data-testid="textarea-catering-notes"
          />
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} data-testid="button-back">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button className="flex-1" onClick={onNext} data-testid="button-next">
            {isLast ? 'Submit' : 'Next'}
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DJQuestionnaire({ details, onChange, onNext, onBack, isLast }: QuestionnaireProps<DJDetails>) {
  const serviceOptions = [
    "Ceremony music",
    "Cocktail hour",
    "Reception / dancing",
    "MC / announcements",
  ];

  const toggleService = (service: string) => {
    const current = details.servicesNeeded || [];
    const updated = current.includes(service)
      ? current.filter(s => s !== service)
      : [...current, service];
    onChange({ ...details, servicesNeeded: updated });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>DJ Details</CardTitle>
        <CardDescription>Let's plan your event's music and entertainment</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Services needed</Label>
          <div className="space-y-2">
            {serviceOptions.map((option) => (
              <div key={option} className="flex items-center gap-3 p-2 rounded-lg border hover-elevate">
                <Checkbox
                  id={`dj-service-${option}`}
                  checked={(details.servicesNeeded || []).includes(option)}
                  onCheckedChange={() => toggleService(option)}
                  data-testid={`checkbox-dj-service-${option.toLowerCase().replace(/\s+/g, '-')}`}
                />
                <Label htmlFor={`dj-service-${option}`} className="cursor-pointer flex-1">
                  {option}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Label>Do you have a pre-made playlist?</Label>
          <RadioGroup
            value={details.hasPlaylist ? "yes" : "no"}
            onValueChange={(value) => onChange({ ...details, hasPlaylist: value === "yes" })}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="yes" id="dj-playlist-yes" data-testid="radio-dj-playlist-yes" />
              <Label htmlFor="dj-playlist-yes" className="cursor-pointer">Yes</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="no" id="dj-playlist-no" data-testid="radio-dj-playlist-no" />
              <Label htmlFor="dj-playlist-no" className="cursor-pointer">No</Label>
            </div>
          </RadioGroup>
        </div>

        {!details.hasPlaylist && (
          <div className="space-y-2">
            <Label htmlFor="dj-genres">What genre(s) or vibe are you going for?</Label>
            <Input
              id="dj-genres"
              placeholder="e.g., Top 40, Latin, Jazz, 80s/90s..."
              value={details.musicGenres || ''}
              onChange={(e) => onChange({ ...details, musicGenres: e.target.value })}
              data-testid="input-dj-genres"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="dj-do-not-play">Do-not-play list (optional)</Label>
          <Textarea
            id="dj-do-not-play"
            placeholder="Songs or artists you don't want played..."
            value={details.doNotPlayList || ''}
            onChange={(e) => onChange({ ...details, doNotPlayList: e.target.value })}
            data-testid="textarea-dj-do-not-play"
          />
        </div>

        <div className="space-y-3">
          <Label>DJ budget</Label>
          <RadioGroup
            value={details.budgetSingle !== undefined ? "single" : "range"}
            onValueChange={(value) => {
              if (value === "single") {
                onChange({ ...details, budgetMin: undefined, budgetMax: undefined });
              } else {
                onChange({ ...details, budgetSingle: undefined });
              }
            }}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="single" id="dj-budget-single" data-testid="radio-dj-budget-single" />
                <Label htmlFor="dj-budget-single" className="cursor-pointer">Single amount</Label>
              </div>
              {(details.budgetSingle !== undefined || (details.budgetMin === undefined && details.budgetMax === undefined)) && (
                <Input
                  type="number"
                  placeholder="e.g., 800"
                  value={details.budgetSingle || ''}
                  onChange={(e) => onChange({ ...details, budgetSingle: parseInt(e.target.value) || undefined })}
                  data-testid="input-dj-budget-single"
                />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="range" id="dj-budget-range" data-testid="radio-dj-budget-range" />
                <Label htmlFor="dj-budget-range" className="cursor-pointer">Range</Label>
              </div>
              {(details.budgetMin !== undefined || details.budgetMax !== undefined) && (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={details.budgetMin || ''}
                    onChange={(e) => onChange({ ...details, budgetMin: parseInt(e.target.value) || undefined })}
                    data-testid="input-dj-budget-min"
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={details.budgetMax || ''}
                    onChange={(e) => onChange({ ...details, budgetMax: parseInt(e.target.value) || undefined })}
                    data-testid="input-dj-budget-max"
                  />
                </div>
              )}
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dj-notes">Notes (sound system needed? outdoor? multiple locations?)</Label>
          <Textarea
            id="dj-notes"
            placeholder="Any other details..."
            value={details.notes || ''}
            onChange={(e) => onChange({ ...details, notes: e.target.value })}
            data-testid="textarea-dj-notes"
          />
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} data-testid="button-back">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button className="flex-1" onClick={onNext} data-testid="button-next">
            {isLast ? 'Submit' : 'Next'}
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PropDecorQuestionnaire({ details, onChange, onNext, onBack, isLast, isPending }: QuestionnaireProps<PropDecorDetails>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Prop / Décor Rental Details</CardTitle>
        <CardDescription>Tell us what you need for your event décor</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="propdecor-items">What props / décor do you need?</Label>
          <Textarea
            id="propdecor-items"
            placeholder="e.g., tables, chairs, linens, backdrops, lighting, centerpiece stands..."
            value={details.itemsNeeded || ''}
            onChange={(e) => onChange({ ...details, itemsNeeded: e.target.value })}
            data-testid="textarea-propdecor-items"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="propdecor-pickup">Pickup/delivery date</Label>
          <Input
            id="propdecor-pickup"
            type="date"
            value={details.pickupDate || ''}
            onChange={(e) => onChange({ ...details, pickupDate: e.target.value })}
            data-testid="input-propdecor-pickup"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="propdecor-return">Return date</Label>
          <Input
            id="propdecor-return"
            type="date"
            value={details.returnDate || ''}
            onChange={(e) => onChange({ ...details, returnDate: e.target.value })}
            data-testid="input-propdecor-return"
          />
        </div>

        <div className="space-y-3">
          <Label>Budget / price range</Label>
          <RadioGroup
            value={details.budgetSingle !== undefined ? "single" : "range"}
            onValueChange={(value) => {
              if (value === "single") {
                onChange({ ...details, budgetMin: undefined, budgetMax: undefined });
              } else {
                onChange({ ...details, budgetSingle: undefined });
              }
            }}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="single" id="propdecor-budget-single" data-testid="radio-propdecor-budget-single" />
                <Label htmlFor="propdecor-budget-single" className="cursor-pointer">Single amount</Label>
              </div>
              {(details.budgetSingle !== undefined || (details.budgetMin === undefined && details.budgetMax === undefined)) && (
                <Input
                  type="number"
                  placeholder="e.g., 500"
                  value={details.budgetSingle || ''}
                  onChange={(e) => onChange({ ...details, budgetSingle: parseInt(e.target.value) || undefined })}
                  data-testid="input-propdecor-budget-single"
                />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="range" id="propdecor-budget-range" data-testid="radio-propdecor-budget-range" />
                <Label htmlFor="propdecor-budget-range" className="cursor-pointer">Range</Label>
              </div>
              {(details.budgetMin !== undefined || details.budgetMax !== undefined) && (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={details.budgetMin || ''}
                    onChange={(e) => onChange({ ...details, budgetMin: parseInt(e.target.value) || undefined })}
                    data-testid="input-propdecor-budget-min"
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={details.budgetMax || ''}
                    onChange={(e) => onChange({ ...details, budgetMax: parseInt(e.target.value) || undefined })}
                    data-testid="input-propdecor-budget-max"
                  />
                </div>
              )}
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="propdecor-notes">Notes (color, theme, venue limitations)</Label>
          <Textarea
            id="propdecor-notes"
            placeholder="Share any specific requirements..."
            value={details.notes || ''}
            onChange={(e) => onChange({ ...details, notes: e.target.value })}
            data-testid="textarea-propdecor-notes"
          />
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} data-testid="button-back">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button className="flex-1" onClick={onNext} disabled={isPending} data-testid="button-next">
            {isLast ? 'Submit' : 'Next'}
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
