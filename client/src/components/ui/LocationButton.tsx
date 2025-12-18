import { Button } from "./button";
import { Loader2, MapPin, MapPinOff } from "lucide-react";
import { useUserLocation } from "@/hooks/useUserLocation";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

type Variant =
  | "default"
  | "outline"
  | "ghost"
  | "link"
  | "secondary"
  | "destructive";

type Size = "default" | "sm" | "lg" | "icon";

interface LocationButtonProps {
  onLocationFound?: (location: { lat: number; lng: number }) => void;
  className?: string;
  variant?: Variant;
  size?: Size;
}

export function LocationButton({
  onLocationFound,
  className = "",
  variant = "outline",
  size = "default",
}: LocationButtonProps) {
  const { location, status, requestLocation } = useUserLocation();
  const isLoading = status === "requesting";
  const isGranted = status === "granted" && location !== null;
  const isDenied = status === "denied";
  const isUnsupported = status === "unsupported";

  const isIcon = size === "icon";

  const handleClick = async () => {
    if (isDenied || isUnsupported) {
      // User has blocked or browser doesn’t support:
      // they should just use the typed location search instead.
      return;
    }

    await requestLocation();

    if (location) {
      onLocationFound?.(location);
    }
  };

  // Common helper to render icon + optional text
  const renderContent = (
    icon: JSX.Element,
    label: string,
    showTooltip?: boolean
  ) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={variant}
            size={size}
            className={className}
            disabled={isLoading || isGranted || isDenied || isUnsupported}
            aria-label={label}
            title={label}
            onClick={handleClick}
          >
            {isIcon ? (
              <>
                {icon}
                <span className="sr-only">{label}</span>
              </>
            ) : (
              <>
                {icon}
                <span className="ml-2">{label}</span>
              </>
            )}
          </Button>
        </TooltipTrigger>
        {showTooltip && (
          <TooltipContent>
            <p>{label}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );

  // Unsupported browser: icon only in hero, descriptive text in tooltip
  if (isUnsupported) {
    return renderContent(
      <MapPinOff className="w-4 h-4" />,
      "Location unavailable in this browser",
      true
    );
  }

  // Permission denied: icon only in hero, no big 'Location Blocked' label
  if (isDenied) {
    return renderContent(
      <MapPinOff className="w-4 h-4" />,
      "Location access blocked. Use the search field instead.",
      true
    );
  }

  // Normal / granted / loading states
  let label = "Use my current location";
  if (isLoading) label = "Detecting your location…";
  if (isGranted) label = "Using your current location";

  const icon = isLoading ? (
    <Loader2 className="w-4 h-4 animate-spin" />
  ) : (
    <MapPin className="w-4 h-4" />
  );

  return renderContent(icon, label, isGranted);
}
