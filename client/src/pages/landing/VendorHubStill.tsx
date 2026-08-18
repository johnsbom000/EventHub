import { useTranslation } from "react-i18next";
import { Stars } from "@/pages/landing/primitives";

/* ---------------------------------------------------------------------------
   A still of the vendor hub as it actually renders (see vendorhub.tsx):
   cover → avatar overlapping the cover's bottom edge → name / tagline / rating
   → Quick info + Available rentals at the real 1.3fr/3.7fr split.

   No browser chrome, no animation, no controls — this is a poster of the page,
   meant to convey what a storefront feels like. Type and card treatments are
   lifted from the real page and ListingCard so it reads as the product, not an
   illustration of it.

   Photography note: every wide inflatable shot available was compromised
   (licensed characters, fairground clutter, parked cars), so the cover is a
   festive canopy rather than literal inventory. Swap in a real vendor's cover
   when one exists.
--------------------------------------------------------------------------- */

const COVER =
  "https://images.unsplash.com/photo-1784151439864-2c9e7bc03d69?w=900&h=340&fit=crop&crop=focalpoint&fp-x=0.5&fp-y=0.72&fp-z=1.5";

const LISTINGS = [
  {
    title: "Backyard Bounce House",
    price: "$650",
    img: "https://images.unsplash.com/photo-1765947389722-2e96d8c0aad9?w=320&h=240&fit=crop",
  },
  {
    title: "Water Slide Combo",
    price: "$725",
    img: "https://images.unsplash.com/photo-1785769395783-9477a6b11f1b?w=320&h=240&fit=crop",
  },
  {
    title: "Toddler Play Zone",
    price: "$480",
    // Focal-point crop keeps a bystander out of frame.
    img: "https://images.unsplash.com/photo-1633846786217-3901bf588697?w=320&h=240&fit=crop&crop=focalpoint&fp-x=0.62&fp-y=0.45&fp-z=1.5",
  },
  {
    title: "Obstacle Course",
    price: "$840",
    img: "https://images.unsplash.com/photo-1753274864759-a15a45ecb424?w=320&h=240&fit=crop",
  },
];

const QUICK_INFO: readonly (readonly [string, string])[] = [
  ["Service area", "Salt Lake City · 30 mi"],
  ["In business since", "2016 · 9 years"],
  ["Avg response time", "Under 1 hour"],
];

const SPECIALTIES = [
  "Bounce houses",
  "Water slides",
  "Toddler play",
  "Obstacle courses",
  "Combo units",
  "Birthday packages",
  "Church & school events",
];

// Mirrors vendorHub.aboutBusiness on the real page — a short, concrete owner
// blurb rather than marketing filler.
const ABOUT_BUSINESS =
  "Family-run since 2016. We deliver, set up, and sanitize every unit before your guests arrive, then handle takedown so you never touch a blower.";

export default function VendorHubStill() {
  const { t } = useTranslation();
  return (
    <div className="overflow-hidden rounded-[18px] border border-[rgba(74,106,125,0.10)] bg-white shadow-[0_30px_80px_-20px_rgba(74,106,125,0.28)]">
      {/* Cover + avatar, mirroring the real hero's overlap */}
      <div className="relative h-[84px] w-full">
        <img src={COVER} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0">
          <div className="px-5">
            <div className="h-[52px] w-[52px] translate-y-1/2 overflow-hidden rounded-full border-4 border-white shadow-sm">
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#4a6a7d] to-[#9dd4cc] font-heading text-[1.05rem] font-semibold text-white">
                BB
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Identity — name is sans on the real page, tagline is Playfair italic */}
      <div className="px-5 pt-[30px]">
        <h3 className="font-sans text-[1.3rem] font-semibold leading-tight text-[#2a3a42]">Bounce Bash Rentals</h3>
        <p className="mt-0.5 font-heading text-[0.9rem] italic text-[#9aacb4]">Backyard parties, done properly.</p>
        <div className="mt-1 flex items-center gap-2">
          <Stars size="h-3.5 w-3.5" />
          <span className="font-sans text-[0.85rem] font-medium text-[#2a3a42]">4.9</span>
          <span className="font-sans text-[0.85rem] text-[#9aacb4]">(24 reviews)</span>
        </div>
      </div>

      {/* Body — same column split as the real hub */}
      <div className="grid gap-5 px-5 pb-3 pt-3 lg:grid-cols-[1.3fr_3.7fr]">
        <div>
          <h4 className="font-sans text-[0.95rem] font-semibold text-[#2a3a42]">{t("vendorHub.quickInfo")}</h4>
          <div className="mt-2 space-y-2">
            {QUICK_INFO.map(([label, value]) => (
              <div key={label}>
                <p className="font-sans text-[0.68rem] text-[#9aacb4]">{label}</p>
                <p className="font-sans text-[0.78rem] font-semibold text-[#2a3a42]">{value}</p>
              </div>
            ))}
            <div>
              <p className="font-sans text-[0.68rem] text-[#9aacb4]">Specialties</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {SPECIALTIES.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-[rgba(74,106,125,0.25)] px-2 py-0.5 font-sans text-[0.62rem] text-[#2a3a42]"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* About the business — top rule + heading + prose, as on the real page */}
          <div className="mt-3 border-t border-[rgba(74,106,125,0.24)] pt-3">
            <h4 className="font-sans text-[0.95rem] font-semibold text-[#2a3a42]">{t("vendorHub.aboutBusiness")}</h4>
            <p className="mt-1.5 font-sans text-[0.7rem] leading-[1.6] text-[#4a6a7d]">{ABOUT_BUSINESS}</p>
          </div>
        </div>

        <div>
          <h4 className="font-sans text-[0.95rem] font-semibold text-[#2a3a42]">{t("vendorHub.availableRentals")}</h4>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {LISTINGS.map((l) => (
              <div key={l.title} className="overflow-hidden rounded-[12px] bg-white shadow-[0_4px_24px_rgba(74,106,125,0.10)]">
                <img src={l.img} alt="" className="block w-full object-cover" style={{ aspectRatio: "16/9" }} />
                <div className="px-2.5 py-1">
                  <p className="font-heading text-[0.92rem] font-semibold leading-tight text-[#2a3a42]">{l.title}</p>
                  <p className="mt-0.5 font-heading text-[1.05rem] font-bold text-[#e07a6a]">
                    {l.price}
                    <span className="text-[0.55em] font-medium text-[#9aacb4]">/day</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
