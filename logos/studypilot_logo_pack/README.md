# StudyPilot Logo Pack

This pack contains website-ready logo cuts for **StudyPilot**, an AI-powered study assistant/browser extension with a live voice orb.

## Best assets to use in a website

Use the SVG files first. They are cleaner, scalable, and easier for AI website builders to implement.

Recommended usage:

- `svg/studypilot-full-lockup.svg` — navbar, footer, hero brand lockup
- `svg/studypilot-mark.svg` — small mark, favicon source, loading state, orb/brand detail
- `svg/studypilot-app-icon.svg` — app store style icon, extension card, social preview
- `svg/studypilot-wordmark.svg` — text-only logo usage
- `svg/studypilot-monochrome-lockup.svg` — monochrome/white usage on dark backgrounds

The PNG folder contains crops from the generated brand board:

- `01_main_horizontal_lockup_dark.png`
- `02_symbol_mark_dark.png`
- `03_wordmark_dark.png`
- `04_app_icon_dark.png`
- `05_monochrome_lockup_dark.png`
- `06_feature_icon_row_dark.png`

Transparent PNGs are also included for some cuts, but the SVGs are better for clean implementation.

## Brand direction

StudyPilot should feel like Apple + Vercel + Linear + Arc Browser:

- dark, premium, and restrained
- crisp white typography
- soft gray supporting text
- subtle cyan/blue/violet/pink gradients
- one signature visual element: the calm AI speaker orb
- minimal browser-extension/product cues
- polished, not cartoonish

## Prompt to give an AI website builder

Use this prompt with Claude, v0, Cursor, Bolt, or similar tools:

```text
Implement the StudyPilot brand using the provided logo pack. Use `svg/studypilot-full-lockup.svg` in the navbar on desktop, `svg/studypilot-mark.svg` for compact mobile/nav icon use, and `svg/studypilot-app-icon.svg` for product cards or app preview sections.

The website should use a premium dark UI: near-black background (#03050A), white text (#F8FAFC), muted gray text (#A6ADBB), subtle borders, and restrained gradient accents from cyan (#39D7FF), blue (#5BB8FF), violet (#7C5CFF), purple (#A855F7), and pink (#FF4FD8).

Avoid generic AI SaaS styling: no random purple blobs everywhere, no repetitive glass cards, no fake dashboard data, no generic icons in gradient squares. Make the logo feel integrated into the product interface, especially around the AI voice orb and browser extension panel.

Use the full logo in the nav and footer, the standalone mark for favicon/loading states, and the app icon for extension-install CTAs. Keep logo clear space around the mark equal to at least 25% of its height. Do not stretch, recolor randomly, or add heavy shadows.
```

## Suggested logo placement

- Navbar desktop: full lockup, 32-40px high
- Navbar mobile: mark only, 28-32px high
- Footer: monochrome lockup or full lockup, 28-36px high
- App/extension card: app icon, 72-96px square
- Favicon source: mark or app icon

## Notes

The original generated board is included as `00_full_brand_board.png` for reference. The SVGs are simplified, implementation-ready recreations inspired by that board.
