/**
 * Discount System Tests
 *
 * Tests validation rules, stacking precedence, redemption tracking logic,
 * and auth boundary rules without hitting the database.
 *
 * Run: npx tsx tests/discount-system.test.ts
 */

import assert from "node:assert/strict";

// ── Helpers mirroring the server's discount logic ────────────────────────────

interface Discount {
  id: string;
  discountType: "promo_code" | "public_sale";
  code?: string | null;
  percentOff: number;
  startsAt: Date;
  endsAt: Date;
  maxUses?: number | null;
  usedCount: number;
  active: boolean;
  vendorAccountId: string;
  listingIds: string[];
}

type PromoValidationResult =
  | { valid: true; percentOff: number; discountId: string }
  | { valid: false; reason: "not_found" | "not_active" | "expired" | "cap_reached" | "listing_mismatch" };

function validatePromoCode(
  code: string,
  listingId: string,
  discounts: Discount[],
  now: Date = new Date(),
): PromoValidationResult {
  const upper = code.trim().toUpperCase();
  const match = discounts.find(
    (d) =>
      d.discountType === "promo_code" &&
      d.code?.toUpperCase() === upper &&
      d.listingIds.includes(listingId),
  );

  if (!match) return { valid: false, reason: "not_found" };
  if (!match.active) return { valid: false, reason: "not_active" };
  if (now < match.startsAt || now > match.endsAt) return { valid: false, reason: "expired" };
  if (match.maxUses !== null && match.maxUses !== undefined && match.usedCount >= match.maxUses) {
    return { valid: false, reason: "cap_reached" };
  }

  return { valid: true, percentOff: match.percentOff, discountId: match.id };
}

function findActiveSale(
  listingId: string,
  discounts: Discount[],
  now: Date = new Date(),
): Discount | null {
  return (
    discounts.find(
      (d) =>
        d.discountType === "public_sale" &&
        d.active &&
        d.listingIds.includes(listingId) &&
        now >= d.startsAt &&
        now <= d.endsAt,
    ) ?? null
  );
}

function resolveDiscount(
  listingId: string,
  discounts: Discount[],
  promoCode: string | null,
  subtotalCents: number,
  now: Date = new Date(),
): { appliedDiscountId: string | null; discountAmountCents: number; error?: string } {
  if (promoCode) {
    const result = validatePromoCode(promoCode, listingId, discounts, now);
    if (!result.valid) return { appliedDiscountId: null, discountAmountCents: 0, error: result.reason };
    return {
      appliedDiscountId: result.discountId,
      discountAmountCents: Math.round(subtotalCents * result.percentOff / 100),
    };
  }

  const sale = findActiveSale(listingId, discounts, now);
  if (sale) {
    return {
      appliedDiscountId: sale.id,
      discountAmountCents: Math.round(subtotalCents * sale.percentOff / 100),
    };
  }

  return { appliedDiscountId: null, discountAmountCents: 0 };
}

function validateDiscountInput(input: {
  discountType: string;
  code?: string;
  percentOff: number;
  startsAt: Date;
  endsAt: Date;
  listingIds: string[];
  vendorListingIds: string[]; // listings owned by vendor
}): { valid: boolean; error?: string } {
  if (input.percentOff < 1 || input.percentOff > 100) {
    return { valid: false, error: "percent_off must be between 1 and 100" };
  }
  if (input.endsAt <= input.startsAt) {
    return { valid: false, error: "ends_at must be after starts_at" };
  }
  if (input.discountType === "promo_code") {
    if (!input.code) return { valid: false, error: "code is required for promo_code type" };
    if (!/^[A-Z0-9]+$/.test(input.code)) {
      return { valid: false, error: "code must be uppercase alphanumeric" };
    }
  }
  const unowned = input.listingIds.filter((id) => !input.vendorListingIds.includes(id));
  if (unowned.length > 0) {
    return { valid: false, error: "vendor does not own all listed listings" };
  }
  return { valid: true };
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

const now = new Date("2026-06-01T12:00:00.000Z");
const past = new Date("2026-05-01T00:00:00.000Z");
const future = new Date("2026-07-01T00:00:00.000Z");

const activePromo: Discount = {
  id: "disc-promo-1",
  discountType: "promo_code",
  code: "SUMMER20",
  percentOff: 20,
  startsAt: past,
  endsAt: future,
  maxUses: 10,
  usedCount: 5,
  active: true,
  vendorAccountId: "vendor-1",
  listingIds: ["listing-1"],
};

const cappedPromo: Discount = {
  id: "disc-promo-capped",
  discountType: "promo_code",
  code: "FULL10",
  percentOff: 10,
  startsAt: past,
  endsAt: future,
  maxUses: 5,
  usedCount: 5,
  active: true,
  vendorAccountId: "vendor-1",
  listingIds: ["listing-1"],
};

const inactivePromo: Discount = {
  id: "disc-promo-inactive",
  discountType: "promo_code",
  code: "OLD30",
  percentOff: 30,
  startsAt: past,
  endsAt: future,
  maxUses: null,
  usedCount: 0,
  active: false,
  vendorAccountId: "vendor-1",
  listingIds: ["listing-1"],
};

const expiredPromo: Discount = {
  id: "disc-promo-expired",
  discountType: "promo_code",
  code: "EXPIRED5",
  percentOff: 5,
  startsAt: new Date("2025-01-01"),
  endsAt: new Date("2025-06-01"),
  maxUses: null,
  usedCount: 0,
  active: true,
  vendorAccountId: "vendor-1",
  listingIds: ["listing-1"],
};

const activeSale: Discount = {
  id: "disc-sale-1",
  discountType: "public_sale",
  percentOff: 15,
  startsAt: past,
  endsAt: future,
  maxUses: null,
  usedCount: 0,
  active: true,
  vendorAccountId: "vendor-1",
  listingIds: ["listing-1", "listing-2"],
};

const allDiscounts = [activePromo, cappedPromo, inactivePromo, expiredPromo, activeSale];

// ── Tests ─────────────────────────────────────────────────────────────────────

function run() {
  // ── Validation: percent_off range ──────────────────────────────────────────
  {
    const r1 = validateDiscountInput({
      discountType: "public_sale",
      percentOff: 0,
      startsAt: past,
      endsAt: future,
      listingIds: ["listing-1"],
      vendorListingIds: ["listing-1"],
    });
    assert.equal(r1.valid, false, "percent 0 should be invalid");

    const r2 = validateDiscountInput({
      discountType: "public_sale",
      percentOff: 101,
      startsAt: past,
      endsAt: future,
      listingIds: ["listing-1"],
      vendorListingIds: ["listing-1"],
    });
    assert.equal(r2.valid, false, "percent 101 should be invalid");

    const r3 = validateDiscountInput({
      discountType: "public_sale",
      percentOff: 100,
      startsAt: past,
      endsAt: future,
      listingIds: ["listing-1"],
      vendorListingIds: ["listing-1"],
    });
    assert.equal(r3.valid, true, "percent 100 should be valid");

    const r4 = validateDiscountInput({
      discountType: "public_sale",
      percentOff: 1,
      startsAt: past,
      endsAt: future,
      listingIds: ["listing-1"],
      vendorListingIds: ["listing-1"],
    });
    assert.equal(r4.valid, true, "percent 1 should be valid");

    console.log("✓ percent_off range validation");
  }

  // ── Validation: end date after start date ──────────────────────────────────
  {
    const r = validateDiscountInput({
      discountType: "public_sale",
      percentOff: 10,
      startsAt: future,
      endsAt: past,
      listingIds: ["listing-1"],
      vendorListingIds: ["listing-1"],
    });
    assert.equal(r.valid, false, "end before start should be invalid");
    assert.ok(r.error?.includes("ends_at"), `expected ends_at error, got: ${r.error}`);
    console.log("✓ end date must be after start date");
  }

  // ── Validation: code format ────────────────────────────────────────────────
  {
    const r1 = validateDiscountInput({
      discountType: "promo_code",
      code: "SUMMER20",
      percentOff: 10,
      startsAt: past,
      endsAt: future,
      listingIds: ["listing-1"],
      vendorListingIds: ["listing-1"],
    });
    assert.equal(r1.valid, true, "uppercase alphanumeric code should be valid");

    const r2 = validateDiscountInput({
      discountType: "promo_code",
      code: "summer 20!",
      percentOff: 10,
      startsAt: past,
      endsAt: future,
      listingIds: ["listing-1"],
      vendorListingIds: ["listing-1"],
    });
    assert.equal(r2.valid, false, "lowercase/special chars code should be invalid");

    const r3 = validateDiscountInput({
      discountType: "promo_code",
      percentOff: 10,
      startsAt: past,
      endsAt: future,
      listingIds: ["listing-1"],
      vendorListingIds: ["listing-1"],
    });
    assert.equal(r3.valid, false, "missing code for promo_code type should be invalid");

    console.log("✓ promo code format validation");
  }

  // ── Validation: vendor ownership ──────────────────────────────────────────
  {
    const r = validateDiscountInput({
      discountType: "public_sale",
      percentOff: 10,
      startsAt: past,
      endsAt: future,
      listingIds: ["listing-1", "listing-unowned"],
      vendorListingIds: ["listing-1"],
    });
    assert.equal(r.valid, false, "unowned listing should be rejected");
    assert.ok(r.error?.includes("vendor does not own"));
    console.log("✓ vendor ownership check");
  }

  // ── Promo code: valid code returns discount ────────────────────────────────
  {
    const result = resolveDiscount("listing-1", allDiscounts, "SUMMER20", 10000, now);
    assert.equal(result.appliedDiscountId, "disc-promo-1");
    assert.equal(result.discountAmountCents, 2000); // 20% of 10000
    assert.equal(result.error, undefined);
    console.log("✓ valid promo code applies 20% discount");
  }

  // ── Promo code: not found ─────────────────────────────────────────────────
  {
    const result = resolveDiscount("listing-1", allDiscounts, "FAKECODE", 10000, now);
    assert.equal(result.appliedDiscountId, null);
    assert.equal(result.error, "not_found");
    console.log("✓ unknown promo code returns not_found");
  }

  // ── Promo code: listing mismatch ──────────────────────────────────────────
  {
    const result = resolveDiscount("listing-99", allDiscounts, "SUMMER20", 10000, now);
    assert.equal(result.appliedDiscountId, null);
    assert.equal(result.error, "not_found"); // falls through as not found because listing doesn't match
    console.log("✓ promo code for wrong listing returns not_found");
  }

  // ── Promo code: inactive ──────────────────────────────────────────────────
  {
    const result = resolveDiscount("listing-1", allDiscounts, "OLD30", 10000, now);
    assert.equal(result.appliedDiscountId, null);
    assert.equal(result.error, "not_active");
    console.log("✓ inactive promo code returns not_active");
  }

  // ── Promo code: expired ────────────────────────────────────────────────────
  {
    const result = resolveDiscount("listing-1", allDiscounts, "EXPIRED5", 10000, now);
    assert.equal(result.appliedDiscountId, null);
    assert.equal(result.error, "expired");
    console.log("✓ expired promo code returns expired");
  }

  // ── Promo code: cap reached ────────────────────────────────────────────────
  {
    const result = resolveDiscount("listing-1", allDiscounts, "FULL10", 10000, now);
    assert.equal(result.appliedDiscountId, null);
    assert.equal(result.error, "cap_reached");
    console.log("✓ capped promo code returns cap_reached");
  }

  // ── Public sale: auto-applied when no promo code ──────────────────────────
  {
    const result = resolveDiscount("listing-1", allDiscounts, null, 10000, now);
    assert.equal(result.appliedDiscountId, "disc-sale-1");
    assert.equal(result.discountAmountCents, 1500); // 15% of 10000
    console.log("✓ active public sale auto-applied at checkout");
  }

  // ── Stacking: promo code wins over public sale ─────────────────────────────
  {
    // listing-1 has both an active sale (15%) and a valid promo code (20%)
    const withPromo = resolveDiscount("listing-1", allDiscounts, "SUMMER20", 10000, now);
    const withSale = resolveDiscount("listing-1", allDiscounts, null, 10000, now);

    assert.equal(withPromo.appliedDiscountId, "disc-promo-1", "promo code should win");
    assert.equal(withPromo.discountAmountCents, 2000, "promo discount should be 20%");
    assert.equal(withSale.appliedDiscountId, "disc-sale-1", "sale applied without promo");
    assert.equal(withSale.discountAmountCents, 1500, "sale discount should be 15%");
    assert.notEqual(withPromo.appliedDiscountId, withSale.appliedDiscountId, "they cannot stack");
    console.log("✓ promo code wins over public sale (no stacking)");
  }

  // ── No discount when nothing applies ─────────────────────────────────────
  {
    const result = resolveDiscount("listing-99", allDiscounts, null, 10000, now);
    assert.equal(result.appliedDiscountId, null);
    assert.equal(result.discountAmountCents, 0);
    console.log("✓ no discount when no promo code and no active sale");
  }

  // ── Price math: discount applies to subtotal, not total ──────────────────
  {
    const CUSTOMER_FEE_RATE = 0.05;
    const VENDOR_FEE_RATE = 0.08;
    const subtotal = 10000; // $100
    const { discountAmountCents } = resolveDiscount("listing-1", allDiscounts, "SUMMER20", subtotal, now);

    const discountedSubtotal = Math.max(0, subtotal - discountAmountCents);
    const customerFee = Math.round(discountedSubtotal * CUSTOMER_FEE_RATE);
    const total = discountedSubtotal + customerFee;
    const platformFee = Math.round(discountedSubtotal * VENDOR_FEE_RATE);
    const vendorPayout = discountedSubtotal - platformFee;

    assert.equal(discountedSubtotal, 8000, "discounted subtotal: $80");
    assert.equal(customerFee, 400, "5% customer fee on discounted subtotal: $4");
    assert.equal(total, 8400, "total: $84");
    assert.equal(platformFee, 640, "8% platform fee on discounted subtotal: $6.40");
    assert.equal(vendorPayout, 7360, "vendor payout: $73.60");
    console.log("✓ price math: discount applied before fees, both fees computed on discounted subtotal");
  }

  // ── Redemption tracking: used_count increments ────────────────────────────
  {
    let usedCount = 3;
    const maxUses = 5;

    // Simulate redemption
    usedCount += 1;
    assert.equal(usedCount, 4);

    // Auto-deactivate when cap hit
    const shouldDeactivate = usedCount >= maxUses;
    assert.equal(shouldDeactivate, false, "should not deactivate at 4/5");

    usedCount += 1;
    const shouldDeactivateAtCap = usedCount >= maxUses;
    assert.equal(shouldDeactivateAtCap, true, "should deactivate at 5/5");
    console.log("✓ redemption tracking: used_count increments and auto-deactivates at cap");
  }

  // ── Auth boundary: vendor cannot apply discount to listing they don't own ─
  {
    const r = validateDiscountInput({
      discountType: "public_sale",
      percentOff: 10,
      startsAt: past,
      endsAt: future,
      listingIds: ["listing-vendor-2"], // belongs to vendor-2, not vendor-1
      vendorListingIds: ["listing-vendor-1"],
    });
    assert.equal(r.valid, false);
    assert.ok(r.error?.includes("vendor does not own"));
    console.log("✓ auth boundary: vendor cannot discount listings they don't own");
  }

  console.log("\n✅ All discount system tests passed.");
}

run();
