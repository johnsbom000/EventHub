import Navigation from "@/components/Navigation";

export default function PropDecorOnboarding() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navigation />
      <main className="flex-1">
        <div className="max-w-3xl mx-auto py-12 px-6">
          <div className="p-4 border-2 border-red-500">
            RentalOnboarding page loaded
          </div>
          <p className="mt-4 text-muted-foreground">
            Next: implement the Rental onboarding steps (Rental Types →
            Tags → Popular For → Pricing → Photos → Delivery/Setup → Confirm).
          </p>
        </div>
      </main>
    </div>
  );
}
