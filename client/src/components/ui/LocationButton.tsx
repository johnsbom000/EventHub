import { Button } from "./button";
import { Loader2, MapPin, MapPinOff } from "lucide-react";
import { useUserLocation } from "@/hooks/useUserLocation";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

export function LocationButton({
  onLocationFound,
  className = "",
  variant = "outline",
  size = "default",
}: {
  onLocationFound?: (location: { lat: number; lng: number }) => void;
  className?: string;
  variant?: "default" | "outline" | "ghost" | "link" | "secondary" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
}) {
  const { location, status, requestLocation, error } = useUserLocation();
  const isLoading = status === 'requesting';
  const isGranted = status === 'granted' && location !== null;
  const isDenied = status === 'denied';
  const isUnsupported = status === 'unsupported';

  const handleClick = async () => {
    if (isDenied || isUnsupported) {
      return; // Don't do anything if permission was previously denied or unsupported
    }

    await requestLocation();
    
    if (location) {
      onLocationFound?.(location);
    }
  };

  if (isUnsupported) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={variant}
              size={size}
              className={className}
              disabled
              title="Geolocation is not supported by your browser"
            >
              <MapPinOff className="w-4 h-4 mr-2" />
              Location Unavailable
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Your browser doesn't support geolocation</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (isDenied) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={variant}
              size={size}
              className={className}
              disabled
              title="Location access was denied. Please enable it in your browser settings."
            >
              <MapPinOff className="w-4 h-4 mr-2" />
              Location Blocked
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Location access is blocked. Update your browser settings to enable it.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={isGranted ? 'default' : variant}
            size={size}
            onClick={handleClick}
            disabled={isLoading || isGranted}
            className={className}
            title={isGranted ? 'Using your current location' : 'Use my current location'}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Detecting...
              </>
            ) : isGranted ? (
              <>
                <MapPin className="w-4 h-4 mr-2" />
                Using Current Location
              </>
            ) : (
              <>
                <MapPin className="w-4 h-4 mr-2" />
                Use My Location
              </>
            )}
          </Button>
        </TooltipTrigger>
        {isGranted && (
          <TooltipContent>
            <p>Using your current location</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
