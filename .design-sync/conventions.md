# EventHub UI — how to build with this design system

A React + Tailwind component kit (Radix primitives, shadcn "new-york" style) for
EventHub, an event-vendor marketplace. Modern-classic, pastel-glam aesthetic.

## Setup & wrapping

- **No global theme provider is needed.** Every color/spacing token is a CSS
  custom property defined on `:root` (and `.dark`) in the bundle's `styles.css`.
  Just make sure `styles.css` is loaded; components then style themselves.
- **A few components need their own context wrapper** — wrap only where used:
  - `Tooltip` → wrap in `<TooltipProvider>`.
  - `Toast` → wrap in `<ToastProvider>` and render one `<ToastViewport />`.
  - `Sidebar` → wrap in `<SidebarProvider>`; use `<Sidebar collapsible="none">`
    for a statically-visible sidebar (the default `offcanvas` hides on desktop).
  - `Form` is react-hook-form's `FormProvider` — create `const form = useForm(...)`,
    spread `<Form {...form}>`, and wire fields via `FormField` `control={form.control}`.
- **Compound components**: use the exported parts together — e.g. `Card` with
  `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`;
  `Dialog` with `DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter`;
  `Select` with `SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem`.

## Styling idiom: Tailwind utility classes + semantic tokens

Style with Tailwind utilities that reference the DS's **semantic color tokens** —
never hard-coded hex/RGB. The common `bg-*` / `text-*` / `border-*` utilities for
each token are precompiled into the stylesheet:

| Token | Use | Look |
|---|---|---|
| `primary` / `primary-foreground` | primary actions, emphasis | deep teal |
| `secondary` / `secondary-foreground` | secondary actions, soft fills | mint |
| `accent` / `accent-foreground` | hover/active surfaces, highlights | teal |
| `destructive` / `destructive-foreground` | danger, errors | coral |
| `muted` / `muted-foreground` | de-emphasized text/surfaces | (muted-foreground for secondary text) |
| `card` / `card-foreground` | card surfaces | white + border |
| `popover` / `popover-foreground` | menus, overlays | white + border |
| `background` / `foreground` | page base | white / slate ink |
| `border`, `input`, `ring` | borders, field borders, focus rings | slate |

Examples: `bg-primary text-primary-foreground`, `bg-secondary`, `text-muted-foreground`,
`border border-border`, `bg-card`, `text-destructive`. Focus rings and hover/active
states are already baked into the interactive components — you rarely need to add them.

**Radius**: `rounded-xl` (12px) for cards, `rounded-lg` (10px) for buttons/inputs,
`rounded-md` (8px) for small controls. **Shadows**: standard `shadow-sm`/`shadow`/`shadow-md`.

**Interactive elevation**: for custom clickable surfaces, add the DS's own
`hover-elevate` (or `hover-elevate-2`) utility for a subtle hover wash, and
`toggle-elevate`/`toggle-elevated` for pressed/selected states — this is how
`Button` and `Badge` get their hover/active feel. Prefer these over ad-hoc
`hover:bg-*`.

**Fonts** (loaded from the stylesheet): `font-sans` = DM Sans (body/UI, the
default), `font-serif` / `font-heading` = Cormorant Garamond (elegant headings —
this is what gives titles their character; `CardTitle`/`DialogTitle` use it
automatically). `font-logo` (Damion) is reserved for the EventHub wordmark.

**What's in the stylesheet**: it's a *precompiled* utility set (broad, but finite —
it's the classes EventHub's own app uses). The token classes above are present;
uncommon combinations and opacity modifiers (e.g. `bg-primary/90`) may not be, and
arbitrary-value classes (`w-[380px]`) only exist if they were compiled. When a class
isn't taking effect, it isn't in the sheet — reach for a component variant or an
inline style instead. Also note `bg-muted` resolves to white, so use it for contrast
against a tinted area, not as a standalone fill on white.

## Where the truth lives

- `styles.css` (+ its `@import`ed `_ds_bundle.css`) — every token and the
  compiled component/utility CSS. Read it before inventing a class.
- Each component's `<Name>.d.ts` — the prop contract (variants, sizes, states).
- Each component's `<Name>.prompt.md` — usage notes and examples.

## One idiomatic example

```tsx
<Card className="w-[360px]" style={{ width: 360 }}>
  <CardHeader>
    <CardTitle>Bella Fiori Florals</CardTitle>
    <CardDescription>Wedding &amp; event floral design</CardDescription>
  </CardHeader>
  <CardContent>
    <p className="text-sm text-muted-foreground">Salt Lake City, UT · Serves within 50 mi</p>
  </CardContent>
  <CardFooter className="flex items-center justify-between">
    <span className="text-lg font-semibold">From $850</span>
    <Button variant="default">Check availability</Button>
  </CardFooter>
</Card>
```
