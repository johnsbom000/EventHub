import { useLocation } from "wouter";
import { CreateListingWizard } from "@/features/vendor/create-listing/CreateListingWizard";

export default function VendorCreateListing() {
  const [, setLocation] = useLocation();

  const handleClose = () => {
    setLocation("/vendor/listings");
  };

  return (
    <div data-testid="page-vendor-create-listing">
      <CreateListingWizard onClose={handleClose} />
    </div>
  );
}
