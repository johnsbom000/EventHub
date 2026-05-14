import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

export default function CustomerPlanEvent() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-plan-event-title">
          {t("customerPlanEvent.pageTitle")}
        </h1>
      </div>

      <div className="h-px w-full bg-[var(--dashboard-divider-blue)]" aria-hidden />

      <div className="max-w-2xl">
        {/* Browse Vendors Option */}
        <Card
          className="rounded-xl border-0 bg-transparent shadow-none hover-elevate cursor-pointer group"
          onClick={() => setLocation("/browse")}
        >
          <CardHeader className="pb-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Search className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-[20px]">{t("customerPlanEvent.browseVendors")}</CardTitle>
            <CardDescription className="text-base">
              {t("customerPlanEvent.subtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 mb-6 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>{t("customerPlanEvent.bullet1")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>{t("customerPlanEvent.bullet2")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>{t("customerPlanEvent.bullet3")}</span>
              </li>
            </ul>
            <Button
              className="w-full group-hover:bg-primary/90"
              data-testid="button-browse-vendors"
            >
              {t("customerPlanEvent.startBrowsing")}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
