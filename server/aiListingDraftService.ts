import { promises as fs } from "fs";
import path from "path";

import Anthropic from "@anthropic-ai/sdk";

import {
  AI_LISTING_DRAFT_MODEL,
  AI_LISTING_DRAFT_MAX_PHOTOS,
  LISTING_DESCRIPTION_MAX_CHARS,
} from "./lib/constants";
import { isObjectStorageConfigured, localFallbackAllowed } from "./lib/objectStorage";
import { logger } from "./lib/logger";
import type {
  AiListingDraftResult,
  AiListingPricingUnit,
} from "@shared/aiListingDraft";

/** Typed error so the router can map service failures to HTTP status codes. */
export class AiListingDraftError extends Error {
  constructor(
    public code: string,
    public status: number,
    message?: string
  ) {
    super(message || code);
    this.name = "AiListingDraftError";
  }
}

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey) {
    throw new AiListingDraftError(
      "ai_not_configured",
      503,
      "ANTHROPIC_API_KEY is not configured"
    );
  }
  if (!cachedClient) cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

// ─── v1 taxonomy (Rentals + Services) ─────────────────────────────────────────
// MIRROR of client/src/constants/subcategories.ts (RENTAL_SUBCATEGORIES /
// SERVICE_SUBCATEGORIES) and the POPULAR_FOR_EMOJI keys in
// client/src/features/vendor/create-listing/wizardTypes.ts. Kept here (not
// imported) to avoid crossing the client/server boundary — KEEP IN SYNC. The
// model only fills descriptive fields; the vendor supplies the category +
// subcategory, so these lists are used to (a) validate the vendor's choice and
// (b) constrain the popularFor enum.

const RENTAL_SUBCATEGORIES = [
  "Arcade Machines", "Arches", "Audio / Visual", "Backdrops", "Balloon Installations",
  "Bars & Beverage Stations", "Bounce Houses", "Carnival Rides", "Chairs & Seating",
  "Confetti Cannons", "Cooling Fans", "Dance Floors & Staging", "Fire Pits",
  "Flower Walls", "Generators & Power", "Heaters", "Kitchen & Cooking Equipment",
  "Lawn Games", "Lighting", "Linens & Textiles", "Photo Booths", "Props & Decor",
  "Restrooms & Sanitation", "Smoke Machines", "Snow Machines", "Tables",
  "Tableware & Dinnerware", "Tents & Structures", "Water Slides", "Other",
] as const;

const SERVICE_SUBCATEGORIES = [
  "Barbers", "Cake & Dessert Artists", "Childcare", "Circus Acts", "Comedians",
  "Cultural Performers", "Dancers", "DJs", "Drone Videographers", "Event Operations",
  "Event Planning & Coordination", "Fire Performers", "Floral", "Hair Stylists",
  "Live Bands", "Magicians", "Makeup Artists", "MCs", "Medical Staff", "Nail Artists",
  "Officiants", "Pet Handlers", "Photographers", "Security", "Setup / Production",
  "Sign Language Interpreters", "Singers", "Solo Musicians", "Spray Tan Artists",
  "Translators", "Transportation", "Videographers", "Wardrobe Stylists", "Other",
] as const;

const POPULAR_FOR = [
  "Weddings", "Corporate", "Baby Showers", "Photoshoots", "Birthdays",
  "Bridal Showers", "Graduations", "Holiday Parties", "Concert", "Proposal",
  "Bachelor Party", "Bachelorette Party", "Anniversary", "Gender Reveal",
  "Quinceañera", "Baptism", "Funeral", "Reunion", "Conference", "Sporting",
  "School Dance", "Other",
] as const;

/** v1 accepts the singular form the wizard uses ("Rental"/"Service") too. */
function normalizeCategory(raw: string): "Rentals" | "Services" | null {
  const v = raw.trim().toLowerCase();
  if (v === "rentals" || v === "rental") return "Rentals";
  if (v === "services" || v === "service") return "Services";
  return null;
}

function subcategoriesFor(category: "Rentals" | "Services"): readonly string[] {
  return category === "Rentals" ? RENTAL_SUBCATEGORIES : SERVICE_SUBCATEGORIES;
}

// ─── Prompt + output schema ───────────────────────────────────────────────────

function buildSystemPrompt(category: "Rentals" | "Services", subcategory: string): string {
  return [
    "You help a vendor on EventHub — an event-services marketplace — turn photos of",
    "their offering into a listing draft. The vendor will review and edit everything",
    "you produce before it is ever published; you are drafting, not publishing.",
    "",
    `This listing is a ${category === "Rentals" ? "rental" : "service"} in the`,
    `"${subcategory}" subcategory. That classification is FIXED — do not second-guess it.`,
    "",
    "Rules:",
    "- Describe only what is genuinely supported by the photos or is standard for this",
    "  subcategory. Do NOT invent brand names, exact dimensions, materials, or features",
    "  you cannot actually see.",
    "- title: short, specific, appealing. No emojis, no ALL CAPS, no quotes.",
    "- description: 2–4 warm, benefit-focused sentences a customer would want to read.",
    "- whatsIncluded / whatsNotIncluded: concrete, short bullet phrases (not sentences).",
    "  whatsNotIncluded may be empty if nothing obvious applies.",
    "- tags: 3–8 short lowercase search keywords.",
    "- popularFor: pick only the events from the allowed list that genuinely fit; [] if unsure.",
    "- suggestedPriceCents: a ROUGH starting price estimate in cents (integer) if you can",
    "  reasonably infer a typical market rate for this kind of listing; otherwise null.",
    "  This is only a starting point the vendor will correct — never state it as final.",
    "- pricingUnit: 'per_day' or 'per_hour', whichever the vendor's peers typically use",
    `  for ${subcategory} (${category === "Rentals" ? "rentals are usually per_day" : "services are often per_hour"}).`,
  ].join("\n");
}

const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "description",
    "whatsIncluded",
    "whatsNotIncluded",
    "tags",
    "popularFor",
    "suggestedPriceCents",
    "pricingUnit",
  ],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    whatsIncluded: { type: "array", items: { type: "string" } },
    whatsNotIncluded: { type: "array", items: { type: "string" } },
    tags: { type: "array", items: { type: "string" } },
    popularFor: { type: "array", items: { type: "string", enum: [...POPULAR_FOR] } },
    suggestedPriceCents: { type: ["integer", "null"] },
    pricingUnit: { type: "string", enum: ["per_day", "per_hour"] },
  },
} as const;

// ─── Photo → image content block ──────────────────────────────────────────────

const IMAGE_EXT_TO_MEDIA_TYPE: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function mediaTypeForPath(p: string): "image/jpeg" | "image/png" | "image/webp" {
  const ext = (p.split(".").pop() || "").toLowerCase();
  return IMAGE_EXT_TO_MEDIA_TYPE[ext] ?? "image/jpeg";
}

/**
 * Turn a submitted photo reference into an Anthropic image block, refusing
 * anything we didn't produce. This is the SSRF / abuse guard: in production we
 * only ever forward URLs under our own object-storage public base to the model.
 *
 * - Fully-qualified URL under OBJECT_STORAGE_PUBLIC_BASE_URL → url image block.
 * - Dev-only /uploads/listings/<file> path → read from disk as base64 (Anthropic
 *   can't reach a localhost path, and dev often has no object storage).
 * - Anything else → rejected.
 */
async function toImageBlock(raw: unknown): Promise<any> {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new AiListingDraftError("ai_bad_photo", 400, "A photo reference was empty");
  }

  const publicBase = (process.env.OBJECT_STORAGE_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");

  if (/^https?:\/\//i.test(value)) {
    if (isObjectStorageConfigured() && publicBase) {
      if (!value.startsWith(`${publicBase}/`)) {
        throw new AiListingDraftError(
          "ai_bad_photo",
          400,
          "Photos must be uploaded through EventHub before generating a draft"
        );
      }
      return { type: "image", source: { type: "url", url: value } };
    }
    // Object storage not configured but an absolute URL was supplied — only
    // trust it in genuine local dev (never in production/Railway).
    if (localFallbackAllowed()) {
      return { type: "image", source: { type: "url", url: value } };
    }
    throw new AiListingDraftError(
      "ai_bad_photo",
      400,
      "Photos must be uploaded through EventHub before generating a draft"
    );
  }

  // Dev local-upload path: /uploads/listings/<file> → base64 from disk.
  if (value.startsWith("/uploads/listings/") && localFallbackAllowed()) {
    const filename = path.basename(value); // strip any traversal
    const filePath = path.join(process.cwd(), "server/uploads/listings", filename);
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(filePath);
    } catch {
      throw new AiListingDraftError("ai_bad_photo", 400, "Uploaded photo could not be read");
    }
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaTypeForPath(filename),
        data: buffer.toString("base64"),
      },
    };
  }

  throw new AiListingDraftError(
    "ai_bad_photo",
    400,
    "Photos must be uploaded through EventHub before generating a draft"
  );
}

// ─── Output parsing / sanitizing ──────────────────────────────────────────────

function toStringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const s = typeof item === "string" ? item.trim() : "";
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function parseDraft(response: Anthropic.Message): AiListingDraftResult {
  const text = (response.content || [])
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiListingDraftError("ai_generation_failed", 502, "Could not read the generated draft");
  }

  const title = typeof parsed?.title === "string" ? parsed.title.trim().slice(0, 120) : "";
  const description =
    typeof parsed?.description === "string"
      ? parsed.description.trim().slice(0, LISTING_DESCRIPTION_MAX_CHARS)
      : "";

  if (!title && !description) {
    throw new AiListingDraftError("ai_generation_failed", 502, "The generated draft was empty");
  }

  const pricingUnit: AiListingPricingUnit =
    parsed?.pricingUnit === "per_hour" ? "per_hour" : "per_day";

  let suggestedPriceCents: number | null = null;
  const rawPrice = parsed?.suggestedPriceCents;
  if (typeof rawPrice === "number" && Number.isFinite(rawPrice) && rawPrice > 0) {
    // Clamp to a sane band so a wild guess can't anchor the vendor absurdly.
    suggestedPriceCents = Math.min(Math.round(rawPrice), 100_000_00);
  }

  // popularFor is enum-constrained by the schema, but re-check against our list.
  const popularAllowed = new Set<string>(POPULAR_FOR as readonly string[]);
  const popularFor = toStringList(parsed?.popularFor, 8).filter((p) => popularAllowed.has(p));

  return {
    title,
    description,
    whatsIncluded: toStringList(parsed?.whatsIncluded, 12),
    whatsNotIncluded: toStringList(parsed?.whatsNotIncluded, 12),
    tags: toStringList(parsed?.tags, 8),
    popularFor,
    suggestedPriceCents,
    pricingUnit,
  };
}

// ─── Public entry point ───────────────────────────────────────────────────────

export interface GenerateListingDraftParams {
  category: string;
  subcategory: string;
  subcategoryDetail?: string | null;
  photoUrls: unknown;
}

export interface GenerateListingDraftOutcome {
  draft: AiListingDraftResult;
  category: "Rentals" | "Services";
  subcategory: string;
  subcategoryDetail: string | null;
}

export async function generateListingDraft(
  params: GenerateListingDraftParams
): Promise<GenerateListingDraftOutcome> {
  const category = normalizeCategory(String(params.category ?? ""));
  if (!category) {
    throw new AiListingDraftError(
      "ai_unsupported_category",
      400,
      "AI drafts currently support Rentals and Services only"
    );
  }

  const subcategory = typeof params.subcategory === "string" ? params.subcategory.trim() : "";
  const validSubcategories = subcategoriesFor(category);
  if (!subcategory || !validSubcategories.includes(subcategory as any)) {
    throw new AiListingDraftError(
      "ai_bad_subcategory",
      400,
      "Pick a valid subcategory before generating a draft"
    );
  }
  const subcategoryDetail =
    typeof params.subcategoryDetail === "string" && params.subcategoryDetail.trim()
      ? params.subcategoryDetail.trim().slice(0, 120)
      : null;

  const rawPhotos = Array.isArray(params.photoUrls) ? params.photoUrls : [];
  if (rawPhotos.length === 0) {
    throw new AiListingDraftError("ai_no_photos", 400, "Upload at least one photo first");
  }
  const capped = rawPhotos.slice(0, AI_LISTING_DRAFT_MAX_PHOTOS);
  const imageBlocks = await Promise.all(capped.map((p) => toImageBlock(p)));

  const client = getClient();
  const content: any[] = [
    ...imageBlocks,
    {
      type: "text",
      text:
        `Draft a listing from ${imageBlocks.length} photo(s) of this ` +
        `${subcategory} ${category === "Rentals" ? "rental" : "service"}. ` +
        "Return only the structured fields.",
    },
  ];

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: AI_LISTING_DRAFT_MODEL,
      max_tokens: 2048,
      // Fast, deterministic extraction — no need for adaptive thinking latency.
      thinking: { type: "disabled" },
      system: buildSystemPrompt(category, subcategory),
      messages: [{ role: "user", content }],
      output_config: { format: { type: "json_schema", schema: DRAFT_SCHEMA } },
    } as Anthropic.MessageCreateParamsNonStreaming);
  } catch (err: any) {
    // Anthropic SDK errors carry an HTTP status + a nested error object; pull
    // them apart so the failure is diagnosable instead of a generic 502.
    const status = Number(err?.status) || null;
    const apiType = err?.error?.error?.type || err?.error?.type || err?.type || null;
    const apiMessage = err?.error?.error?.message || err?.message || String(err);
    logger.error(
      { status, apiType, err: apiMessage },
      "[ai-listing-draft] generation failed"
    );

    if (status === 401) {
      throw new AiListingDraftError(
        "ai_unauthorized",
        502,
        "AI isn't authenticated — check the ANTHROPIC_API_KEY value."
      );
    }
    if (status === 403) {
      throw new AiListingDraftError(
        "ai_forbidden_model",
        502,
        "This API key isn't allowed to use the drafting model."
      );
    }
    if (status === 404) {
      throw new AiListingDraftError(
        "ai_model_unavailable",
        502,
        "The drafting model isn't available on this Anthropic account."
      );
    }
    if (status === 429) {
      throw new AiListingDraftError(
        "ai_rate_limited",
        429,
        "The AI is busy right now — please try again in a moment."
      );
    }
    if (status === 400 && /image|url|fetch|download|media|photo/i.test(String(apiMessage))) {
      throw new AiListingDraftError(
        "ai_photo_unreachable",
        502,
        "The AI couldn't load your photos. Make sure uploaded images are publicly accessible."
      );
    }
    throw new AiListingDraftError("ai_generation_failed", 502, "Could not generate a draft.");
  }

  const draft = parseDraft(response);
  return { draft, category, subcategory, subcategoryDetail };
}
