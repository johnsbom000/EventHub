import React, { useCallback, useEffect, useRef, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import VendorTourModal from "@/components/VendorTourModal";
import { VendorTimezoneModal, useShowTimezoneModal } from "@/components/VendorTimezoneModal";
import { ONBOARDING_TOUR } from "@/lib/vendorTourContent";
import {
  isTourActive,
  readTourStep,
  startTourProgress,
  writeTourStep,
  clearTourProgress,
} from "@/lib/vendorTourProgress";
import {
  ArrowLeft,
  Bell,
  Calendar,
  Check,
  DollarSign,
  HelpCircle,
  Home,
  LayoutGrid,
  Loader2,
  LogOut,
  Menu,
  MessageSquare,
  Scale,
  Settings,
  Star,
  Store,
  Tag,
  User,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { VendorSidebar } from "@/components/vendor-sidebar";
import BrandWordmark from "@/components/BrandWordmark";
import { SuspensionBanner, WarningCountBanner } from "@/components/CircumventionWarningModal";
import { apiRequest } from "@/lib/queryClient";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LanguageSection } from "@/components/LanguageSection";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth0 } from "@auth0/auth0-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

const vendorMobileNavItems = [
  { key: "dashboard",     url: "/vendor/dashboard",     icon: Home },
  { key: "myHub",         url: "/vendor/shop",          icon: Store },
  { key: "bookings",      url: "/vendor/bookings",      icon: Calendar },
  { key: "listings",      url: "/vendor/listings",      icon: LayoutGrid },
  { key: "messages",      url: "/vendor/messages",      icon: MessageSquare },
  { key: "payments",      url: "/vendor/payments",      icon: DollarSign },
  { key: "discounts",     url: "/vendor/discounts",     icon: Tag },
  { key: "reviews",       url: "/vendor/reviews",       icon: Star },
  { key: "notifications", url: "/vendor/notifications", icon: Bell },
  { key: "disputes",      url: "/vendor/disputes",      icon: Scale },
] as const;

type VendorShellProps = {
  children: React.ReactNode;
  onOpenAccountSettings?: () => void;
};

type VendorHeaderAccount = {
  id?: string | null;
  businessName?: string | null;
  email?: string | null;
  operatingTimezone?: string | null;
  vendorOnlySignup?: boolean;
  onboardingCompleted?: boolean;
  dashboardTourCompletedAt?: string | null;
};

const VENDOR_ME_SHELL_QUERY_KEY = ["/api/vendor/me", "shell-header"] as const;

type VendorProfileSummary = {
  id: string;
  profileName: string;
  isActive: boolean;
};

type VendorProfilesResponse = {
  activeProfileId?: string | null;
  profiles?: VendorProfileSummary[];
};

const POLICY_WARNING_LAST_SHOWN_COUNT_KEY = "eventhub:policy-warning-last-shown-count";


function getInitialsFromName(nameOrEmail: string) {
  const value = (nameOrEmail || "").trim();
  if (!value) return "V";
  const words = value
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  if (words.length === 0) return "V";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
}

export default function VendorShell({ children, onOpenAccountSettings }: VendorShellProps) {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isLoading: isAuthLoading, getAccessTokenSilently, logout } = useAuth0();
  const queryClient = useQueryClient();

  const { data: vendorAccount } = useQuery<VendorHeaderAccount>({
    queryKey: VENDOR_ME_SHELL_QUERY_KEY,
    enabled: isAuthenticated && !isAuthLoading,
    retry: false,
    queryFn: async () => {
      const token = await getAccessTokenSilently({
        authorizationParams: { audience: "https://eventhub-api" },
      });
      const res = await fetch("/api/vendor/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`vendor /me failed: ${res.status}`);
      return res.json();
    },
  });

  const { data: vendorProfilesData } = useQuery<VendorProfilesResponse>({
    queryKey: ["/api/vendor/profiles", "shell-header"],
    enabled: isAuthenticated && !isAuthLoading,
    retry: false,
    queryFn: async () => {
      const token = await getAccessTokenSilently({
        authorizationParams: { audience: "https://eventhub-api" },
      });
      const res = await fetch("/api/vendor/profiles", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        return { profiles: [] };
      }
      return res.json();
    },
  });

  const vendorProfiles = Array.isArray(vendorProfilesData?.profiles) ? vendorProfilesData!.profiles! : [];
  const activeProfileId =
    (typeof vendorProfilesData?.activeProfileId === "string" && vendorProfilesData.activeProfileId.trim()) ||
    vendorProfiles.find((profile) => profile.isActive)?.id ||
    "";
  const activeProfileName =
    vendorProfiles.find((profile) => profile.id === activeProfileId)?.profileName ||
    vendorAccount?.businessName ||
    "Vendor Profile";

  const isVendorOnly = Boolean(vendorAccount?.vendorOnlySignup); // [vendor-only restrictions] remove this line

  const showTimezoneModal = useShowTimezoneModal(vendorAccount?.operatingTimezone, vendorAccount?.id);
  const [tzModalDismissed, setTzModalDismissed] = useState(false);

  const switchVendorProfile = async (profileId: string) => {
    const token = await getAccessTokenSilently({
      authorizationParams: { audience: "https://eventhub-api" },
    });
    const res = await fetch("/api/vendor/profiles/switch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ profileId }),
    });
    if (!res.ok) return;

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/me"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/profiles"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/stats"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/bookings"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/payments"] }),
    ]);
  };

  const { data: circumventionStatus } = useQuery<{
    warningCount: number;
    suspension: { id: string; reason: string; endsAt: string; startsAt: string } | null;
  }>({
    queryKey: ["/api/vendor/circumvention/status"],
    enabled: isAuthenticated && !isAuthLoading,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendor/circumvention/status");
      if (!res.ok) return { warningCount: 0, suspension: null, warnings: [], removedListings: [] };
      return res.json();
    },
  });
  const hasActivePolicyWarning = Boolean(
    circumventionStatus && !circumventionStatus.suspension && circumventionStatus.warningCount > 0
  );
  const [showWarningBanner, setShowWarningBanner] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // One-time onboarding tour — a guided walk that starts on the vendor's first
  // dashboard visit and navigates across the real vendor pages (dashboard →
  // bookings → listings → messages → dashboard). Each vendor page mounts its own
  // VendorShell, so the in-flight tour state is persisted in localStorage (see
  // vendorTourProgress) and resumed by whichever shell mounts next. Completion is
  // recorded server-side (dashboard_tour_completed_at) so it never reappears.
  const tourSteps = ONBOARDING_TOUR.steps;
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const tourHydratedRef = useRef(false);
  const tourStartTimerRef = useRef<number | null>(null);
  const accountId = vendorAccount?.id;
  const timezoneModalDone = !showTimezoneModal || tzModalDismissed;
  const tourCompleted = Boolean(vendorAccount?.dashboardTourCompletedAt);
  const currentPath = location.split("?")[0].split("#")[0];
  const isDashboard = currentPath === "/vendor/dashboard";

  // Record tour completion: optimistically stamp the /api/vendor/me cache, then
  // persist (fire-and-forget). The optimistic write keeps the tour from
  // re-triggering mid-session before the next refetch.
  const markTourComplete = useCallback(() => {
    queryClient.setQueryData<VendorHeaderAccount>(VENDOR_ME_SHELL_QUERY_KEY, (prev) =>
      prev && !prev.dashboardTourCompletedAt
        ? { ...prev, dashboardTourCompletedAt: new Date().toISOString() }
        : prev
    );
    apiRequest("POST", "/api/vendor/tour/complete").catch(() => {
      // Optimistic cache already updated; a failed write only means the tour
      // could reappear later until the next successful write.
    });
  }, [queryClient]);

  // Resume: if a tour is already in flight (persisted), pick it up on whatever
  // page this shell just mounted on. Runs once per mount, after the account id
  // is known. This is what lets the tour continue after navigating to the
  // bookings/listings/messages pages.
  useEffect(() => {
    if (!accountId || tourCompleted || tourHydratedRef.current) return;
    tourHydratedRef.current = true;
    if (isTourActive(accountId)) {
      setTourStep(readTourStep(accountId));
      setTourActive(true);
    }
  }, [accountId, tourCompleted]);

  // Start: kick off the tour on the first dashboard visit, once the timezone
  // modal is out of the way. A short delay lets the dashboard finish rendering
  // so the highlighted sections exist.
  useEffect(() => {
    if (tourStartTimerRef.current) clearTimeout(tourStartTimerRef.current);
    if (!isDashboard || tourCompleted || !accountId || !timezoneModalDone) return;
    if (tourActive || isTourActive(accountId)) return; // already running / resuming

    tourStartTimerRef.current = window.setTimeout(() => {
      startTourProgress(accountId);
      setTourStep(0);
      setTourActive(true);
    }, 400);

    return () => {
      if (tourStartTimerRef.current) clearTimeout(tourStartTimerRef.current);
    };
  }, [isDashboard, tourCompleted, accountId, timezoneModalDone, tourActive]);

  const currentTourStep = tourActive ? tourSteps[tourStep] : undefined;
  // Only show the modal when the active step belongs to the page we're on, so we
  // don't flash the next step on the old page before navigation completes.
  const showTour = Boolean(currentTourStep && currentTourStep.page === currentPath);

  const handleTourNext = () => {
    const next = tourStep + 1;
    if (next >= tourSteps.length) {
      handleTourDismiss();
      return;
    }
    writeTourStep(accountId, next);
    setTourStep(next);
    const nextPage = tourSteps[next].page;
    if (nextPage && nextPage !== currentPath) {
      setLocation(nextPage);
    }
  };

  const handleTourDismiss = () => {
    setTourActive(false);
    clearTourProgress(accountId);
    markTourComplete();
  };

  const displayName = activeProfileName || vendorAccount?.email || "Vendor";
  const initials = getInitialsFromName(displayName);

  const sidebarStyle = {
    "--sidebar-width": "6rem",
    "--sidebar-width-icon": "6rem",
  } as React.CSSProperties;

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      const returnTo =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}${window.location.hash}`
          : location || "/vendor/dashboard";
      setLocation(`/vendor/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [isAuthLoading, isAuthenticated, location, setLocation]);

  useEffect(() => {
    if (!circumventionStatus || circumventionStatus.suspension) {
      setShowWarningBanner(false);
      return;
    }

    const warningCount = Number(circumventionStatus.warningCount || 0);
    if (warningCount <= 0) {
      setShowWarningBanner(false);
      return;
    }

    const rawLastShownCount = window.localStorage.getItem(POLICY_WARNING_LAST_SHOWN_COUNT_KEY);
    const lastShownCount = Number(rawLastShownCount);

    // First hydration with existing warnings should not auto-show.
    if (!Number.isFinite(lastShownCount)) {
      window.localStorage.setItem(POLICY_WARNING_LAST_SHOWN_COUNT_KEY, String(warningCount));
      setShowWarningBanner(false);
      return;
    }

    if (warningCount > lastShownCount) {
      window.localStorage.setItem(POLICY_WARNING_LAST_SHOWN_COUNT_KEY, String(warningCount));
      setShowWarningBanner(true);
      return;
    }

    setShowWarningBanner(false);
  }, [circumventionStatus]);

  useEffect(() => {
    if (!hasActivePolicyWarning || !showWarningBanner) return;
    const timeoutId = window.setTimeout(() => {
      setShowWarningBanner(false);
    }, 15000);
    return () => window.clearTimeout(timeoutId);
  }, [hasActivePolicyWarning, showWarningBanner]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="swap-dashboard-whites flex h-screen w-full flex-col">
        <header className="flex items-center justify-between border-b border-[rgba(74,106,125,0.22)] bg-[#ffffff] p-4">
          <div className="flex items-center gap-1">
            <button
              className="lg:hidden flex h-9 w-9 items-center justify-center rounded-md text-[#2a3a42] hover:bg-[#e6e1d6] transition-colors"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            {/* [vendor-only restrictions] collapse to just the <Link> branch and remove the isVendorOnly conditional */}
            {isVendorOnly ? (
              <span className="flex items-center gap-2 rounded-md px-3 py-2">
                <BrandWordmark
                  className="text-[1.875rem]"
                  eventClassName="text-[#e07a6a] font-normal"
                  hubClassName="text-[#4a6a7d] font-normal"
                />
              </span>
            ) : (
              <Link
                href="/"
                className="flex items-center gap-2 rounded-md px-3 py-2"
                data-testid="link-vendor-shell-home"
              >
                <BrandWordmark
                  className="text-[1.875rem]"
                  eventClassName="text-[#e07a6a] font-normal"
                  hubClassName="text-[#4a6a7d] font-normal"
                />
              </Link>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* MARKETPLACE_HIDDEN: restore !isVendorOnly wrapper + Button when going live */}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-full p-0"
                  data-testid="button-vendor-shell-profile"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="end"
                className="w-64"
                data-testid="dropdown-vendor-shell-menu"
              >
                <DropdownMenuLabel>{t("vendorShell.vendorAccount")}</DropdownMenuLabel>
                <DropdownMenuLabel className="pt-0 text-sm font-normal text-muted-foreground">
                  {t("vendorShell.active", { name: activeProfileName })}
                </DropdownMenuLabel>
                {vendorProfiles.length > 0 ? (
                  <>
                    {vendorProfiles.map((profile) => (
                      <DropdownMenuItem
                        key={profile.id}
                        onClick={() => {
                          void switchVendorProfile(profile.id);
                        }}
                        data-testid={`menu-item-vendor-profile-${profile.id}`}
                      >
                        <span className="truncate">{profile.profileName}</span>
                        {profile.id === activeProfileId ? <Check className="ml-auto h-4 w-4" /> : null}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                ) : null}

                <DropdownMenuItem
                  onClick={() => setLocation("/vendor/dashboard")}
                  data-testid="menu-item-vendor-shell-profile"
                >
                  <User className="mr-2 h-4 w-4" />
                  <span>{t("vendorShell.profile")}</span>
                </DropdownMenuItem>
                {/* [vendor-only restrictions] remove the !isVendorOnly wrapper, keep just the DropdownMenuItem */}
                {!isVendorOnly && (
                  <DropdownMenuItem
                    onClick={() => setLocation("/dashboard/events")}
                    data-testid="menu-item-vendor-shell-my-events"
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    <span>{t("vendorShell.myEvents")}</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => setLocation("/vendor/dashboard")}
                  data-testid="menu-item-vendor-shell-dashboard"
                >
                  <Home className="mr-2 h-4 w-4" />
                  <span>{t("vendorShell.vendorDashboard")}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={() => {
                    if (onOpenAccountSettings) {
                      onOpenAccountSettings();
                      return;
                    }
                    setLocation("/vendor/dashboard");
                  }}
                  data-testid="menu-item-vendor-shell-account-settings"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  <span>{t("vendorShell.accountSettings")}</span>
                </DropdownMenuItem>
                <LanguageSection />

                <DropdownMenuSeparator />

                <DropdownMenuItem data-testid="menu-item-vendor-shell-help">
                  <HelpCircle className="mr-2 h-4 w-4" />
                  <span>{t("vendorShell.helpCenter")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    logout({ logoutParams: { returnTo: window.location.origin } });
                  }}
                  data-testid="menu-item-vendor-shell-sign-out"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>{t("vendorShell.signOut")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Mobile nav drawer */}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="w-64 p-0 flex flex-col">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="px-4 py-4 border-b border-[rgba(74,106,125,0.22)]">
              <BrandWordmark
                className="text-[1.4rem]"
                eventClassName="text-[#e07a6a] font-normal"
                hubClassName="text-[#4a6a7d] font-normal"
              />
            </div>
            <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
              {vendorMobileNavItems.map((item) => (
                <Link
                  key={item.url}
                  href={item.url}
                  onClick={() => setMobileNavOpen(false)}
                  data-testid={`link-vendor-${item.key}`}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                    location === item.url
                      ? "bg-[#4a6a7d] text-[#f5f0e8]"
                      : "text-[#2a3a42] hover:bg-[#e6e1d6]"
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span>{t(`vendorSidebar.${item.key}`)}</span>
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        {/* Circumvention banners — shown below the header */}
        {circumventionStatus?.suspension ? (
          <SuspensionBanner
            endsAt={circumventionStatus.suspension.endsAt}
            reason={circumventionStatus.suspension.reason}
          />
        ) : hasActivePolicyWarning && showWarningBanner ? (
          <WarningCountBanner warningCount={circumventionStatus?.warningCount ?? 0} />
        ) : null}

        {/* Onboarding incomplete banner — shown until vendor completes their profile */}
        {vendorAccount && vendorAccount.onboardingCompleted === false && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-4">
            <p className="text-sm text-amber-800">
              <strong>Your profile isn't visible yet.</strong>{" "}
              Complete vendor onboarding to publish listings and appear in search.
            </p>
            <a
              href="/vendor/onboarding"
              className="text-sm font-semibold text-amber-700 underline whitespace-nowrap shrink-0"
            >
              Complete profile →
            </a>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <VendorSidebar
            className="hidden lg:flex shrink-0"
            showWarningBadge={hasActivePolicyWarning && !showWarningBanner}
            onWarningBadgeClick={
              hasActivePolicyWarning
                ? () => {
                    setShowWarningBanner(true);
                  }
                : undefined
            }
          />
          <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
        </div>
      </div>

      {showTour && currentTourStep && (
        <VendorTourModal
          step={currentTourStep}
          stepIndex={tourStep}
          totalSteps={tourSteps.length}
          showOverlay={ONBOARDING_TOUR.overlay}
          showCloseButton={ONBOARDING_TOUR.allowClose}
          onNext={handleTourNext}
          onDismiss={handleTourDismiss}
        />
      )}

      <VendorTimezoneModal
        open={showTimezoneModal && !tzModalDismissed}
        onClose={() => setTzModalDismissed(true)}
        accountId={vendorAccount?.id}
      />
    </SidebarProvider>
  );
}
