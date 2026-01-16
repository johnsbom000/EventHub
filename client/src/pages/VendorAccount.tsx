import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function VendorAccount() {
  const { toast } = useToast();

  const { data: vendor, isLoading } = useQuery({
    queryKey: ["/api/vendor/me"],
  });

  const [businessName, setBusinessName] = useState("");

  // When vendor loads, set the input state to the current business name
  useEffect(() => {
    if (vendor?.businessName) setBusinessName(vendor.businessName);
  }, [vendor?.businessName]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const name = businessName.trim();
      if (!name) throw new Error("Business name can't be empty.");

      // apiRequest likely returns a Response-like object; we don't need the body here
      await apiRequest("PATCH", "/api/vendor/me", { businessName: name });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/vendor/me"] });
      toast({ title: "Saved", description: "Your business name was updated." });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn’t save",
        description: err?.message || "Something went wrong.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) return null;
  if (!vendor) return null;

  const unchanged = businessName.trim() === (vendor.businessName || "").trim();

  return (
    <div className="max-w-xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Business name</label>
            <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </div>

          <Button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending || unchanged}
          >
            {updateMutation.isPending ? "Saving..." : "Save changes"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
