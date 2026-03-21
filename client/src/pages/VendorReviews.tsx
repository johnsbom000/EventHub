import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";

import VendorShell from "@/components/VendorShell";
import { Star } from "lucide-react";

type VendorReviewItem = {
  id: string;
  rating?: number | null;
  createdAt?: string | null;
};

export default function VendorReviews() {
  const { isAuthenticated } = useAuth0();

  const { data: reviews = [] } = useQuery<VendorReviewItem[]>({
    queryKey: ["/api/vendor/reviews"],
    enabled: isAuthenticated,
  });

  return (
    <VendorShell>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
            Reviews
          </h1>
          <p className="text-muted-foreground">View and respond to customer reviews</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-0">
          <section className="px-4 py-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-[20px] leading-none tracking-tight">Average Rating</h2>
              <Star className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-4 text-2xl font-bold" data-testid="stat-avg-rating">
              0.0
            </div>
            <p className="text-xs text-muted-foreground">Out of 5.0</p>
          </section>

          <div className="hidden px-2 md:flex md:items-center md:justify-center" aria-hidden>
            <div className="h-16 w-px bg-[var(--dashboard-divider-blue)]" />
          </div>

          <section className="px-4 py-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-[20px] leading-none tracking-tight">Total Reviews</h2>
              <Star className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-4 text-2xl font-bold" data-testid="stat-total-reviews">
              0
            </div>
            <p className="text-xs text-muted-foreground">All time</p>
          </section>

          <div className="hidden px-2 md:flex md:items-center md:justify-center" aria-hidden>
            <div className="h-16 w-px bg-[var(--dashboard-divider-blue)]" />
          </div>

          <section className="px-4 py-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-[20px] leading-none tracking-tight">Response Rate</h2>
              <Star className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-4 text-2xl font-bold" data-testid="stat-response-rate">
              0%
            </div>
            <p className="text-xs text-muted-foreground">Replied to reviews</p>
          </section>
        </div>

        <div className="h-px w-full bg-[var(--dashboard-divider-blue)]" aria-hidden />

        <section className="px-4 py-2">
          <h2 className="font-heading text-[32px] leading-none tracking-tight">Customer Reviews</h2>
          <p className="mt-3 text-sm text-muted-foreground">Read and reply to customer feedback</p>

          {reviews.length === 0 ? (
            <div className="py-12 text-center">
              <Star className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">No reviews yet</h3>
              <p className="text-muted-foreground">
                Customer reviews will appear here after completed events.
              </p>
            </div>
          ) : (
            <div>{/* Reviews list will be rendered here later */}</div>
          )}
        </section>
      </div>
    </VendorShell>
  );
}
