import { useAuth0 } from "@auth0/auth0-react";
import { useQuery } from "@tanstack/react-query";

type CustomerMeMinimal = {
  vendorOnlySignup?: boolean;
};

export function useIsVendorOnly(): { isVendorOnly: boolean; isLoading: boolean } {
  const { isAuthenticated, isLoading: authLoading } = useAuth0();

  const { data, isLoading: queryLoading, isError } = useQuery<CustomerMeMinimal>({
    queryKey: ["/api/customer/me"],
    enabled: isAuthenticated && !authLoading,
    retry: false,
  });

  return {
    isVendorOnly: Boolean(data?.vendorOnlySignup),
    // Exclude error state from "loading" so a failed query doesn't block navigation forever.
    isLoading: authLoading || (isAuthenticated && queryLoading && !isError),
  };
}
