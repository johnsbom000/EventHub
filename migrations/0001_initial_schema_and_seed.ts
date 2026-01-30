import { sql } from 'drizzle-orm';
import { pgTable, text, varchar, timestamp, integer, jsonb, boolean, pgEnum, serial, decimal, date, time, primaryKey } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
const { Pool } = pg;
import * as dotenv from 'dotenv';
import { users, vendorAccounts, vendorListings, bookings } from '../shared/schema.ts';

dotenv.config();

// New enums
export const taskStatusEnum = pgEnum('task_status', ['pending', 'in_progress', 'completed']);
export const contactSourceEnum = pgEnum('contact_source', ['marketplace', 'import', 'manual', 'referral']);

// New tables
export const vendorAvailability = pgTable('vendor_availability', {
  id: serial('id').primaryKey(),
  vendorId: varchar('vendor_id').notNull().references(() => vendorAccounts.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(), // 0-6 (Sunday-Saturday)
  startTime: time('start_time'),
  endTime: time('end_time'),
  isAvailable: boolean('is_available').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Dummy data generation functions
const generateDummyUsers = async (db: any) => {
  // Sample first and last names for realistic data
  const firstNames = ['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Garcia', 'Rodriguez', 'Wilson'];
  const vendorTypes = [
    { category: 'Photography', services: ['Wedding', 'Portrait', 'Event', 'Commercial'] },
    { category: 'Videography', services: ['Wedding Films', 'Corporate Videos', 'Music Videos'] },
    { category: 'Catering', services: ['Wedding Receptions', 'Corporate Events', 'Cocktail Parties'] },
    { category: 'Venue', services: ['Wedding Venues', 'Event Spaces', 'Conference Centers'] },
    { category: 'Florist', services: ['Wedding Flowers', 'Event Decor', 'Bouquets'] },
    { category: 'DJ', services: ['Wedding DJ', 'Corporate Events', 'Private Parties'] },
    { category: 'Band', services: ['Wedding Bands', 'Jazz Ensembles', 'Cover Bands'] },
    { category: 'Makeup Artist', services: ['Bridal Makeup', 'Editorial', 'Special Effects'] },
    { category: 'Event Planner', services: ['Full-Service Planning', 'Day-Of Coordination', 'Destination Weddings'] },
    { category: 'Rentals', services: ['Furniture', 'Tents', 'Lighting', 'Audiovisual'] }
  ];

  // Generate realistic locations with coordinates
  const locations = [
    { city: 'New York', state: 'NY', lat: 40.7128, lng: -74.0060 },
    { city: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437 },
    { city: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298 },
    { city: 'Houston', state: 'TX', lat: 29.7604, lng: -95.3698 },
    { city: 'Phoenix', state: 'AZ', lat: 33.4484, lng: -112.0740 },
    { city: 'Philadelphia', state: 'PA', lat: 39.9526, lng: -75.1652 },
    { city: 'San Antonio', state: 'TX', lat: 29.4241, lng: -98.4936 },
    { city: 'San Diego', state: 'CA', lat: 32.7157, lng: -117.1611 },
    { city: 'Dallas', state: 'TX', lat: 32.7767, lng: -96.7970 },
    { city: 'San Jose', state: 'CA', lat: 37.3382, lng: -121.8863 }
  ];
  // Insert sample customers
  const customerUsers = Array.from({ length: 10 }, (_, i) => ({
    name: `Customer ${i + 1}`,
    email: `customer${i + 1}@example.com`,
    password: 'hashed_password_placeholder', // In a real app, this would be properly hashed
    role: 'customer',
  }));

  const insertedCustomers = await db
    .insert(users)
    .values(customerUsers)
    .returning();

  // Insert customer profiles
  // Insert sample vendors
  const vendorUsers = [
    { name: 'Elite Photography', email: 'elite@example.com' },
    { name: 'Dream Weddings DJ', email: 'dreamdj@example.com' },
    { name: 'Gourmet Catering', email: 'gourmet@example.com' },
    { name: 'Luxury Venues', email: 'luxury@example.com' },
    { name: 'Floral Designs', email: 'floral@example.com' },
  ];

  const insertedVendors = await db
    .insert(users)
    .values(vendorUsers.map(v => ({
      ...v,
      password: 'hashed_password_placeholder',
      role: 'vendor',
    })))
    .returning();

  // Insert vendor accounts
  const vendorAccountsData = insertedVendors.map((user: any, i: number) => ({
    userId: user.id,
    email: user.email,
    businessName: user.name,
    password: 'hashed_password_placeholder',
    profileComplete: true,
  }));

  const insertedVendorAccounts = await db
    .insert(vendorAccounts)
    .values(vendorAccountsData)
    .returning();

  // Insert vendor profiles
  const vendorProfilesData = insertedVendorAccounts.map((account: any, i: number) => ({
    accountId: account.id,
    serviceType: ['Photography', 'DJ', 'Catering', 'Venue', 'Florist'][i],
    experience: (i + 1) * 2,
    qualifications: [
      ['Professional Photographer', '5+ years experience'],
      ['Certified DJ', 'Wedding Specialist'],
      ['5-star rated catering'],
      ['Luxury venue specialist'],
      ['Master florist'],
    ][i],
    address: `${i + 100} Main St`,
    city: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'][i],
    serviceDescription: `Professional ${['photography', 'DJ', 'catering', 'venue', 'floral'][i]} services for your special day!`,
  }));

  const insertedVendorProfiles = await db
    .insert(vendorAccounts)
    .values(vendorProfilesData)
    .returning();

  // Generate comprehensive listings for each vendor category
  const vendorListings = [
    // Photography
    {
      title: 'Premium Wedding Photography',
      category: 'Photography',
      description: 'Capture your special day with our professional wedding photography service. We specialize in natural, candid moments that tell your unique love story. Our team has over 10 years of experience in wedding photography across the country.',
      featuredImage: 'https://images.unsplash.com/photo-1530103867503-3b9c9a16667e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1470&q=80',
      gallery: [
        'https://images.unsplash.com/photo-1531058245201-ff756bb908f0?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1470&q=80',
        'https://images.unsplash.com/photo-1509316785289-025f5b846b35?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1476&q=80'
      ],
      packages: [
        {
          name: 'Basic Coverage',
          description: '6 hours of coverage',
          price: 1999.99,
          features: [
            '6 hours of continuous coverage',
            'Online gallery with high-resolution images',
            'Print release',
            'Digital downloads',
            '1 photographer'
          ]
        },
        {
          name: 'Premium Package',
          description: 'Full day coverage',
          price: 3499.99,
          features: [
            '12 hours of coverage',
            'Online gallery with high-resolution images',
            'Print release',
            'Digital downloads',
            '2 photographers',
            'Engagement session included',
            'Custom photo album'
          ]
        }
      ],
      addons: [
        { name: 'Additional Hour', price: 250 },
        { name: 'Second Shooter', price: 500 },
        { name: 'Custom Photo Book', price: 299 },
        { name: 'Drone Coverage', price: 400 }
      ]
    },
    // Videography
    {
      title: 'Cinematic Wedding Films',
      category: 'Videography',
      description: 'Professional wedding videography that captures the emotion and beauty of your special day in stunning 4K resolution. Our cinematic approach ensures your wedding film will be a timeless treasure.',
      featuredImage: 'https://images.unsplash.com/photo-1511285560929-80b456fe0590?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1469&q=80',
      gallery: [
        'https://images.unsplash.com/photo-1506773094636-f5c8854a5fd5?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1470&q=80',
        'https://images.unsplash.com/photo-1515488042361-ee50e1e07836?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1374&q=80'
      ],
      packages: [
        {
          name: 'Highlight Film',
          description: '3-5 minute cinematic highlight film',
          price: 2499.99,
          features: [
            '6 hours of coverage',
            '3-5 minute highlight film',
            'Full ceremony edit',
            'Digital download',
            '1 videographer'
          ]
        },
        {
          name: 'Feature Film',
          description: 'Complete wedding film package',
          price: 4499.99,
          features: [
            '10 hours of coverage',
            '15-20 minute feature film',
            '3-5 minute highlight film',
            'Full ceremony & speeches',
            '2 videographers',
            'Drone footage',
            'USB keepsake box'
          ]
        }
      ]
    },
    // Catering
    {
      title: 'Gourmet Wedding Catering',
      category: 'Catering',
      description: 'Exquisite catering service specializing in farm-to-table cuisine with locally sourced ingredients. Our expert chefs create custom menus to match your vision and dietary needs.',
      featuredImage: 'https://images.unsplash.com/photo-1555244162-803834f70033?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1470&q=80',
      packages: [
        {
          name: 'Buffet Service',
          description: 'Self-serve buffet with 3 entree options',
          price: 45.99,
          pricePer: 'guest',
          features: [
            '3 entree options',
            '2 side dishes',
            'Salad and bread',
            'Non-alcoholic beverages',
            'Setup and cleanup',
            'Staffing included'
          ]
        },
        {
          name: 'Plated Dinner',
          description: 'Elegant plated dinner service',
          price: 89.99,
          pricePer: 'guest',
          features: [
            '3-course plated dinner',
            'Choice of 3 entrees',
            'Chef-attended carving station',
            'Premium dessert selection',
            'Professional wait staff',
            'China and flatware rental included'
          ]
        }
      ]
    }
    // Additional vendor categories would continue here...
  ];

  // Generate listings for each vendor, ensuring each category is represented
  const listings = [];
  const usedVendorIds = new Set();
  
  // First, ensure each category has at least one listing
  const categories = ['Photography', 'Videography', 'Catering', 'Venue', 'Florist', 'DJ', 'Band', 'Makeup Artist', 'Event Planner', 'Rentals'];
  const categoryVendors: { [key: string]: any[] } = {};
  
  // Group vendors by category
  insertedVendorAccounts.forEach((vendor: { id: string }, index: number) => {
    const category = categories[index % categories.length];
    if (!categoryVendors[category]) {
      categoryVendors[category] = [];
    }
    categoryVendors[category].push(vendor);
  });
  
  // Create listings ensuring each category is covered
  Object.entries(categoryVendors).forEach(([category, vendors]) => {
    const categoryListing = vendorListings.find(l => l.category === category) || {
      title: `${category} Services`,
      category,
      description: `Professional ${category.toLowerCase()} services for your event.`,
      featuredImage: `https://picsum.photos/seed/${category.toLowerCase()}/800/600`,
      packages: [
        {
          name: 'Standard Package',
          description: `Basic ${category.toLowerCase()} package`,
          price: Math.floor(Math.random() * 1000) + 100,
          features: ['Basic service', 'Standard equipment', 'Professional staff']
        }
      ]
    };
    
    // Assign to a vendor in this category who hasn't been used yet
    const availableVendors = vendors.filter(v => !usedVendorIds.has(v.id));
    const vendor = availableVendors[0] || vendors[0];
    usedVendorIds.add(vendor.id);
    
    listings.push({
      vendorId: vendor.id,
      ...categoryListing,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  });
  
  // Add some additional listings for variety
  const additionalListings = Math.min(5, insertedVendorAccounts.length - Object.keys(categoryVendors).length);
  for (let i = 0; i < additionalListings; i++) {
    const vendor = insertedVendorAccounts.find((v: { id: string }) => !usedVendorIds.has(v.id));
    if (!vendor) break;
    
    const category = categories[Math.floor(Math.random() * categories.length)];
    const categoryListing = vendorListings.find(l => l.category === category) || {
      title: `${category} Services`,
      category,
      description: `Professional ${category.toLowerCase()} services for your event.`,
      featuredImage: `https://picsum.photos/seed/${category.toLowerCase()}-${i}/800/600`,
      packages: [
        {
          name: 'Standard Package',
          description: `Basic ${category.toLowerCase()} package`,
          price: Math.floor(Math.random() * 1000) + 100,
          features: ['Basic service', 'Standard equipment', 'Professional staff']
        }
      ]
    };
    
    listings.push({
      vendorId: vendor.id,
      ...categoryListing,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    usedVendorIds.add(vendor.id);
  }

  const insertedListings = await db
    .insert(vendorListings)
    .values(listings)
    .returning();

  // Insert packages and addons for each listing
  for (const listing of insertedListings) {
    const packages = [
      {
        listingId: listing.id,
        name: 'Basic Package',
        description: 'Essential services for your event',
        price: '999.99',
        isMostPopular: false,
        features: ['4 hours coverage', 'Digital gallery', 'Online proofing'],
      },
      {
        listingId: listing.id,
        name: 'Premium Package',
        description: 'Complete coverage with premium features',
        price: '1999.99',
        isMostPopular: true,
        features: ['8 hours coverage', 'Digital gallery', 'Printed photos', 'Engagement session'],
      },
    ];

    const addons = [
      {
        listingId: listing.id,
        name: 'Additional Hour',
        description: 'Extra hour of service',
        price: '250.00',
        isRequired: false,
      },
      {
        listingId: listing.id,
        name: 'Second Shooter',
        description: 'Additional photographer/DJ/chef',
        price: '500.00',
        isRequired: false,
      },
    ];

  }

  // Insert availability for vendors
  const availabilityData = [];
  for (const vendor of insertedVendorAccounts) {
    // Available Monday-Friday, 9am-5pm
    for (let day = 1; day <= 5; day++) {
      availabilityData.push({
        vendorId: vendor.id,
        dayOfWeek: day,
        startTime: '09:00:00',
        endTime: '17:00:00',
        isAvailable: true,
      });
    }
  }
  await db.insert(vendorAvailability).values(availabilityData);

  // Insert sample bookings
  const bookingData = [
    {
      customerId: insertedCustomers[0].id,
      vendorId: insertedVendorAccounts[0].id,
      listingId: insertedListings[0].id,
      status: 'confirmed',
      startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000), // 4 hours later
      guestCount: 100,
      totalPrice: 1999.99,
      customerNotes: 'Looking forward to our event!',
    },
    // Add more sample bookings as needed
  ];

  const insertedBookings = await db
    .insert(bookings)
    .values(bookingData)
    .returning();};

// Run the migration
export async function up() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle(pool);

  try {
    // Create new tables
    await db.execute(sql`
      -- Vendor availability
      
      CREATE TABLE IF NOT EXISTS vendor_availability (
        id SERIAL PRIMARY KEY,
        vendor_id VARCHAR NOT NULL REFERENCES vendor_accounts(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL,
        start_time TIME,
        end_time TIME,
        is_available BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );    // Generate and insert dummy data (only in non-production or when explicitly enabled)
    const shouldSeed =
      process.env.SEED_DATA === 'true' ||
      (process.env.NODE_ENV && process.env.NODE_ENV !== 'production');

    if (shouldSeed) {
      await generateDummyUsers(db);
      console.log('Dummy data seeded via generateDummyUsers');
    } else {
      console.log('Skipping dummy data seed in this environment');
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

export async function down() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await pool.query(`
      DROP TABLE IF EXISTS vendor_availability;
      DROP TYPE IF EXISTS task_status;
      DROP TYPE IF EXISTS contact_source;
    `);
    console.log('Rollback completed successfully');
  } catch (error) {
    console.error('Rollback failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}