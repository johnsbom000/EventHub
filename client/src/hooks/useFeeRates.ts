import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface FeeRates {
  vendorFeeRate: number;
  customerFeeRate: number;
}

const FALLBACK: FeeRates = { vendorFeeRate: 0.08, customerFeeRate: 0.05 };

export function useFeeRates(): FeeRates {
  const { data } = useQuery<FeeRates>({
    queryKey: ["/api/config/fees"],
    queryFn: () => apiRequest("GET", "/api/config/fees").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });
  return data ?? FALLBACK;
}
