import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function CTASection() {
  return (
    <section className="py-20 md:py-32 bg-primary text-primary-foreground">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl md:text-5xl font-bold mb-6" data-testid="text-cta-title">
          Ready to Plan Your Perfect Event?
        </h2>
        <p className="text-lg md:text-xl mb-8 text-primary-foreground/90 max-w-2xl mx-auto" data-testid="text-cta-description">
          Join thousands of happy customers who found their ideal vendors through EventVibe
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/signup">
            <Button size="lg" variant="secondary" className="min-w-[180px]" data-testid="button-cta-signup">
              Sign Up Free
            </Button>
          </Link>
          <Link href="/browse">
            <Button size="lg" variant="outline" className="min-w-[180px] border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10" data-testid="button-cta-explore">
              Explore Vendors
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
