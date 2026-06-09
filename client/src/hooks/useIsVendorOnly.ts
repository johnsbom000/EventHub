import { useAuth0 } from "@auth0/auth0-react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

type CustomerMeMinimal = {
  vendorOnlySignup?: boolean;
};

export function useIsVendorOnly(): { isVendorOnly: boolean; isLoading: boolean } {
  const { isAuthenticated, isLoading: authLoading } = useAuth0();

  // Use returnNull on 401 so a missing/invalid token produces null data (success
  // state) rather than an error state. Error state + refetchOnMount:true causes
  // every component remount to re-fire the request, creating a 401 cascade.
  const { data, isLoading: queryLoading } = useQuery<CustomerMeMinimal>({
    queryKey: ["/api/customer/me"],
    enabled: isAuthenticated && !authLoading,
    retry: false,
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  return {
    isVendorOnly: Boolean(data?.vendorOnlySignup),
    isLoading: authLoading || (isAuthenticated && queryLoading),
  };
}
