// Font library and pairing presets from the Feedbacker design system (Fonts.md). Generated: do not edit by hand.
// Web fonts are self-hosted; @font-face in src/design/tokens.css loads a file only when text uses it.
export type FontRole = 'ui' | 'heading' | 'label';
export type FontOption = { id: string; name: string; kind: 'system' | 'web'; category: string; roles: FontRole[]; stack: string; note: string };
export type Pairing = { name: string; devTheme: string; ui: string; heading: string; label: string; why: string };

export const FONT_OPTIONS: FontOption[] = [
  {
    "id": "system",
    "name": "System UI",
    "kind": "system",
    "category": "sans",
    "roles": [
      "ui",
      "heading"
    ],
    "stack": "system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", \"Noto Sans\", Arial, sans-serif",
    "note": "The default. Native on every device."
  },
  {
    "id": "humanist",
    "name": "System Humanist",
    "kind": "system",
    "category": "sans",
    "roles": [
      "ui",
      "heading"
    ],
    "stack": "Seravek, \"Gill Sans Nova\", Ubuntu, Calibri, \"DejaVu Sans\", source-sans-pro, sans-serif",
    "note": "Warmer, friendlier native sans."
  },
  {
    "id": "geometric",
    "name": "System Geometric",
    "kind": "system",
    "category": "sans",
    "roles": [
      "heading"
    ],
    "stack": "Avenir, Montserrat, Corbel, \"URW Gothic\", source-sans-pro, sans-serif",
    "note": "Round geometric caps; good for titles."
  },
  {
    "id": "industrial",
    "name": "System Industrial",
    "kind": "system",
    "category": "sans",
    "roles": [
      "heading",
      "label"
    ],
    "stack": "Bahnschrift, \"DIN Alternate\", \"Franklin Gothic Medium\", \"Nimbus Sans Narrow\", sans-serif-condensed, sans-serif",
    "note": "Condensed, signage feel."
  },
  {
    "id": "serif",
    "name": "System Serif",
    "kind": "system",
    "category": "serif",
    "roles": [
      "ui",
      "heading"
    ],
    "stack": "ui-serif, \"Iowan Old Style\", \"Palatino Linotype\", Palatino, \"Book Antiqua\", Georgia, \"Noto Serif\", serif",
    "note": "Bookish, warm."
  },
  {
    "id": "transitional",
    "name": "System Transitional",
    "kind": "system",
    "category": "serif",
    "roles": [
      "ui",
      "heading"
    ],
    "stack": "Charter, \"Bitstream Charter\", \"Sitka Text\", Cambria, serif",
    "note": "Crisp reading serif."
  },
  {
    "id": "rounded",
    "name": "System Rounded",
    "kind": "system",
    "category": "rounded",
    "roles": [
      "ui",
      "heading"
    ],
    "stack": "ui-rounded, \"SF Pro Rounded\", \"Hiragino Maru Gothic ProN\", Quicksand, Comfortaa, Manjari, \"Arial Rounded MT\", \"Arial Rounded MT Bold\", Calibri, sans-serif",
    "note": "Soft; falls back to plain sans where no rounded face exists."
  },
  {
    "id": "mono",
    "name": "System Mono",
    "kind": "system",
    "category": "mono",
    "roles": [
      "label",
      "ui"
    ],
    "stack": "ui-monospace, \"SF Mono\", \"Cascadia Code\", \"Source Code Pro\", Menlo, Consolas, \"DejaVu Sans Mono\", monospace",
    "note": "Native monospace."
  },
  {
    "id": "space-grotesk",
    "name": "Space Grotesk",
    "kind": "web",
    "category": "sans",
    "roles": [
      "ui",
      "heading"
    ],
    "stack": "\"Space Grotesk\", system-ui, sans-serif",
    "note": "Techy grotesk with quirky details; pairs with Space Mono."
  },
  {
    "id": "manrope",
    "name": "Manrope",
    "kind": "web",
    "category": "sans",
    "roles": [
      "ui",
      "heading"
    ],
    "stack": "Manrope, system-ui, sans-serif",
    "note": "Clean, slightly geometric, very legible UI face."
  },
  {
    "id": "dm-sans",
    "name": "DM Sans",
    "kind": "web",
    "category": "sans",
    "roles": [
      "ui",
      "heading"
    ],
    "stack": "\"DM Sans\", system-ui, sans-serif",
    "note": "Low-contrast geometric; calm product UI."
  },
  {
    "id": "figtree",
    "name": "Figtree",
    "kind": "web",
    "category": "sans",
    "roles": [
      "ui",
      "heading"
    ],
    "stack": "Figtree, system-ui, sans-serif",
    "note": "Friendly and open; great at small sizes."
  },
  {
    "id": "onest",
    "name": "Onest",
    "kind": "web",
    "category": "sans",
    "roles": [
      "ui",
      "heading"
    ],
    "stack": "Onest, system-ui, sans-serif",
    "note": "Neutral grotesk with Cyrillic."
  },
  {
    "id": "instrument-sans",
    "name": "Instrument Sans",
    "kind": "web",
    "category": "sans",
    "roles": [
      "ui",
      "heading"
    ],
    "stack": "\"Instrument Sans\", system-ui, sans-serif",
    "note": "Precise, slightly condensed; editorial UI."
  },
  {
    "id": "schibsted-grotesk",
    "name": "Schibsted Grotesk",
    "kind": "web",
    "category": "sans",
    "roles": [
      "ui",
      "heading"
    ],
    "stack": "\"Schibsted Grotesk\", system-ui, sans-serif",
    "note": "Newsroom grotesk; strong bold."
  },
  {
    "id": "bricolage-grotesque",
    "name": "Bricolage Grotesque",
    "kind": "web",
    "category": "sans",
    "roles": [
      "heading"
    ],
    "stack": "\"Bricolage Grotesque\", system-ui, sans-serif",
    "note": "Characterful display grotesk; titles only."
  },
  {
    "id": "ibm-plex-sans",
    "name": "IBM Plex Sans",
    "kind": "web",
    "category": "sans",
    "roles": [
      "ui",
      "heading"
    ],
    "stack": "\"IBM Plex Sans\", system-ui, sans-serif",
    "note": "Engineered, neutral; pairs with Plex Mono."
  },
  {
    "id": "geist",
    "name": "Geist",
    "kind": "web",
    "category": "sans",
    "roles": [
      "ui",
      "heading"
    ],
    "stack": "Geist, system-ui, sans-serif",
    "note": "Swiss-style developer UI face; pairs with Geist Mono."
  },
  {
    "id": "fraunces",
    "name": "Fraunces",
    "kind": "web",
    "category": "serif",
    "roles": [
      "heading"
    ],
    "stack": "Fraunces, ui-serif, Georgia, serif",
    "note": "Soft \"wonky\" old-style display; warm titles."
  },
  {
    "id": "instrument-serif",
    "name": "Instrument Serif",
    "kind": "web",
    "category": "serif",
    "roles": [
      "heading"
    ],
    "stack": "\"Instrument Serif\", ui-serif, Georgia, serif",
    "note": "Condensed elegant display; regular weight only — titles 28px+."
  },
  {
    "id": "dm-serif-display",
    "name": "DM Serif Display",
    "kind": "web",
    "category": "serif",
    "roles": [
      "heading"
    ],
    "stack": "\"DM Serif Display\", ui-serif, Georgia, serif",
    "note": "High-contrast display; titles 24px+."
  },
  {
    "id": "newsreader",
    "name": "Newsreader",
    "kind": "web",
    "category": "serif",
    "roles": [
      "ui",
      "heading"
    ],
    "stack": "Newsreader, ui-serif, Georgia, serif",
    "note": "Reading serif for paragraphs."
  },
  {
    "id": "literata",
    "name": "Literata",
    "kind": "web",
    "category": "serif",
    "roles": [
      "ui",
      "heading"
    ],
    "stack": "Literata, ui-serif, Georgia, serif",
    "note": "Book serif; sturdy at small sizes."
  },
  {
    "id": "nunito",
    "name": "Nunito",
    "kind": "web",
    "category": "rounded",
    "roles": [
      "ui",
      "heading"
    ],
    "stack": "Nunito, ui-rounded, system-ui, sans-serif",
    "note": "Rounded terminals; friendly forms."
  },
  {
    "id": "quicksand",
    "name": "Quicksand",
    "kind": "web",
    "category": "rounded",
    "roles": [
      "heading"
    ],
    "stack": "Quicksand, ui-rounded, system-ui, sans-serif",
    "note": "Light geometric rounded; titles and short UI."
  },
  {
    "id": "jetbrains-mono",
    "name": "JetBrains Mono",
    "kind": "web",
    "category": "mono",
    "roles": [
      "label",
      "ui"
    ],
    "stack": "\"JetBrains Mono\", ui-monospace, monospace",
    "note": "Tall, very legible code face."
  },
  {
    "id": "ibm-plex-mono",
    "name": "IBM Plex Mono",
    "kind": "web",
    "category": "mono",
    "roles": [
      "label",
      "ui"
    ],
    "stack": "\"IBM Plex Mono\", ui-monospace, monospace",
    "note": "Typewriter warmth."
  },
  {
    "id": "space-mono",
    "name": "Space Mono",
    "kind": "web",
    "category": "mono",
    "roles": [
      "label",
      "heading"
    ],
    "stack": "\"Space Mono\", ui-monospace, monospace",
    "note": "Retro-futurist mono; great uppercase labels."
  },
  {
    "id": "geist-mono",
    "name": "Geist Mono",
    "kind": "web",
    "category": "mono",
    "roles": [
      "label",
      "ui"
    ],
    "stack": "\"Geist Mono\", ui-monospace, monospace",
    "note": "Crisp terminal mono."
  },
  {
    "id": "silkscreen",
    "name": "Silkscreen",
    "kind": "web",
    "category": "pixel",
    "roles": [
      "heading",
      "label"
    ],
    "stack": "Silkscreen, ui-monospace, monospace",
    "note": "Blocky 8-bit caps (the XCHANGE look). Titles and short labels only."
  },
  {
    "id": "pixelify-sans",
    "name": "Pixelify Sans",
    "kind": "web",
    "category": "pixel",
    "roles": [
      "heading"
    ],
    "stack": "\"Pixelify Sans\", ui-monospace, monospace",
    "note": "Pixel display with mixed case; readable at 20px+."
  },
  {
    "id": "jersey-10",
    "name": "Jersey 10",
    "kind": "web",
    "category": "pixel",
    "roles": [
      "heading"
    ],
    "stack": "\"Jersey 10\", system-ui, sans-serif",
    "note": "Tall pixel athletic display; big titles."
  },
  {
    "id": "tiny5",
    "name": "Tiny5",
    "kind": "web",
    "category": "pixel",
    "roles": [
      "label"
    ],
    "stack": "Tiny5, ui-monospace, monospace",
    "note": "Tiny pixel caps for badges and tickers (12px+)."
  },
  {
    "id": "vt323",
    "name": "VT323",
    "kind": "web",
    "category": "pixel",
    "roles": [
      "heading",
      "label"
    ],
    "stack": "VT323, ui-monospace, monospace",
    "note": "CRT terminal; use at 18px+."
  },
  {
    "id": "press-start-2p",
    "name": "Press Start 2P",
    "kind": "web",
    "category": "pixel",
    "roles": [
      "heading"
    ],
    "stack": "\"Press Start 2P\", ui-monospace, monospace",
    "note": "Arcade cabinet caps; titles only, 16px+."
  }
] as FontOption[];

export const PAIRINGS: Pairing[] = [
  {
    "name": "Calm default",
    "devTheme": "default",
    "ui": "system",
    "heading": "system",
    "label": "system",
    "why": "Zero downloads. Fastest possible."
  },
  {
    "name": "Product",
    "devTheme": "default",
    "ui": "figtree",
    "heading": "figtree",
    "label": "jetbrains-mono",
    "why": "Friendly UI, precise labels."
  },
  {
    "name": "Workbench",
    "devTheme": "workbench",
    "ui": "ibm-plex-sans",
    "heading": "ibm-plex-sans",
    "label": "ibm-plex-mono",
    "why": "One superfamily, engineered feel."
  },
  {
    "name": "Blueprint",
    "devTheme": "blueprint",
    "ui": "space-grotesk",
    "heading": "space-grotesk",
    "label": "space-mono",
    "why": "Drafting-table grotesk + retro mono."
  },
  {
    "name": "Arcade",
    "devTheme": "arcade",
    "ui": "space-grotesk",
    "heading": "silkscreen",
    "label": "space-mono",
    "why": "Pixel titles like the XCHANGE reference, readable body."
  },
  {
    "name": "Arcade terminal",
    "devTheme": "arcade",
    "ui": "geist",
    "heading": "press-start-2p",
    "label": "tiny5",
    "why": "Louder: arcade-cabinet titles, tiny pixel labels."
  },
  {
    "name": "Ink",
    "devTheme": "ink",
    "ui": "geist",
    "heading": "geist",
    "label": "geist-mono",
    "why": "Swiss black-and-white."
  },
  {
    "name": "Dusk",
    "devTheme": "dusk",
    "ui": "manrope",
    "heading": "fraunces",
    "label": "jetbrains-mono",
    "why": "Soft serif titles on night glass."
  },
  {
    "name": "Paper",
    "devTheme": "paper",
    "ui": "instrument-sans",
    "heading": "instrument-serif",
    "label": "ibm-plex-mono",
    "why": "Gallery-label editorial."
  }
];

export const fontById = (id: string | undefined) => FONT_OPTIONS.find((f) => f.id === id);
export const stackOf = (id: string | undefined, fallback = 'system') => (fontById(id) ?? fontById(fallback)!).stack;
/** Options suited to a role, grouped the way the pickers show them. */
export const GROUPS = [
  ['No download', (f: FontOption) => f.kind === 'system'],
  ['Sans', (f: FontOption) => f.kind === 'web' && f.category === 'sans'],
  ['Serif', (f: FontOption) => f.kind === 'web' && f.category === 'serif'],
  ['Rounded', (f: FontOption) => f.kind === 'web' && f.category === 'rounded'],
  ['Mono', (f: FontOption) => f.kind === 'web' && f.category === 'mono'],
  ['Pixel & display', (f: FontOption) => f.kind === 'web' && f.category === 'pixel'],
] as const;
export const optionsFor = (role: FontRole) => FONT_OPTIONS.filter((f) => f.roles.includes(role));
