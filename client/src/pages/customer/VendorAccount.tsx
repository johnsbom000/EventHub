import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { apiRequest } from "@/lib/apiRequest";

export default function VendorAccount() {
  const { data: vendor } = useQuery({
    queryKey: ["/api/vendor/me"],
  });

  const [businessName, setBusinessName] = useState("");

  const updateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", "/api/vendor/me", { businessName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/me"] });
    },
  });

  if (!vendor) return null;

  return (
    <div className="max-w-xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Business name</label>
            <Input
              value={businessName || vendor.businessName}
              onChange={(e) => setBusinessName(e.target.value)}
            />
          </div>

          <Button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
          >
            Save changes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
