import { apiRequest } from "@/lib/queryClient";

type VendorStripeSetupLinkResponse = {
  url?: string | null;
};

export async function redirectVendorToStripeSetup() {
  const res = await apiRequest("GET", "/api/vendor/connect/setup-link");
  const data = (await res.json()) as VendorStripeSetupLinkResponse;
  const url = typeof data?.url === "string" ? data.url.trim() : "";

  if (!url) {
    throw new Error("Stripe setup link was not returned");
  }

  window.location.assign(url);
}
