import { type InsertVendor } from "@shared/schema";

export const sampleVendors: InsertVendor[] = [
  // Photographer vendors
  {
    name: "Sarah Chen Photography",
    category: "photographer",
    city: "New York",
    state: "NY",
    metro: "New York Metro Area",
    latitude: "40.7128",
    longitude: "-74.0060",
    basePrice: 1800,
    priceRangeMax: 3500,
    rating: "5.0",
    reviewCount: 156,
    bookingCount: 234,
    verified: true,
    blockedDates: ["2025-12-25", "2026-01-01"],
    serviceOfferings: {
      photographer: {
        preEventShoots: true,
        eventDayCoverage: true,
        engagementShoots: true,
        bridalPortraits: true,
      }
    },
    serviceArea: ["New York", "Brooklyn", "Queens", "Manhattan"],
    imageUrl: "/placeholder-photographer.jpg",
    description: "Award-winning wedding photographer specializing in natural light and candid moments",
    travelFeeRequired: false,
    packages: [
      {
        name: "Essential Package",
        description: "Perfect for intimate celebrations",
        price: 1800,
        inclusions: ["6 hours coverage", "300+ edited photos", "Online gallery", "Print release"],
        popular: false,
      },
      {
        name: "Premium Package",
        description: "Most popular choice for full-day events",
        price: 2600,
        inclusions: ["10 hours coverage", "500+ edited photos", "Engagement session", "Online gallery", "Print release", "Second shooter"],
        popular: true,
      },
      {
        name: "Luxury Package",
        description: "Complete coverage for your special day",
        price: 3500,
        inclusions: ["Unlimited hours", "800+ edited photos", "Engagement session", "Bridal portraits", "Online gallery", "Print release", "Two shooters", "Album design"],
        popular: false,
      },
    ],
    addOns: [
      { name: "Extra Hour", description: "Additional hour of coverage", price: 250 },
      { name: "Second Shooter", description: "Additional photographer", price: 500 },
      { name: "Photo Album", description: "12x12 premium album", price: 800 },
      { name: "Rehearsal Dinner Coverage", description: "2-hour coverage", price: 400 },
    ],
    reviews: [
      {
        reviewerName: "Emily Rodriguez",
        rating: 5,
        date: "2024-09-15",
        comment: "Sarah captured our wedding beautifully! The photos are absolutely stunning and she made us feel so comfortable throughout the day.",
        eventType: "Wedding",
      },
      {
        reviewerName: "Michael Chen",
        rating: 5,
        date: "2024-07-22",
        comment: "Professional, creative, and a joy to work with. The engagement photos turned out amazing!",
        eventType: "Engagement",
      },
      {
        reviewerName: "Jessica Park",
        rating: 5,
        date: "2024-05-10",
        comment: "Worth every penny! Sarah's attention to detail and artistic eye made our special day even more memorable.",
        eventType: "Wedding",
      },
    ],
    aboutSection: "Hi, I'm Sarah! I've been capturing love stories for over 8 years, and every wedding still gives me butterflies. My approach is all about natural, candid moments that tell your unique story. When I'm not behind the camera, you'll find me exploring NYC's hidden gems with my rescue dog, Luna, or perfecting my latte art. I believe your wedding photos should feel like you—authentic, joyful, and full of life!",
  },
  {
    name: "Artisan Lens Studio",
    category: "photographer",
    city: "New York",
    state: "NY",
    metro: "New York Metro Area",
    latitude: "40.7580",
    longitude: "-73.9855",
    basePrice: 2200,
    priceRangeMax: 4200,
    rating: "4.9",
    reviewCount: 98,
    bookingCount: 187,
    verified: true,
    blockedDates: ["2025-11-28", "2025-12-31"],
    serviceOfferings: {
      photographer: {
        preEventShoots: true,
        eventDayCoverage: true,
        engagementShoots: true,
        bridalPortraits: true,
      }
    },
    serviceArea: ["New York", "Brooklyn", "Long Island"],
    imageUrl: "/placeholder-photographer.jpg",
    description: "Fine art wedding photography with a timeless, editorial style",
    travelFeeRequired: false,
    packages: [
      {
        name: "Classic Collection",
        description: "Elegant coverage for your celebration",
        price: 2200,
        inclusions: ["8 hours coverage", "400+ edited photos", "Engagement session", "Online gallery"],
      },
      {
        name: "Signature Collection",
        description: "Our most requested package",
        price: 3200,
        inclusions: ["12 hours coverage", "600+ edited photos", "Engagement + bridal session", "Online gallery", "Second shooter", "Custom USB drive"],
        popular: true,
      },
      {
        name: "Complete Collection",
        description: "Ultimate wedding day coverage",
        price: 4200,
        inclusions: ["Full day coverage", "1000+ edited photos", "Engagement + bridal session", "Online gallery", "Two shooters", "Premium album", "Parent albums"],
      },
    ],
    addOns: [
      { name: "Boudoir Session", description: "Private photo session", price: 600 },
      { name: "Drone Photography", description: "Aerial shots of venue", price: 350 },
      { name: "Same-Day Edit Slideshow", description: "Reception preview", price: 500 },
      { name: "Rush Editing", description: "Photos in 2 weeks", price: 400 },
    ],
    reviews: [
      {
        reviewerName: "Amanda Sullivan",
        rating: 5,
        date: "2024-08-30",
        comment: "The team at Artisan Lens exceeded all expectations. Their artistic vision brought our wedding to life!",
        eventType: "Wedding",
      },
      {
        reviewerName: "David Kim",
        rating: 5,
        date: "2024-06-18",
        comment: "Simply the best! Professional, talented, and so easy to work with.",
        eventType: "Wedding",
      },
    ],
    aboutSection: "Artisan Lens Studio was founded by award-winning photographer Marcus Williams, who brings 12 years of editorial experience to wedding photography. Our team specializes in creating timeless images with an artistic, editorial flair. We believe in documenting real emotions and creating heirloom-quality photos that you'll treasure for generations.",
  },
];

export default sampleVendors;
