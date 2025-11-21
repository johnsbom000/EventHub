# Temporary Fake Vendor Data - Quick Guide

## ✅ What Was Created

I've added **56 fake vendor listing cards** to your Event Hub platform:
- **8 vendors** in each of **7 categories**
- Categories: Venues, Photography, Videography, DJs, Florists, Prop Rentals, Catering
- Each vendor has realistic data: name, location, pricing, ratings, reviews

## 📍 Where the Fake Data Appears

The 56 fake vendor cards are visible on **TWO pages**:

1. **Home Page** (`/`)
   - Displays vendors grouped by category in horizontal scrolling rows
   - "Venues near New York", "Photography near New York", etc.

2. **Filtered Listing Page** (`/browse`)
   - Shows vendors in a grid with filtering and sorting
   - **NO hero bar** at the top (as requested)
   - Full category filtering, search, and sort functionality

## 🎛️ Toggle Fake Data On/Off

To switch between fake data and real database data:

1. Open `client/src/mock/mockVendors.ts`
2. Find line 13: `export const USE_FAKE_VENDORS = true;`
3. Change to `false` to use real database data
4. Change to `true` to use fake data

```typescript
export const USE_FAKE_VENDORS = true;  // ← Change this line
```

## 🗑️ How to Remove All Fake Data (Easy Cleanup)

When you're ready to remove all fake data, follow these **3 simple steps**:

### Step 1: Delete the Mock Data File
```bash
rm client/src/mock/mockVendors.ts
```

### Step 2: Clean up BrowseVendors.tsx

Open `client/src/pages/BrowseVendors.tsx` and:

1. **Remove the import** (lines 13-15):
```typescript
// ============ TEMPORARY FAKE DATA - REMOVE THESE IMPORTS ============
import { USE_FAKE_VENDORS, MOCK_VENDORS, getMockCategories, getCategoryImage } from "@/mock/mockVendors";
// ====================================================================
```

2. **Replace the data fetching section** (lines 51-68) with:
```typescript
// Fetch vendors from API
const { data: vendors = [], isLoading } = useQuery<Vendor[]>({
  queryKey: ["/api/vendors"],
});

// Fetch vendor categories from API
const { data: categories = [] } = useQuery<string[]>({
  queryKey: ["/api/vendors/meta/categories"],
});
```

3. **Remove the conditional image logic** (lines 140-142), replace with:
```typescript
image: vendor.imageUrl || categoryImages[vendor.category] || categoryImages["Venues"],
```

### Step 3: Clean up SmartRecommendations.tsx

Open `client/src/components/SmartRecommendations.tsx` and:

1. **Remove the import** (lines 5-7):
```typescript
// ============ TEMPORARY FAKE DATA - REMOVE THESE IMPORTS ============
import { USE_FAKE_VENDORS, MOCK_VENDORS, getCategoryImage } from "@/mock/mockVendors";
// ====================================================================
```

2. **Remove or uncomment** the old mock data section (lines 15-92):
   - Either delete it entirely, or
   - Change `OLD_mockVendorsByCategory` back to `mockVendorsByCategory`

3. **Remove the conditional grouping logic** (lines 113-129):
```typescript
// DELETE THIS ENTIRE SECTION:
const groupedVendors = USE_FAKE_VENDORS 
  ? MOCK_VENDORS.reduce((acc, vendor) => {
      // ... reduce logic
    }, {} as Record<string, any[]>)
  : OLD_mockVendorsByCategory;
```

4. **Replace with** (or use the original hardcoded data):
```typescript
const mockVendorsByCategory = OLD_mockVendorsByCategory; // Or your original data structure
```

5. **Remove formatCategoryName** function if not needed (lines 131-146)

6. **Update the render** to use `mockVendorsByCategory` directly:
```typescript
{Object.entries(mockVendorsByCategory).map(([category, vendors]) => (
  <div key={category} className="mb-12" data-testid={`category-${category.toLowerCase()}`}>
    <h2 className="text-2xl font-semibold mb-6 text-foreground">
      {category} near {userLocation}
    </h2>
    {/* ... rest of the render code */}
```

## ✨ Summary

- **File to delete**: `client/src/mock/mockVendors.ts`
- **Files to clean up**: 
  - `client/src/pages/BrowseVendors.tsx`
  - `client/src/components/SmartRecommendations.tsx`
- **Look for markers**: All temporary code is marked with comments like `// ============ TEMPORARY ...`

All fake data is clearly marked with comment blocks for easy identification and removal!
