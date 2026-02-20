import React, { useState } from 'react';
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Star, MapPin, Calendar, Clock, Users, CheckCircle, XCircle, ChevronLeft } from 'lucide-react';

type Package = {
  id: string;
  name: string;
  description: string;
  price: number;
  pricePer?: string;
  features: string[];
};

type Addon = {
  id: string;
  name: string;
  price: number;
};

type ListingDetailProps = {
  listing: {
    id: string;
    title: string;
    category: string;
    description: string;
    featuredImage: string;
    gallery: string[];
    packages: Package[];
    addons?: Addon[];
    vendor: {
      id: string;
      businessName: string;
      rating: number;
      reviewCount: number;
    };
    location: string;
    rating: number;
    reviewCount: number;
  };
};

const ListingDetailView: React.FC<ListingDetailProps> = ({ listing }) => {
  const [, setLocation] = useLocation();
  const [selectedImage, setSelectedImage] = useState(listing.featuredImage);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('overview');
  const [bookingDate, setBookingDate] = useState('');
  const [guestCount, setGuestCount] = useState(1);

  const toggleAddon = (addonId: string) => {
    const newAddons = new Set(selectedAddons);
    if (newAddons.has(addonId)) {
      newAddons.delete(addonId);
    } else {
      newAddons.add(addonId);
    }
    setSelectedAddons(newAddons);
  };

  const calculateTotal = () => {
    let total = selectedPackage?.price || 0;
    if (selectedPackage?.pricePer === 'guest') {
      total *= guestCount;
    }
    
    listing.addons?.forEach(addon => {
      if (selectedAddons.has(addon.id)) {
        total += addon.price;
      }
    });
    
    return total.toFixed(2);
  };
  const handleBookNow = () => {
    // In a real app, this would redirect to a booking confirmation page
    // or open a booking modal with the selected options
    console.log('Booking with:', {
      package: selectedPackage,
      addons: Array.from(selectedAddons),
      date: bookingDate,
      guestCount,
      total: calculateTotal()
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button 
        onClick={() => setLocation("/browse")}
        className="flex items-center text-gray-600 hover:text-gray-900 mb-6"
      >
        <ChevronLeft className="w-5 h-5 mr-1" />
        Back to results
      </button>
      
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Image Gallery */}
        <div className="relative h-96 bg-gray-100">
          <img
            src={selectedImage}
            alt={listing.title}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
          />

          <div className="absolute bottom-4 left-4 right-4 flex space-x-2 overflow-x-auto">
            {[listing.featuredImage, ...(listing.gallery || [])].map((img, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedImage(img)}
                className={`w-16 h-16 rounded-md overflow-hidden border-2 ${
                  selectedImage === img ? "border-blue-500" : "border-transparent"
                }`}
              >
                <img
                  src={img}
                  alt={`${listing.title} - ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-8">
            {/* Main Content */}
            <div className="flex-1">
              <div className="flex items-center mb-2">
                <h1 className="text-3xl font-bold text-gray-900">{listing.title}</h1>
                <span className="ml-4 px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
                  {listing.category}
                </span>
              </div>
              
              <div className="flex items-center text-gray-600 mb-4">
                <div className="flex items-center mr-4">
                  <MapPin className="w-4 h-4 mr-1" />
                  <span>{listing.location}</span>
                </div>
                <div className="flex items-center">
                  <Star className="w-4 h-4 text-yellow-400 fill-current mr-1" />
                  <span>{listing.rating.toFixed(1)}</span>
                  <span className="text-gray-400 ml-1">({listing.reviewCount} reviews)</span>
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-gray-200 mb-6">
                <nav className="-mb-px flex space-x-8">
                  <button
                    onClick={() => setActiveTab('overview')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'overview' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                  >
                    Overview
                  </button>
                  <button
                    onClick={() => setActiveTab('packages')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'packages' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                  >
                    Packages & Pricing
                  </button>
                  <button
                    onClick={() => setActiveTab('reviews')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'reviews' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                  >
                    Reviews
                  </button>
                </nav>
              </div>

              {/* Tab Content */}
              <div className="prose max-w-none">
                {activeTab === 'overview' && (
                  <div>
                    <h2 className="text-xl font-semibold mb-4">About This {listing.category} Service</h2>
                    <p className="text-gray-700 mb-6">{listing.description}</p>
                    
                    <h3 className="text-lg font-medium mb-3">What's Included</h3>
                    <ul className="space-y-2 mb-6">
                      {listing.packages[0]?.features?.slice(0, 5).map((feature, i) => (
                        <li key={i} className="flex items-start">
                          <CheckCircle className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <h3 className="text-lg font-medium mb-3">About {listing.vendor.businessName}</h3>
                    <div className="flex items-center mb-4">
                      <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold text-xl">
                        {listing.vendor.businessName.charAt(0)}
                      </div>
                      <div className="ml-3">
                        <div className="font-medium">{listing.vendor.businessName}</div>
                        <div className="flex items-center text-sm text-gray-500">
                          <Star className="w-4 h-4 text-yellow-400 fill-current mr-1" />
                          {listing.vendor.rating.toFixed(1)} ({listing.vendor.reviewCount} reviews)
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'packages' && (
                  <div>
                    <h2 className="text-xl font-semibold mb-6">Packages & Pricing</h2>
                    <div className="space-y-6">
                      {listing.packages.map((pkg) => (
                        <div 
                          key={pkg.id}
                          onClick={() => setSelectedPackage(pkg)}
                          className={`border rounded-lg p-6 cursor-pointer transition-all ${selectedPackage?.id === pkg.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-blue-300'}`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="text-lg font-medium">{pkg.name}</h3>
                              <p className="text-gray-600 mt-1">{pkg.description}</p>
                              <div className="mt-3">
                                <span className="text-2xl font-bold">
                                  ${pkg.price.toFixed(2)}
                                  {pkg.pricePer && <span className="text-sm font-normal text-gray-500"> / {pkg.pricePer}</span>}
                                </span>
                              </div>
                            </div>
                            <div className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                              {selectedPackage?.id === pkg.id ? 'Selected' : 'Select'}
                            </div>
                          </div>
                          
                          {pkg.features && pkg.features.length > 0 && (
                            <ul className="mt-4 space-y-2">
                              {pkg.features.map((feature, i) => (
                                <li key={i} className="flex items-start">
                                  <CheckCircle className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                                  <span className="text-sm">{feature}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>

                    {listing.addons && listing.addons.length > 0 && (
                      <div className="mt-8">
                        <h3 className="text-lg font-medium mb-4">Available Add-ons</h3>
                        <div className="space-y-3">
                          {listing.addons.map((addon) => (
                            <div 
                              key={addon.id}
                              onClick={() => toggleAddon(addon.id)}
                              className={`flex items-center justify-between p-4 border rounded-lg cursor-pointer ${selectedAddons.has(addon.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                            >
                              <div className="flex items-center">
                                <div className={`w-5 h-5 rounded border mr-3 flex items-center justify-center ${selectedAddons.has(addon.id) ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                                  {selectedAddons.has(addon.id) && (
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </div>
                                <span className="font-medium">{addon.name}</span>
                              </div>
                              <span className="font-medium">+${addon.price.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'reviews' && (
                  <div>
                    <h2 className="text-xl font-semibold mb-6">Customer Reviews</h2>
                    <div className="flex items-center mb-6">
                      <div className="text-4xl font-bold mr-4">{listing.rating.toFixed(1)}</div>
                      <div>
                        <div className="flex items-center">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star 
                              key={star} 
                              className={`w-5 h-5 ${star <= Math.round(listing.rating) ? 'text-yellow-400 fill-current' : 'text-gray-300'}`} 
                            />
                          ))}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          Based on {listing.reviewCount} reviews
                        </div>
                      </div>
                    </div>
                    
                    {/* Sample reviews */}
                    <div className="space-y-6">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="border-b border-gray-100 pb-6 last:border-0 last:pb-0">
                          <div className="flex items-center mb-2">
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold">
                              {['A', 'B', 'C'][i - 1]}
                            </div>
                            <div className="ml-3">
                              <div className="font-medium">
                                {['Alex Johnson', 'Taylor Smith', 'Jordan Lee'][i - 1]}
                              </div>
                              <div className="flex items-center text-sm text-gray-500">
                                <Star className="w-4 h-4 text-yellow-400 fill-current mr-1" />
                                {5 - i}.0
                                <span className="mx-1">•</span>
                                {i} month{i !== 1 ? 's' : ''} ago
                              </div>
                            </div>
                          </div>
                          <p className="mt-2 text-gray-700">
                            {[
                              'Absolutely amazing service! The team went above and beyond to make our day special.',
                              'Great experience overall. Professional and easy to work with.',
                              'Good service, but had a small issue with timing. They resolved it professionally.'
                            ][i - 1]}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Booking Sidebar */}
            <div className="w-full md:w-96">
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-6 sticky top-6">
                <h3 className="text-lg font-semibold mb-4">Book This Service</h3>
                
                {selectedPackage ? (
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">{selectedPackage.name}</span>
                      <span className="font-medium">
                        ${selectedPackage.price.toFixed(2)}
                        {selectedPackage.pricePer && ` per ${selectedPackage.pricePer}`}
                      </span>
                    </div>
                    
                    {selectedPackage.pricePer === 'guest' && (
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Number of Guests</label>
                        <select
                          value={guestCount}
                          onChange={(e) => setGuestCount(parseInt(e.target.value))}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                            <option key={num} value={num}>
                              {num} {num === 1 ? 'guest' : 'guests'}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Event Date</label>
                      <input
                        type="date"
                        value={bookingDate}
                        onChange={(e) => setBookingDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    
                    {listing.addons && listing.addons.length > 0 && selectedAddons.size > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Selected Add-ons</h4>
                        <div className="space-y-2">
                          {listing.addons
                            .filter(addon => selectedAddons.has(addon.id))
                            .map(addon => (
                              <div key={addon.id} className="flex justify-between text-sm">
                                <span className="text-gray-600">{addon.name}</span>
                                <span className="font-medium">+${addon.price.toFixed(2)}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="mt-6 pt-4 border-t border-gray-200">
                      <div className="flex justify-between font-medium text-lg">
                        <span>Total</span>
                        <span>${calculateTotal()}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Taxes and fees may apply</p>
                    </div>
                    
                    <button
                      onClick={handleBookNow}
                      disabled={!bookingDate}
                      className={`mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-md transition-colors ${!bookingDate ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      Book Now
                    </button>
                    
                    <p className="mt-3 text-xs text-center text-gray-500">
                      You won't be charged yet
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-gray-400 mb-2">
                      <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                      </svg>
                    </div>
                    <p className="text-gray-600">Select a package to continue</p>
                  </div>
                )}
                
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">What's included</h4>
                  <ul className="space-y-2">
                    {selectedPackage?.features.slice(0, 3).map((feature, i) => (
                      <li key={i} className="flex items-start">
                        <CheckCircle className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                    {selectedPackage?.features?.length && selectedPackage.features.length > 3 && (
                      <li className="text-sm text-blue-600">+ {selectedPackage.features.length - 3} more</li>
                    )}
                  </ul>
                </div>
                
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Cancellation Policy</h4>
                  <p className="text-sm text-gray-600">
                    Full refund available if cancelled at least 7 days before the event. 50% refund if cancelled within 7 days.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

type RouteParams = { id: string };

const ListingDetailPage: React.FC = () => {
  const [, params] = useRoute<RouteParams>("/listing/:id");
  const listingId = params?.id;

  const { data: listing, isLoading, error } = useQuery<any>({
    queryKey: ["/api/listings/public", listingId],
    enabled: !!listingId,
    queryFn: async () => {
      const res = await fetch(`/api/listings/public/${listingId}`, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        throw new Error(`Failed to load listing ${listingId}`);
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(
          `Expected JSON but got ${contentType}. First 120 chars: ${text.slice(0, 120)}`
        );
      }

      const raw = await res.json();
      const ld = (raw?.listingData ?? {}) as any;

      // photos
      const photosFromObjects =
        Array.isArray(raw?.photos)
          ? raw.photos.map((p: any) => p?.url).filter(Boolean)
          : [];

      const photosFromListingData =
        Array.isArray(ld?.photos?.urls)
          ? ld.photos.urls
          : Array.isArray(ld?.photos)
          ? ld.photos
          : [];

      const allPhotos = [...photosFromObjects, ...photosFromListingData].filter(
        (p) => typeof p === "string"
      );

      const featuredImage =
        photosFromObjects[0] || photosFromListingData[0] || "";

      return {
        id: raw?.id,
        title: raw?.title ?? ld?.listingTitle ?? "Listing",
        category: raw?.serviceType ?? ld?.category ?? "Service",
        description: ld?.listingDescription ?? "",
        featuredImage,
        gallery: allPhotos.slice(1),
        packages: Array.isArray(ld?.packages) ? ld.packages : [],
        addons: Array.isArray(ld?.addons) ? ld.addons : [],
        vendor: {
          id: raw?.vendorId ?? "",
          businessName: raw?.vendorName ?? "Vendor",
          rating: Number(raw?.vendor?.rating ?? 0),
          reviewCount: Number(raw?.vendor?.reviewCount ?? 0),
        },
        location: raw?.city ?? ld?.location ?? "",
        rating: Number(raw?.rating ?? 0),
        reviewCount: Number(raw?.reviewCount ?? 0),
      };
    },
  });

  if (!listingId) return <div className="p-6">Missing listing id</div>;
  if (isLoading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6">Error loading listing</div>;
  if (!listing) return <div className="p-6">Listing not found</div>;

  return <ListingDetailView listing={listing} />;
};

export default ListingDetailPage;

