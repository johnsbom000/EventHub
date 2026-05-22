/**
 * server/translationService.ts
 *
 * Google Cloud Translation v2 wrapper + async listing translation queue.
 *
 * How it works:
 *   - translateListingAsync(listingId, fields) is called right after a listing
 *     is created or updated. It returns immediately — the caller is never blocked.
 *   - A background async task calls Google Translate for each supported language
 *     ('es', 'pt') and upserts the results into listing_translations.
 *   - If translation fails, the row is marked status='failed' so it can be
 *     retried later without silently dropping content.
 *
 * Configuration:
 *   Set GOOGLE_TRANSLATE_API_KEY in .env. If the key is absent the service
 *   logs a warning and skips translation silently — no crash, no user impact.
 */

import { logger } from "./lib/logger.js";
import { Translate } from "@google-cloud/translate/build/src/v2/index.js";
import { db } from "./db.js";
import { listingTranslations } from "../shared/schema.js";
import { eq, and } from "drizzle-orm";

const SUPPORTED_LANGUAGES = ["es", "pt"] as const;
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export interface ListingTranslatableFields {
  title?: string | null;
  description?: string | null;
  whatsIncluded?: string[];
  whatsNotIncluded?: string[];
}

let _translate: Translate | null = null;

function getTranslateClient(): Translate | null {
  if (_translate) return _translate;
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) {
    logger.warn("[i18n] GOOGLE_TRANSLATE_API_KEY not set — translation is disabled.");
    return null;
  }
  _translate = new Translate({ key });
  return _translate;
}

/**
 * Translate a single string. Returns the original if translation fails.
 */
async function translateText(
  client: Translate,
  text: string,
  targetLanguage: string
): Promise<string> {
  if (!text || !text.trim()) return text;
  const [translated] = await client.translate(text, targetLanguage);
  return translated;
}

/**
 * Translate an array of strings. Returns the original array if empty.
 */
async function translateArray(
  client: Translate,
  items: string[],
  targetLanguage: string
): Promise<string[]> {
  if (!items || items.length === 0) return items;
  const [translated] = await client.translate(items, targetLanguage);
  return Array.isArray(translated) ? translated : [translated];
}

/**
 * Translate one listing into one language and upsert the result.
 */
async function translateListingIntoLanguage(
  client: Translate,
  listingId: string,
  fields: ListingTranslatableFields,
  language: SupportedLanguage
): Promise<void> {
  // Mark as pending before we start so the row exists immediately.
  await db
    .insert(listingTranslations)
    .values({
      listingId,
      language,
      status: "pending",
    })
    .onConflictDoUpdate({
      target: [listingTranslations.listingId, listingTranslations.language],
      set: { status: "pending", updatedAt: new Date() },
    });

  try {
    const [title, description, whatsIncluded, whatsNotIncluded] = await Promise.all([
      fields.title ? translateText(client, fields.title, language) : Promise.resolve(null),
      fields.description ? translateText(client, fields.description, language) : Promise.resolve(null),
      fields.whatsIncluded?.length
        ? translateArray(client, fields.whatsIncluded, language)
        : Promise.resolve([]),
      fields.whatsNotIncluded?.length
        ? translateArray(client, fields.whatsNotIncluded, language)
        : Promise.resolve([]),
    ]);

    await db
      .insert(listingTranslations)
      .values({
        listingId,
        language,
        title,
        description,
        whatsIncluded: whatsIncluded ?? [],
        whatsNotIncluded: whatsNotIncluded ?? [],
        status: "completed",
        translatedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [listingTranslations.listingId, listingTranslations.language],
        set: {
          title,
          description,
          whatsIncluded: whatsIncluded ?? [],
          whatsNotIncluded: whatsNotIncluded ?? [],
          status: "completed",
          translatedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    logger.info(`[i18n] ✓ Listing ${listingId} → ${language}`);
  } catch (err: any) {
    logger.error(`[i18n] ✗ Failed to translate listing ${listingId} → ${language}:`, err?.message ?? err);
    await db
      .insert(listingTranslations)
      .values({
        listingId,
        language,
        status: "failed",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [listingTranslations.listingId, listingTranslations.language],
        set: { status: "failed", updatedAt: new Date() },
      });
  }
}

/**
 * Fire-and-forget: translate a listing into all supported languages.
 * Returns immediately; work happens in the background.
 */
export function translateListingAsync(
  listingId: string,
  fields: ListingTranslatableFields
): void {
  const client = getTranslateClient();
  if (!client) return; // API key not configured — skip silently.

  // Use setImmediate so the HTTP response is sent before we start the work.
  setImmediate(() => {
    Promise.all(
      SUPPORTED_LANGUAGES.map((lang) =>
        translateListingIntoLanguage(client, listingId, fields, lang)
      )
    ).catch((err) => {
      logger.error("[i18n] Unexpected error in background translation:", err);
    });
  });
}

/**
 * Return a cached translation for a listing, or translate synchronously on first miss.
 * Returns null when language is "en", the key is unconfigured, or translation fails.
 */
export async function ensureListingTranslation(
  listingId: string,
  fields: ListingTranslatableFields,
  language: string
): Promise<{
  title: string | null;
  description: string | null;
  whatsIncluded: string[];
  whatsNotIncluded: string[];
} | null> {
  if (!language || language === "en") return null;
  if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(language)) return null;

  const cached = await getListingTranslation(listingId, language);
  if (cached) return cached;

  const client = getTranslateClient();
  if (!client) return null;

  await translateListingIntoLanguage(client, listingId, fields, language as SupportedLanguage);
  return getListingTranslation(listingId, language);
}

/**
 * Fetch stored translations for a listing in a given language.
 * Returns null if no completed translation exists.
 */
export async function getListingTranslation(
  listingId: string,
  language: string
): Promise<{
  title: string | null;
  description: string | null;
  whatsIncluded: string[];
  whatsNotIncluded: string[];
} | null> {
  if (!language || language === "en") return null;

  const rows = await db
    .select()
    .from(listingTranslations)
    .where(
      and(
        eq(listingTranslations.listingId, listingId),
        eq(listingTranslations.language, language)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row || row.status !== "completed") return null;

  return {
    title: row.title,
    description: row.description,
    whatsIncluded: row.whatsIncluded ?? [],
    whatsNotIncluded: row.whatsNotIncluded ?? [],
  };
}

/**
 * Resolve which language to use for a request.
 * Priority: query param > user preferred_language > Accept-Language header > 'en'
 */
export function resolveRequestLanguage(
  queryLang: string | undefined,
  userPreferredLanguage: string | undefined,
  acceptLanguageHeader: string | undefined
): string {
  const supported = new Set(["en", ...SUPPORTED_LANGUAGES]);

  if (queryLang && supported.has(queryLang)) return queryLang;
  if (userPreferredLanguage && supported.has(userPreferredLanguage)) return userPreferredLanguage;

  // Parse Accept-Language header (e.g. "es-MX,es;q=0.9,en;q=0.8")
  if (acceptLanguageHeader) {
    const codes = acceptLanguageHeader
      .split(",")
      .map((part) => part.split(";")[0].trim().toLowerCase().slice(0, 2));
    for (const code of codes) {
      if (supported.has(code)) return code;
    }
  }

  return "en";
}
