import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Button,
} from "eventhub-ui";
import { Info, ShieldCheck } from "lucide-react";

// Tooltip forced open so the portalled content renders in the card.
export const RefundPolicyInfo = () => (
  <TooltipProvider>
    <Tooltip open>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="sm">
          <Info className="mr-2 h-4 w-4" />
          Deposit terms
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Your $212.50 deposit is refundable up to 7 days before the event.
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export const VerifiedVendorInfo = () => (
  <TooltipProvider>
    <Tooltip open>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="sm">
          <ShieldCheck className="mr-2 h-4 w-4" />
          Verified vendor
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Bella Fiori Florals passed EventHub identity &amp; payout checks.
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);
