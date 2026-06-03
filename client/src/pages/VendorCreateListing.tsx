import { useRef } from "react";
import { useLocation } from "wouter";
import { CreateListingWizard } from "@/features/vendor/create-listing/CreateListingWizard";

export default function VendorCreateListing() {
  const [, setLocation] = useLocation();
  const didPublishRef = useRef(false);

  const handleClose = () => {
    setLocation(didPublishRef.current ? "/vendor/my-hub" : "/vendor/listings");
  };

  const handleComplete = () => {
    didPublishRef.current = true;
  };

  const handleStripeRequired = () => {
    setLocation("/vendor/shop");
  };

  return (
    <div data-testid="page-vendor-create-listing">
      <CreateListingWizard
        onClose={handleClose}
        onComplete={handleComplete}
        onStripeRequired={handleStripeRequired}
      />
    </div>
  );
}
