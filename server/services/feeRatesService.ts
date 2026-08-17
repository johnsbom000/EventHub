import { VENDOR_FEE_RATE, CUSTOMER_FEE_RATE } from "../lib/constants";
import {
  getVendorEntitlements,
  isCommissionVendor,
  type VendorSubscriptionFields,
} from "./entitlementsService";

// Defined once in entitlementsService and re-exported here so the many existing
// `from "./feeRatesService"` importers keep working. Two copies of this predicate
// could drift, and drift in "does this vendor pay commission" is a revenue bug.
export { isCommissionVendor };

/**
 * Single source of truth for "what fee rates apply to this vendor".
 *
 * SECURITY / REVENUE: this is the ONLY place fee rates are derived. No module may
 * import VENDOR_FEE_RATE / CUSTOMER_FEE_RATE to compute a fee — import this
 * instead. A wrong value here silently mis-bills every booking.
 *
 * The rules, in full:
 *   - The customer fee is universal. Both pricing models, every status.
 *   - Commission (Modal B) vendors ALWAYS pay the vendor fee. This check runs
 *     BEFORE isPro is even looked at, so an anomalous subscription row on a
 *     commission account (e.g. a mistaken admin comp grant, or a stale
 *     trialing/active status left over from before the vendor switched models)
 *     can never silently waive Modal B's entire revenue model.
 *   - Otherwise (Modal A / subscription vendors), the vendor fee is waived only
 *     while the vendor holds an active Pro SUBSCRIPTION (`isPro`). Buying Pro is
 *     the only thing that waives it. Modal A vendors have full Pro FEATURES but
 *     no Pro SUBSCRIPTION, which is a distinct concept from `hasProFeatures` —
 *     see entitlementsService. Feature gates use `hasProFeatures`; fee decisions
 *     use `isPro`.
 *
 * Rates are resolved at booking time and then PERSISTED on the booking row, so
 * changing a rate later never rewrites the economics of existing bookings.
 */

export interface FeeRates {
  vendorFeeRate: number;
  customerFeeRate: number;
}

/** The subset of vendor_accounts columns fee resolution needs. */
export interface VendorFeeAccount extends VendorSubscriptionFields {
  isFoundingVendor?: boolean | null;
  isMarqueeVendor?: boolean | null;
  marqueeRateEndsAt?: Date | string | null;
  marqueeCustomerFeeEndsAt?: Date | string | null;
}

export function resolveFeeRates(account: VendorFeeAccount, now: Date = new Date()): FeeRates {
  // Commission vendors ALWAYS pay the vendor fee — checked BEFORE isPro so that an
  // anomalous subscription row (e.g. an admin comp granted by mistake, or a stale
  // trialing status) can never silently waive Modal B's entire revenue model.
  if (isCommissionVendor(account)) {
    return { vendorFeeRate: VENDOR_FEE_RATE, customerFeeRate: CUSTOMER_FEE_RATE };
  }

  const { isPro } = getVendorEntitlements(account, now);
  return {
    vendorFeeRate: isPro ? 0 : VENDOR_FEE_RATE,
    customerFeeRate: CUSTOMER_FEE_RATE,
  };
}
