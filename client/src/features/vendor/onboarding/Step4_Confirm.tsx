import { Button } from "@/components/ui/button";

interface Step4ConfirmProps {
  formData: {
    vendorType: string;
    businessName: string;
    streetAddress: string;
    city: string;
    state: string;
    zipCode: string;
    businessPhone: string;
    serviceRadiusMiles: number;
    chargesTravelFee: boolean;
  };
  onBack: () => void;
  onComplete: (createListing: boolean) => void;
}

export default function Step4_Confirm({
  formData,
  onBack,
  onComplete,
}: Step4ConfirmProps) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Confirm</h1>

      {/* Temporary summary */}
      <div className="rounded-xl border p-4 space-y-2 text-sm">
        <div><span className="font-medium">Vendor type:</span> {formData.vendorType || "—"}</div>
        <div><span className="font-medium">Business:</span> {formData.businessName || "—"}</div>
        <div>
          <span className="font-medium">Address:</span>{" "}
          {[formData.streetAddress, formData.city, formData.state, formData.zipCode]
            .filter(Boolean)
            .join(", ") || "—"}
        </div>
        <div><span className="font-medium">Phone:</span> {formData.businessPhone || "—"}</div>
        <div><span className="font-medium">Radius:</span> {formData.serviceRadiusMiles ?? 0} miles</div>
        <div>
          <span className="font-medium">Travel fees:</span>{" "}
          {formData.chargesTravelFee ? "Yes" : "None"}
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>

        <div className="ml-auto flex gap-3">
          <Button variant="outline" onClick={() => onComplete(false)}>
            Continue to dashboard
          </Button>
          <Button onClick={() => onComplete(true)}>Create first listing</Button>
        </div>
      </div>
    </div>
  );
}
