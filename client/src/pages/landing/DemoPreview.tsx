import ListingWizardDemo from "@/pages/landing/ListingWizardDemo";
import BookingFlowDemo from "@/pages/landing/BookingFlowDemo";

/* DEV-ONLY preview harness for the two landing slideshow demos.
   Reachable at /demo/slideshows (route is gated on import.meta.env.DEV). */
export default function DemoPreview() {
  return (
    <div className="min-h-screen bg-[#f8fafb] px-6 py-14">
      <div className="mx-auto max-w-[1100px]">
        <h1 className="mb-2 font-heading text-[2rem] font-semibold text-[#2a3a42]">Landing slideshow demos</h1>
        <p className="mb-10 font-sans text-[0.95rem] text-[#4a6a7d]">
          Left: vendor creating a listing. Right: what a customer sees when they book you. Press and hold to pause;
          click the dots or arrows to step through.
        </p>
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <p className="mb-3 font-sans text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-[#9aacb4]">
              Vendor · Create a listing
            </p>
            <div className="rounded-[28px] bg-[#f5f0e8] p-6">
              <ListingWizardDemo />
            </div>
          </div>
          <div>
            <p className="mb-3 font-sans text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-[#9aacb4]">
              Customer · Book a vendor
            </p>
            <div className="rounded-[28px] bg-[#f5f0e8] p-6">
              <BookingFlowDemo />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
