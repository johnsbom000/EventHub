import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { VendorSidebar } from "@/components/vendor-sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, MapPin, DollarSign, Eye } from "lucide-react";
import { CreateListingWizard } from "@/features/vendor/create-listing/CreateListingWizard";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Mock listing data - TODO: Replace with API data
const mockListings = {
  active: [
    {
      id: "1",
      title: "Premium Wedding Photography",
      category: "Photography",
      location: "New York, NY",
      price: "$2,500",
      image: "https://via.placeholder.com/300x200?text=Wedding+Photography",
      views: 248,
      bookings: 12,
    },
    {
      id: "2",
      title: "Luxury Event Catering",
      category: "Catering",
      location: "Brooklyn, NY",
      price: "$3,500",
      image: "https://via.placeholder.com/300x200?text=Event+Catering",
      views: 532,
      bookings: 28,
    },
    {
      id: "3",
      title: "Professional DJ Services",
      category: "Entertainment",
      location: "Manhattan, NY",
      price: "$1,200",
      image: "https://via.placeholder.com/300x200?text=DJ+Services",
      views: 412,
      bookings: 19,
    },
  ],
  inactive: [
    {
      id: "4",
      title: "Seasonal Floral Arrangements",
      category: "Florist",
      location: "Queens, NY",
      price: "$800",
      image: "https://via.placeholder.com/300x200?text=Floral+Arrangements",
      views: 156,
      bookings: 5,
    },
  ],
  draft: [
    {
      id: "5",
      title: "Event Videography Package",
      category: "Videography",
      location: "New York, NY",
      price: "$2,000",
      image: "https://via.placeholder.com/300x200?text=Videography",
      views: 0,
      bookings: 0,
    },
    {
      id: "6",
      title: "Corporate Event Planning",
      category: "Planning",
      location: "Manhattan, NY",
      price: "$5,000",
      image: "https://via.placeholder.com/300x200?text=Event+Planning",
      views: 0,
      bookings: 0,
    },
  ],
};

export default function VendorListings() {
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [editingListing, setEditingListing] = useState<any | null>(null);
  const { toast } = useToast();
  
  // Fetch draft listings from API
  const { data: draftListings = [], isLoading: loadingDrafts } = useQuery({
    queryKey: ["/api/vendor/listings", "draft"],
    queryFn: async () => {
      const response = await fetch("/api/vendor/listings?status=draft", {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("vendorToken")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch draft listings");
      return response.json();
    },
  });

  // Fetch active listings from API
  const { data: activeListings = [], isLoading: loadingActive } = useQuery({
    queryKey: ["/api/vendor/listings", "active"],
    queryFn: async () => {
      const response = await fetch("/api/vendor/listings?status=active", {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("vendorToken")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch active listings");
      return response.json();
    },
  });

  // Fetch inactive listings from API
  const { data: inactiveListings = [], isLoading: loadingInactive } = useQuery({
    queryKey: ["/api/vendor/listings", "inactive"],
    queryFn: async () => {
      const response = await fetch("/api/vendor/listings?status=inactive", {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("vendorToken")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch inactive listings");
      return response.json();
    },
  });

  // Mutation for publishing a listing
  const publishMutation = useMutation({
    mutationFn: async (listingId: string) => {
      const response = await fetch(`/api/vendor/listings/${listingId}/publish`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("vendorToken")}`,
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) throw new Error("Failed to publish listing");
      return response.json();
    },
    onSuccess: () => {
      // Invalidate all listing queries to refetch updated data
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings"] });
      toast({
        title: "Listing published!",
        description: "Your listing is now live and visible to customers.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to publish",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  const convertToFormData = (listing: any) => {
    // Convert mock listing to ListingFormData format
    // In production, this would come from API with full structure
    // Generate enough photos to meet minimum requirement
    const photos = Array(15).fill(listing.image);
    
    return {
      serviceType: listing.category.toLowerCase(),
      city: listing.location.split(',')[0].trim(),
      experience: 5,
      qualifications: ["Professional certification", "Years of experience"],
      onlineProfiles: [
        { platform: "Instagram", url: "https://instagram.com/vendor" }
      ],
      address: listing.location,
      travelMode: "travel-to-guests" as const,
      serviceRadius: 25,
      serviceAddress: listing.location,
      photos,
      serviceDescription: `${listing.title} - Professional ${listing.category} services with extensive experience and dedication to quality.`,
      offerings: [
        {
          id: "1",
          title: listing.title,
          description: `${listing.title} package with all amenities`,
          price: parseInt(listing.price.replace(/[$,]/g, '')) || 1000,
          duration: 4,
        }
      ],
      businessHours: [
        { day: "Monday", enabled: true, timeRanges: [{ start: "09:00", end: "17:00" }] },
        { day: "Tuesday", enabled: true, timeRanges: [{ start: "09:00", end: "17:00" }] },
        { day: "Wednesday", enabled: true, timeRanges: [{ start: "09:00", end: "17:00" }] },
        { day: "Thursday", enabled: true, timeRanges: [{ start: "09:00", end: "17:00" }] },
        { day: "Friday", enabled: true, timeRanges: [{ start: "09:00", end: "17:00" }] },
        { day: "Saturday", enabled: true, timeRanges: [{ start: "10:00", end: "16:00" }] },
        { day: "Sunday", enabled: false, timeRanges: [] },
      ],
      discounts: [
        { type: "limited-time" as const, percentage: 10, enabled: true },
        { type: "early-bird" as const, percentage: 15, enabled: true },
        { type: "large-group" as const, percentage: 20, enabled: true },
      ],
      agreeToTerms: true,
      agreeToGuidelines: true,
    };
  };

  const handleEditListing = (listingId: string) => {
    // Find the listing from all segments
    const allListings = [...mockListings.active, ...mockListings.inactive, ...mockListings.draft];
    const listing = allListings.find(l => l.id === listingId);
    
    if (listing) {
      console.log("Editing listing:", listing);
      const formData = convertToFormData(listing);
      setEditingListing(formData);
      setShowCreateWizard(true);
    }
  };

  const handleCloseWizard = () => {
    setShowCreateWizard(false);
    setEditingListing(null);
  };

  const handlePublishListing = (listingId: string) => {
    publishMutation.mutate(listingId);
  };

  const ListingCard = ({ listing, status }: { listing: any; status: string }) => {
    const isDraft = status === "draft";
    
    return (
      <Card 
        className={`w-[320px] shrink-0 overflow-hidden ${!isDraft ? 'hover-elevate cursor-pointer' : ''} group`}
        onClick={!isDraft ? () => handleEditListing(listing.id) : undefined}
        data-testid={`card-listing-${listing.id}`}
      >
        <div className="aspect-[4/3] overflow-hidden relative">
          <img
            src={listing.image || "https://via.placeholder.com/300x200?text=No+Image"}
            alt={listing.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {!isDraft && (
            <div className="absolute top-3 right-3">
              <Badge variant="secondary" className="bg-white/90 hover:bg-white" style={{ borderColor: '#9EDBC0' }}>
                <Edit className="w-3 h-3 mr-1" style={{ color: '#9EDBC0' }} />
                <span style={{ color: '#9EDBC0' }}>Edit</span>
              </Badge>
            </div>
          )}
          {isDraft && (
            <div className="absolute top-3 left-3">
              <Badge style={{ backgroundColor: '#9EDBC0', color: 'white', borderColor: '#8CCBB0' }}>
                Draft
              </Badge>
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h3 className="font-semibold text-base mb-1 line-clamp-1" data-testid={`text-title-${listing.id}`}>
                {listing.title || listing.listingData?.serviceType || "Untitled Listing"}
              </h3>
              <p className="text-sm text-muted-foreground">{listing.category || listing.listingData?.serviceType}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <MapPin className="w-4 h-4" />
            <span>{listing.location || listing.listingData?.city || "Location not set"}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="font-semibold" style={{ color: '#9EDBC0' }}>
                {listing.price || (listing.listingData?.offerings?.[0]?.price ? `$${listing.listingData.offerings[0].price}` : "Price not set")}
              </span>
            </div>
            {!isDraft && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  <span>{listing.views || 0}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium">{listing.bookings || 0}</span>
                  <span>bookings</span>
                </div>
              </div>
            )}
          </div>
          
          {isDraft && (
            <div className="flex gap-2 mt-4 pt-4 border-t">
              <Button
                variant="outline"
                className="flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditListing(listing.id);
                }}
                data-testid={`button-edit-${listing.id}`}
              >
                Edit
              </Button>
              <Button
                className="flex-1"
                style={{ backgroundColor: '#9EDBC0', color: 'white' }}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePublishListing(listing.id);
                }}
                data-testid={`button-publish-${listing.id}`}
              >
                Publish
              </Button>
            </div>
          )}
        </div>
      </Card>
    );
  };

  const ListingSection = ({ title, listings, status, emptyMessage }: any) => (
    <div className="mb-10" data-testid={`section-${status}`}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-foreground">
          {title}
        </h2>
        <span className="text-sm text-muted-foreground">
          {listings.length} {listings.length === 1 ? 'listing' : 'listings'}
        </span>
      </div>
      {listings.length > 0 ? (
        <div className="overflow-x-auto -mx-6 px-6">
          <div className="flex gap-4 pb-4">
            {listings.map((listing: any) => (
              <ListingCard key={listing.id} listing={listing} status={status} />
            ))}
          </div>
        </div>
      ) : (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">{emptyMessage}</p>
        </Card>
      )}
    </div>
  );

  return (
    <>
      <SidebarProvider style={sidebarStyle as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <VendorSidebar />
          <div className="flex flex-col flex-1">
            <header className="flex items-center justify-between p-4 border-b">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <Button 
                onClick={() => setShowCreateWizard(true)}
                data-testid="button-create-listing"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Listing
              </Button>
            </header>
            <main className="flex-1 overflow-auto">
              <div className="max-w-7xl mx-auto px-6 py-8">
                <div className="mb-8">
                  <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
                    Listings Management
                  </h1>
                  <p className="text-muted-foreground">
                    Create and manage your service listings, packages, and pricing
                  </p>
                </div>

                <ListingSection
                  title="Active Listings"
                  listings={activeListings}
                  status="active"
                  emptyMessage="No active listings. Publish a draft to make it active."
                  isLoading={loadingActive}
                />

                <ListingSection
                  title="Inactive Listings"
                  listings={inactiveListings}
                  status="inactive"
                  emptyMessage="No inactive listings."
                  isLoading={loadingInactive}
                />

                <ListingSection
                  title="Draft Listings"
                  listings={draftListings}
                  status="draft"
                  emptyMessage="No draft listings. Start creating a new listing to save it as a draft."
                  isLoading={loadingDrafts}
                />
              </div>
            </main>
          </div>
        </div>
      </SidebarProvider>

      {showCreateWizard && (
        <CreateListingWizard 
          onClose={handleCloseWizard}
          editMode={!!editingListing}
          initialData={editingListing || undefined}
        />
      )}
    </>
  );
}
