import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type LanguageCode, SUPPORTED_LANGUAGES } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";

interface LanguageContextValue {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => Promise<void>;
  isSaving: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);

  // Clamp stored value to a supported language code, defaulting to 'en'.
  const resolveLanguage = (raw: string | undefined): LanguageCode => {
    const supported = SUPPORTED_LANGUAGES.map((l) => l.code) as string[];
    if (raw && supported.includes(raw)) return raw as LanguageCode;
    return "en";
  };

  const [language, setLanguageState] = useState<LanguageCode>(() =>
    resolveLanguage(
      localStorage.getItem("i18n_lang") ?? undefined
    )
  );

  // Keep state in sync if i18next changes externally (e.g. browser detection on first load).
  useEffect(() => {
    const resolved = resolveLanguage(i18n.language);
    if (resolved !== language) {
      setLanguageState(resolved);
    }
  }, [i18n.language]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep <html lang> in sync for accessibility and SEO (index.html ships lang="en").
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback(
    async (code: LanguageCode) => {
      setLanguageState(code);
      localStorage.setItem("i18n_lang", code);
      await i18n.changeLanguage(code);

      // Persist to server if the user is logged in. Fire and forget —
      // localStorage is the source of truth; the server just syncs it.
      setIsSaving(true);
      try {
        await apiRequest("PATCH", "/api/user/language", { language: code });
      } catch {
        // Not logged in or network error — localStorage already updated, no action needed.
      } finally {
        setIsSaving(false);
      }
    },
    [i18n]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, isSaving }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside <LanguageProvider>");
  return ctx;
}
