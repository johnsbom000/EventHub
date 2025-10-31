import type { Event, Vendor } from "@shared/schema";

export interface ScoredVendor {
  vendor: Vendor;
  scores: {
    availability: number;
    location: number;
    budget: number;
    serviceMatch: number;
    final: number;
  };
  labels: string[];
}

export interface VendorRecommendations {
  [category: string]: ScoredVendor[];
}

export function scoreVendorsForEvent(event: Event, allVendors: Vendor[]): VendorRecommendations {
  const recommendations: VendorRecommendations = {};

  // Group vendors by category
  const vendorsByCategory = allVendors.reduce((acc, vendor) => {
    if (!acc[vendor.category]) {
      acc[vendor.category] = [];
    }
    acc[vendor.category].push(vendor);
    return acc;
  }, {} as Record<string, Vendor[]>);

  // Score vendors for each needed category
  event.vendorsNeeded.forEach(category => {
    const categoryVendors = vendorsByCategory[category] || [];
    const scoredVendors = categoryVendors.map(vendor => scoreVendor(vendor, event, category));
    
    // Sort by final score descending
    scoredVendors.sort((a, b) => b.scores.final - a.scores.final);
    
    // Add labels
    addLabels(scoredVendors);
    
    recommendations[category] = scoredVendors;
  });

  return recommendations;
}

function scoreVendor(vendor: Vendor, event: Event, category: string): ScoredVendor {
  const availabilityScore = calculateAvailabilityScore(vendor, event);
  const locationScore = calculateLocationScore(vendor, event);
  const budgetScore = calculateBudgetScore(vendor, event, category);
  const serviceMatchScore = calculateServiceMatchScore(vendor, event, category);

  // Weighted final score
  const finalScore = 
    0.35 * availabilityScore +
    0.25 * budgetScore +
    0.2 * serviceMatchScore +
    0.2 * locationScore;

  return {
    vendor,
    scores: {
      availability: availabilityScore,
      location: locationScore,
      budget: budgetScore,
      serviceMatch: serviceMatchScore,
      final: finalScore,
    },
    labels: [],
  };
}

function calculateAvailabilityScore(vendor: Vendor, event: Event): number {
  const eventDate = event.date;
  const isEventDateBlocked = vendor.blockedDates?.includes(eventDate) || false;

  if (isEventDateBlocked) {
    return 0.0; // Not available on event date
  }

  // Check if pre-event dates are needed and available
  let preEventDatesNeeded: string[] = [];
  
  if (event.photographerDetails?.preEventShoots && vendor.category === 'photographer') {
    preEventDatesNeeded = event.photographerDetails.preEventDates || [];
  } else if (event.videographerDetails?.preEventShoots && vendor.category === 'videographer') {
    preEventDatesNeeded = event.videographerDetails.preEventDates || [];
  } else if (event.floristDetails?.beforeEventNeeds && vendor.category === 'florist') {
    const beforeDate = event.floristDetails.beforeEventDateTime;
    if (beforeDate) {
      preEventDatesNeeded = [beforeDate.split('T')[0]];
    }
  } else if (event.cateringDetails?.beforeEventCatering && vendor.category === 'catering') {
    const beforeDate = event.cateringDetails.beforeEventDateTime;
    if (beforeDate) {
      preEventDatesNeeded = [beforeDate.split('T')[0]];
    }
  }

  if (preEventDatesNeeded.length > 0) {
    const preEventAvailable = preEventDatesNeeded.every(date => 
      !vendor.blockedDates?.includes(date)
    );
    
    return preEventAvailable ? 1.0 : 0.5; // Available on both or just event day
  }

  return 1.0; // Available on event date and no pre-event dates needed
}

function calculateLocationScore(vendor: Vendor, event: Event): number {
  const eventLocation = event.location.toLowerCase();
  const vendorCity = vendor.city.toLowerCase();
  const vendorState = vendor.state.toLowerCase();

  // Extract city from event location (e.g., "San Francisco, CA" -> "san francisco")
  const eventCity = eventLocation.split(',')[0].trim();

  // Check if vendor serves the event location
  const serviceArea = vendor.serviceArea?.map(area => area.toLowerCase()) || [];
  const inServiceArea = serviceArea.some(area => eventLocation.includes(area));

  if (vendorCity === eventCity || inServiceArea) {
    return 1.0; // Same city or in service area
  }

  if (vendor.metro && eventLocation.includes(vendor.metro.toLowerCase())) {
    return 0.7; // Same metro area
  }

  if (vendor.travelFeeRequired) {
    return 0.4; // Nearby but travel fee required
  }

  return 0.2; // Far location
}

function calculateBudgetScore(vendor: Vendor, event: Event, category: string): number {
  let userBudgetMin = 0;
  let userBudgetMax = Infinity;

  // Get budget from vendor-specific details
  switch (category) {
    case 'photographer':
      if (event.photographerDetails) {
        if (event.photographerDetails.budgetSingle) {
          userBudgetMin = event.photographerDetails.budgetSingle;
          userBudgetMax = event.photographerDetails.budgetSingle;
        } else if (event.photographerDetails.budgetMin || event.photographerDetails.budgetMax) {
          userBudgetMin = event.photographerDetails.budgetMin || 0;
          userBudgetMax = event.photographerDetails.budgetMax || Infinity;
        }
      }
      break;
    case 'videographer':
      if (event.videographerDetails) {
        if (event.videographerDetails.budgetSingle) {
          userBudgetMin = event.videographerDetails.budgetSingle;
          userBudgetMax = event.videographerDetails.budgetSingle;
        } else if (event.videographerDetails.budgetMin || event.videographerDetails.budgetMax) {
          userBudgetMin = event.videographerDetails.budgetMin || 0;
          userBudgetMax = event.videographerDetails.budgetMax || Infinity;
        }
      }
      break;
    case 'florist':
      if (event.floristDetails) {
        if (event.floristDetails.budgetSingle) {
          userBudgetMin = event.floristDetails.budgetSingle;
          userBudgetMax = event.floristDetails.budgetSingle;
        } else if (event.floristDetails.budgetMin || event.floristDetails.budgetMax) {
          userBudgetMin = event.floristDetails.budgetMin || 0;
          userBudgetMax = event.floristDetails.budgetMax || Infinity;
        }
      }
      break;
    case 'catering':
      if (event.cateringDetails) {
        if (event.cateringDetails.budgetSingle) {
          userBudgetMin = event.cateringDetails.budgetSingle;
          userBudgetMax = event.cateringDetails.budgetSingle;
        } else if (event.cateringDetails.budgetMin || event.cateringDetails.budgetMax) {
          userBudgetMin = event.cateringDetails.budgetMin || 0;
          userBudgetMax = event.cateringDetails.budgetMax || Infinity;
        }
      }
      break;
    case 'dj':
      if (event.djDetails) {
        if (event.djDetails.budgetSingle) {
          userBudgetMin = event.djDetails.budgetSingle;
          userBudgetMax = event.djDetails.budgetSingle;
        } else if (event.djDetails.budgetMin || event.djDetails.budgetMax) {
          userBudgetMin = event.djDetails.budgetMin || 0;
          userBudgetMax = event.djDetails.budgetMax || Infinity;
        }
      }
      break;
    case 'prop-decor':
      if (event.propDecorDetails) {
        if (event.propDecorDetails.budgetSingle) {
          userBudgetMin = event.propDecorDetails.budgetSingle;
          userBudgetMax = event.propDecorDetails.budgetSingle;
        } else if (event.propDecorDetails.budgetMin || event.propDecorDetails.budgetMax) {
          userBudgetMin = event.propDecorDetails.budgetMin || 0;
          userBudgetMax = event.propDecorDetails.budgetMax || Infinity;
        }
      }
      break;
  }

  // If no budget specified, return neutral score
  if (userBudgetMax === Infinity && userBudgetMin === 0) {
    return 0.5;
  }

  const vendorPrice = vendor.basePrice;

  // Within budget range
  if (vendorPrice >= userBudgetMin && vendorPrice <= userBudgetMax) {
    return 1.0;
  }

  // Within +10-15% of max
  const tolerance = userBudgetMax * 0.15;
  if (vendorPrice <= userBudgetMax + tolerance) {
    return 0.7;
  }

  // Above but still serviceable (premium)
  if (vendorPrice <= userBudgetMax * 1.5) {
    return 0.3;
  }

  return 0.1; // Too expensive
}

function calculateServiceMatchScore(vendor: Vendor, event: Event, category: string): number {
  if (!vendor.serviceOfferings) {
    return 0.5; // No service data, neutral score
  }

  let matchScore = 0;
  let totalRequirements = 0;

  switch (category) {
    case 'photographer':
      if (event.photographerDetails && vendor.serviceOfferings.photographer) {
        totalRequirements = 2;
        if (event.photographerDetails.preEventShoots && vendor.serviceOfferings.photographer.preEventShoots) {
          matchScore += 1;
        }
        if (vendor.serviceOfferings.photographer.eventDayCoverage) {
          matchScore += 1;
        }
      }
      break;
    
    case 'videographer':
      if (event.videographerDetails && vendor.serviceOfferings.videographer) {
        totalRequirements = 2;
        if (event.videographerDetails.preEventShoots && vendor.serviceOfferings.videographer.preEventVideos) {
          matchScore += 1;
        }
        if (vendor.serviceOfferings.videographer.eventDayCoverage) {
          matchScore += 1;
        }
      }
      break;
    
    case 'florist':
      if (event.floristDetails && vendor.serviceOfferings.florist) {
        const arrangementsNeeded = event.floristDetails.arrangementsNeeded || [];
        totalRequirements = arrangementsNeeded.length + (event.floristDetails.floristSetup ? 1 : 0) + (event.floristDetails.touchUps ? 1 : 0);
        
        if (arrangementsNeeded.includes('Bridal bouquet') && vendor.serviceOfferings.florist.bridalBouquet) {
          matchScore += 1;
        }
        if (arrangementsNeeded.includes('Centerpieces') && vendor.serviceOfferings.florist.centerpieces) {
          matchScore += 1;
        }
        if (arrangementsNeeded.includes('Ceremony arch / install') && vendor.serviceOfferings.florist.archInstall) {
          matchScore += 1;
        }
        if (event.floristDetails.floristSetup && vendor.serviceOfferings.florist.setup) {
          matchScore += 1;
        }
        if (event.floristDetails.touchUps && vendor.serviceOfferings.florist.touchUps) {
          matchScore += 1;
        }
      }
      break;
    
    case 'catering':
      if (event.cateringDetails && vendor.serviceOfferings.catering) {
        const serviceTypes = event.cateringDetails.serviceType || [];
        const allergyList = event.cateringDetails.allergyList || [];
        totalRequirements = serviceTypes.length + allergyList.length;
        
        if (serviceTypes.includes('Buffet') && vendor.serviceOfferings.catering.buffet) {
          matchScore += 1;
        }
        if (serviceTypes.includes('Plated') && vendor.serviceOfferings.catering.plated) {
          matchScore += 1;
        }
        if (allergyList.includes('Gluten-free') && vendor.serviceOfferings.catering.glutenFree) {
          matchScore += 1;
        }
        if (allergyList.includes('Vegetarian') && vendor.serviceOfferings.catering.vegetarian) {
          matchScore += 1;
        }
      }
      break;
    
    case 'dj':
      if (event.djDetails && vendor.serviceOfferings.dj) {
        const servicesNeeded = event.djDetails.servicesNeeded || [];
        totalRequirements = servicesNeeded.length;
        
        if (servicesNeeded.includes('Ceremony music') && vendor.serviceOfferings.dj.ceremonyMusic) {
          matchScore += 1;
        }
        if (servicesNeeded.includes('Cocktail hour') && vendor.serviceOfferings.dj.cocktailHour) {
          matchScore += 1;
        }
        if (servicesNeeded.includes('Reception / dancing') && vendor.serviceOfferings.dj.reception) {
          matchScore += 1;
        }
        if (servicesNeeded.includes('MC / announcements') && vendor.serviceOfferings.dj.mcServices) {
          matchScore += 1;
        }
      }
      break;
  }

  if (totalRequirements === 0) {
    return 0.5; // No specific requirements
  }

  const matchRatio = matchScore / totalRequirements;

  if (matchRatio >= 0.8) {
    return 1.0; // Matches most requirements
  } else if (matchRatio >= 0.5) {
    return 0.7; // Matches some requirements
  } else if (matchRatio > 0) {
    return 0.5; // Partial match
  }

  return 0.0; // No match
}

function addLabels(scoredVendors: ScoredVendor[]): void {
  if (scoredVendors.length === 0) return;

  // Best match - highest scoring vendor
  if (scoredVendors[0].scores.final >= 0.75) {
    scoredVendors[0].labels.push('Best match');
  }

  // Budget friendly - lowest price among good scores
  const goodScoreVendors = scoredVendors.filter(sv => sv.scores.final >= 0.6);
  if (goodScoreVendors.length > 0) {
    const lowestPrice = Math.min(...goodScoreVendors.map(sv => sv.vendor.basePrice));
    const budgetFriendly = goodScoreVendors.find(sv => sv.vendor.basePrice === lowestPrice);
    if (budgetFriendly && !budgetFriendly.labels.includes('Best match')) {
      budgetFriendly.labels.push('Budget friendly');
    }
  }

  // Popular choice - highest booking count
  const maxBookings = Math.max(...scoredVendors.map(sv => sv.vendor.bookingCount));
  const popular = scoredVendors.find(sv => sv.vendor.bookingCount === maxBookings);
  if (popular && !popular.labels.includes('Best match') && !popular.labels.includes('Budget friendly')) {
    popular.labels.push('Popular choice');
  }
}
