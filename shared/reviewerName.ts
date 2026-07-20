// Formats a reviewer's name for PUBLIC display on reviews.
//
// Reviews render the customer's chosen `display_name` (which defaults to their
// "First Last" name but is user-editable in the customer profile). We show it
// as-is. The only guard: a display name should never be an email address, so if
// one slips through (e.g. a legacy fallback), we hide it rather than expose it.
//
//   "Boman Johnson"           -> "Boman Johnson"
//   "boman@griffjohnson.com"  -> "Customer"   (never expose an email)
//   "" / null                 -> "Customer"

export function formatReviewerName(raw?: string | null): string {
  const value = (raw ?? "").trim();
  if (!value) return "Customer";
  if (value.includes("@")) return "Customer";
  return value;
}
