import { useState } from "react";
import { Link } from "wouter";
import { useAuth0 } from "@auth0/auth0-react";
import { useQuery } from "@tanstack/react-query";
import BrandWordmark from "@/components/BrandWordmark";
import { deriveVendorDetection, type VendorMeState } from "@/lib/vendorState";
import { useTranslation } from "react-i18next";

export default function Footer() {
 const { t } = useTranslation();
 const { isAuthenticated } = useAuth0();
 const {
 data: vendorAccount,
 isLoading: isVendorLoading,
 isFetching: isVendorFetching,
 error: vendorError,
 } = useQuery<VendorMeState>({
 queryKey: ["/api/vendor/me"],
 enabled: isAuthenticated,
 retry: false,
 staleTime: 60_000,
 });
 const vendorDetection = deriveVendorDetection({
 data: vendorAccount,
 isLoading: isVendorLoading,
 isFetching: isVendorFetching,
 error: vendorError,
 });
 const shouldShowBecomeVendor = !isAuthenticated || vendorDetection.status === "non_vendor";
 const [contactOpen, setContactOpen] = useState(false);

 return (
 <footer className="border-t border-[rgba(245,240,232,0.12)] bg-[#4a6a7d] ">
 <div className="w-full px-6 lg:px-10 py-12">
 <div className="grid grid-cols-1 md:grid-cols-6 gap-8">
 <div className="col-span-1 md:col-span-2">
 <div className="mb-4">
 <BrandWordmark
 className="text-[1.75rem]"
 eventClassName="text-[#f5f0e8] font-normal"
 hubClassName="text-[#9dd4cc] font-normal"
 />
 </div>
 <p className="mb-4 max-w-md font-sans text-[1.05rem] text-[rgba(245,240,232,0.85)]">
 {t("footer.tagline")}
 </p>
 </div>
 
 <div>
 <h3 className="mb-4 font-sans text-[0.84rem] font-medium uppercase tracking-[0.1em] text-[#9dd4cc]">{t("footer.forCustomers")}</h3>
 <ul className="space-y-2">
 <li>
 <Link href="/browse" className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-[#f5f0e8]" data-testid="link-footer-browse">
 {t("footer.browseVendors")}
 </Link>
 </li>
 </ul>
 </div>

 <div>
 <h3 className="mb-4 font-sans text-[0.84rem] font-medium uppercase tracking-[0.1em] text-[#9dd4cc]">{t("footer.forVendors")}</h3>
 <ul className="space-y-2">
 {shouldShowBecomeVendor && (
 <li>
 <Link
 href="/vendor/login?returnTo=%2Fvendor%2Fonboarding"
 className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-[#f5f0e8]"
 data-testid="link-footer-vendor-signup"
 >
 {t("footer.becomeVendor")}
 </Link>
 </li>
 )}
 {vendorDetection.status === "vendor" && (
 <li>
 <Link href="/vendor/dashboard" className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-[#f5f0e8]" data-testid="link-footer-vendor-dashboard">
 {t("footer.vendorDashboard")}
 </Link>
 </li>
 )}
 </ul>
 </div>

 <div>
  <h3 className="mb-4 font-sans text-[0.84rem] font-medium uppercase tracking-[0.1em] text-[#9dd4cc]">{t("footer.contactUs")}</h3>
  <button
   onClick={() => setContactOpen((o) => !o)}
   className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-[#f5f0e8] flex items-center gap-1 focus:outline-none"
  >
   {t("footer.contactUs")}
   <span className="text-[0.75rem]">{contactOpen ? "▲" : "▼"}</span>
  </button>
  {contactOpen && (
   <ul className="mt-3 space-y-2">
    <li>
     <a href="mailto:support@eventhubglobal.com" className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-[#f5f0e8]">
      {t("footer.email")}: support@eventhubglobal.com
     </a>
    </li>
    <li>
     <a href="tel:+18014100092" className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-[#f5f0e8]">
      {t("footer.phone")}: (801) 410-0092
     </a>
    </li>
   </ul>
  )}
 </div>

 <div>
 <h3 className="mb-4 font-sans text-[0.84rem] font-medium uppercase tracking-[0.1em] text-[#9dd4cc]">{t("footer.legal")}</h3>
 <ul className="space-y-2">
  <li>
   <Link href="/terms" className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-[#f5f0e8]">
    {t("footer.termsOfService")}
   </Link>
  </li>
  <li>
   <Link href="/privacy" className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-[#f5f0e8]">
    {t("footer.privacyPolicy")}
   </Link>
  </li>
 </ul>
 </div>
 </div>
 
 <div className="mt-8 border-t border-[rgba(245,240,232,0.16)] pt-8 text-center">
 <p className="font-sans text-[0.87rem] text-[rgba(245,240,232,0.3)]">{t("footer.copyright", { year: new Date().getFullYear() })}</p>
 </div>
 </div>
 </footer>
 );
}
