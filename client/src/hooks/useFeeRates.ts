import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface FeeRates {
  vendorFeeRate: number;
  customerFeeRate: number;
}

// Fee rates are vendor-specific and resolved server-side. Until the real rates
// load we return null so callers can render a skeleton rather than a false 0%.
export function useFeeRates(): FeeRates | null {
  const { data } = useQuery<FeeRates>({
    queryKey: ["/api/config/fees"],
    queryFn: () => apiRequest("GET", "/api/config/fees").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });
  return data ?? null;
}
