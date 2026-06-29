import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";

/**
 * Shown when a vendor follows a retired program link (e.g. the old Founding or
 * Marquee Vendor invite URLs). Those programs no longer exist.
 */
export default function LinkExpired() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Clock className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="font-serif text-2xl font-semibold text-foreground">
            This link has expired
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            The page you're looking for is no longer available. If you were
            invited to a vendor program, that program has since closed.
          </p>
          <Button asChild className="mt-6">
            <Link href="/">Back to EventHub</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
