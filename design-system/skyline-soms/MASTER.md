# Campus Flow · Design System (Master)

Source of truth for `frontend/`. Tokens live in `frontend/src/styles/tokens.css`; components consume semantic names only. To change the palette, edit the two theme blocks in that file.

## 1. Direction: editorial "paper, ink, violet"

Taken from the reference poster: warm paper, black ink, one violet accent, hairline rules, condensed display headlines, italic serif subtitles and mono labels.

Rules applied to keep the product from looking generated:

| Avoided | What we do instead |
|---|---|
| Pure white canvas | Warm paper `#F1ECE3` |
| Purple-and-black theme | Violet is a 10% accent only; ink and paper carry the layout. Dark mode is warm charcoal with a muted lavender accent. |
| Drop shadows, glass, gradients | Hairline rules and surface steps. Shadow only on floating layers (menus, modals, toasts). |
| Soft rounded corners | 2 to 4px radius. Circles only for the brand mark and avatars. |
| Coloured left stripes | Overdue tasks get a full error-coloured frame plus an "Overdue" label |
| Checkmark bullets | Numbered lists (`01`, `02`) in mono violet |
| Inter / Geist / Space Grotesk | Big Shoulders Display, Instrument Serif, Instrument Sans, IBM Plex Mono |
| Em dashes in copy | Rewritten as full stops, commas or colons. Empty table cells use an en dash. |
| Hover animations | Colour and background changes only, 100ms, no movement |
| Three cards in a row / pricing tiers | Clubs and plans use ruled editorial rows |
| Rainbow charts | Ink, violet and earth tones |
| No terms / privacy | `/terms` and `/privacy` pages, linked from every footer |

## 2. Colour (60 / 30 / 10)

| Role | Token | Light | Dark |
|---|---|---|---|
| 60 canvas | `--color-bg` | `#F1ECE3` | `#191714` |
| 60 surface | `--color-surface` / `-elevated` / `-muted` / `-interactive` | `#F6F2EB` / `#FBF9F5` / `#E9E3D8` / `#E4DDD0` | `#201E1A` / `#2A2722` / `#24211D` / `#302C27` |
| 30 ink text | `--color-text-primary` / `-secondary` / `-muted` | `#161412` / `#4A4540` / `#6B645B` | `#EFE9DF` / `#C4BCAF` / `#9A9286` |
| 30 rules | `--color-border-strong` / `--color-border` / `-subtle` | ink / ink 16% / ink 9% | `#C4BCAF` / paper 14% / 8% |
| 30 primary action | `--color-primary` (+ `-hover`, `-active`, `-soft`, `--color-on-primary`) | ink | paper |
| 10 accent | `--color-accent` (+ `-hover`, `-soft`), `--color-focus` | `#5B1FC9` | `#B9A2F2` |
| Semantic | `--color-success` / `-warning` / `-error` / `-info` (+ `-soft`) | muted greens, ochre, brick, slate | lightened equivalents |

Accent is reserved for links, the current tab, active nav icon, focus rings, stat labels and the brand mark.

## 3. Typography

| Role | Family | Use |
|---|---|---|
| Display | Big Shoulders Display 800, uppercase | h1 page titles, stat figures, prices, scan results |
| Serif | Instrument Serif italic | page subtitles, home lead-in |
| Sans | Instrument Sans 400 to 700 | body, h2/h3, buttons, forms |
| Mono | IBM Plex Mono 400/500, uppercase, 0.08em tracking | labels, badges, table headers, breadcrumbs, codes |
| Brand | Benso Yolmi (`--font-family-brand`) | the "Campus Flow" wordmark, splash, h1 to h3 |

Scale steps by √φ from 16px, so every second step is a golden-ratio jump: 12 · 13 · 14 · **16** · 20.4 · **25.9** · 32.9 · **41.9** · display `clamp(41.9px → 67.8px)`. Page titles use `clamp(32.9px → 41.9px)`. Body 16px, line-height 1.55; the main/side grid uses a 1.618 : 1 split.

## 4. Space, radius, depth, motion

- Spacing `--space-1…24` on a 4px base.
- Radius `--radius-sm/md` 2px, `-lg` 3px, `-xl` 4px, `-full`.
- Shadows: `--shadow-xs/sm` none, `-md` a 1px rule, `-lg` for floating layers only.
- Motion: `--duration-fast` 100ms, `-normal` 160ms, `-slow` 240ms; fades and colour only. Everything is off under `prefers-reduced-motion`.

## 5. Signature components

- **Stat tile**: mono violet label, hairline rule, automatic `01/02/…` index (CSS counter), display figure, sans note. Top-ruled, no box.
- **Badge**: square mono tag with a square bullet; text always carries the meaning.
- **Ruled list** (`.ruled`): editorial rows for small collections.
- **Numbered list** (`.numbered`): replaces checkmark bullets.
- **Demo strip and ID card header**: ink bar with paper mono text.

## 6. Brand

- Mark: five-arm circuit star, one fixed colour per arm (`#3E63D6`, `#10A9EE`, `#F4663C`, `#CB3A9C`, `#7643C6`), transparent background. Source file `frontend/public/logo.svg`; the `Logo` component in `src/components/Brand.js` renders the same paths inline. The arm colours are artwork, so they stay the same in both themes.
- Icons: `favicon.ico` (16/32/48, heavier stroke), `logo192.png`, `logo512.png`, SVG favicon.
- Launch screen: `Splash` (5s, once per page load) recreates the NMIT poster: Bodoni Moda (`--font-family-poster`) type, blue and peach blocks, a sun disc and hairlines behind `public/campus.webp`, a mirrored reflection, and a full-width bar of slanted segments that fill over the 5s. Colours are the `--color-poster-*` tokens, the same in both themes.
- Page loader: `PageLoader` / `LoadingState` show the star turning 360° clockwise while growing 18%, then 360° anticlockwise back to rest (1.8s loop). Static under reduced motion.

## Navigation

Top bar, no sidebar. Discover links sit inline; My account and Manage open dropdowns (Manage lists the clubs you run when there is more than one, then the active club's pages). The current page gets ink text with a violet underline. Below 1200px everything moves into a panel under the bar, opened from the menu button.

## 7. Accessibility

Visible 2px violet focus rings; contrast checked for ink, secondary text and accent on paper in both themes; skip link; labelled fields with `aria-describedby`; focus moves to the page title on navigation; 40 to 44px targets; QR codes always dark-on-white.
