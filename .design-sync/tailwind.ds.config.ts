// DS-scoped Tailwind config: reuses the app's theme/plugins but extends the
// content globs to include the authored design-sync previews, so utility
// classes used only in preview .tsx files are still emitted into ds-styles.css.
import base from "../tailwind.config.ts";

export default {
  ...base,
  content: [
    "./client/index.html",
    "./client/src/**/*.{js,jsx,ts,tsx}",
    "./.design-sync/previews/**/*.{ts,tsx}",
    "./.design-sync/.cache/ds-entry.tsx",
  ],
};
