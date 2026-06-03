import { useAuth0 } from "@auth0/auth0-react";
import { useQuery } from "@tanstack/react-query";

type CustomerMeMinimal = {
  vendorOnlySignup?: boolean;
};

export function useIsVendorOnly(): { isVendorOnly: boolean; isLoading: boolean } {
  const { isAuthenticated, isLoading: authLoading } = useAuth0();

  const { data, isLoading: queryLoading } = useQuery<CustomerMeMinimal>({
    queryKey: ["/api/customer/me"],
    enabled: isAuthenticated && !authLoading,
    retry: false,
  });

  return {
    isVendorOnly: Boolean(data?.vendorOnlySignup),
    isLoading: authLoading || (isAuthenticated && queryLoading),
  };
}
