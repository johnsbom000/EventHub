import { Check, Globe } from "lucide-react";
import { DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/context/LanguageContext";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@/lib/i18n";

/**
 * Renders language options inline inside any DropdownMenuContent.
 * Uses flat list items (no submenu) so it works on click everywhere.
 * Shared by Navigation, VendorShell, and CustomerDashboard.
 */
export function LanguageSection() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  return (
    <>
      <DropdownMenuLabel className="flex items-center gap-1.5 py-1 text-xs font-medium text-muted-foreground">
        <Globe className="h-3.5 w-3.5" />
        {t("nav.language.label")}
      </DropdownMenuLabel>
      {SUPPORTED_LANGUAGES.map((lang) => (
        <DropdownMenuItem
          key={lang.code}
          onSelect={() => setLanguage(lang.code as LanguageCode)}
          className="flex items-center justify-between pl-6"
        >
          <span>{lang.label}</span>
          {language === lang.code && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
      ))}
    </>
  );
}
