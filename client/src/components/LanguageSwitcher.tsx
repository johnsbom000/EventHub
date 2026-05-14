import React from "react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/context/LanguageContext";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe } from "lucide-react";

interface LanguageSwitcherProps {
  /** Render as a compact icon-only button (for nav). Default: false */
  compact?: boolean;
}

export default function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const { t } = useTranslation();
  const { language, setLanguage, isSaving } = useLanguage();

  const currentLabel = SUPPORTED_LANGUAGES.find((l) => l.code === language)?.label ?? "English";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors focus:outline-none"
          aria-label={t("nav.language.label")}
        >
          <Globe className="w-4 h-4 flex-shrink-0" />
          {!compact && (
            <span className="hidden sm:inline">
              {isSaving ? t("nav.language.saving") : currentLabel}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onSelect={() => setLanguage(lang.code as LanguageCode)}
            className={language === lang.code ? "font-semibold bg-gray-50" : ""}
          >
            {lang.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
