# Whatloom

**Make room for what could be.**

Descriptor: **An invention studio.**

Whatloom helps creators explore ambitious futures, develop different paths toward them, examine evidence, and find a practical first proof.

## Name

Pronounce it **what-loom**. The name brings together the curiosity of “what if?” with a loom: a place where separate threads become something tangible. Write **Whatloom** in prose and **whatloom** in the wordmark. Avoid “WhatLoom,” all caps in body copy, and attaching “AI” to the name.

The name is a working identity. Exact-name web searches on November 7, 2026 found no obvious exact-name software product. This was an initial collision screen, not domain, company-name, or trademark clearance. No availability or exclusive rights are asserted. The screen rejected several alternatives with existing software businesses, including Veylo, Oddwell, Elseform, and Morrowell.

## Position

An invention studio for people who see a future worth making and want to discover where to begin.

The product connects possibility to mechanism, mechanism to evidence, and evidence to a useful proof. It gives unusual ideas enough room to develop while keeping the reasoning inspectable.

The ambition is consequential original work. Avoid promising virality, breakthrough inventions, guaranteed originality, market validation from generated text, or enormous financial outcomes.

## Visual system

### Symbol

The **open w** is drawn as two connected, open-top apertures. It can read as a lowercase w, two paths, or two vessels ready to receive a thought. Its curves suggest approachability; its shared central stem suggests connection.

- Geometry: 128 × 128 viewBox, 15.5-unit round stroke.
- Path: `M24 28V75C24 90 32 99 44 99C56 99 64 90 64 75V48M64 48V75C64 90 72 99 84 99C96 99 104 90 104 75V28`
- Keep at least 16 units of clear space outside the mark’s visible boundary.
- Minimum symbol size: 20 px for ordinary UI; use `favicon.svg` for 16 px browser contexts.
- Preserve the open top, rounded terminals, and proportions.
- Use a single color. No extra sparkle, bulb, robot, drop shadow, or gradient.

### Color

| Token | Color | Role |
|---|---|---|
| Paper | `#F6F4EE` | Main workspace and open space |
| Ink | `#242720` | Text, structure, primary actions |
| Possibility | `#D7F06F` | Selected possibility, useful attention, brand accent |
| Quiet | `#7B7F73` | Quiet labels and decorative secondary information |
| Rule | `#DCDDD3` | Dividers and subtle outlines |

Use mostly paper and ink. Chartreuse is more effective as a deliberate interruption than as the background for every panel. Use ink text on chartreuse. Quiet is intended for secondary presentation; confirm contrast for the actual size and context before using it for essential text.

### Typography

**Instrument Serif** is the expressive voice. Use regular and italic for major invitations, future statements, and short editorial headings. Avoid long paragraphs in the display serif.

**DM Sans** is the working voice. Use it for navigation, controls, research, notes, evidence, and ordinary body text. Prefer 400–500 for body copy and 550–650 for labels and emphasis. Use sentence case. Small uppercase labels may use modest tracking.

The wordmark is rendered as vector outlines using a 650-weight DM Sans foundation with custom spacing. SVG assets do not need a font installed. Both type families are included for offline use under their supplied SIL Open Font Licenses.

```css
@font-face {
  font-family: 'DM Sans';
  src: url('/brand/dm-sans-variable.ttf') format('truetype');
  font-weight: 100 1000;
  font-display: swap;
}
@font-face {
  font-family: 'Instrument Serif';
  src: url('/brand/instrument-serif.ttf') format('truetype');
  font-display: swap;
}
@font-face {
  font-family: 'Instrument Serif';
  src: url('/brand/instrument-serif-italic.ttf') format('truetype');
  font-style: italic;
  font-display: swap;
}
```

Font sources: [DM Sans](https://github.com/google/fonts/tree/main/ofl/dmsans), [Instrument Serif](https://github.com/google/fonts/tree/main/ofl/instrumentserif).

### Layout and motion

Use generous margins, fine rules, a deliberate hierarchy, and open surfaces. Prefer an editorial desk to a wall of decorated cards. Reserve strong fills for a primary action or a meaningful selected state.

Motion should explain a transition: opening a path, adding an evidence link, or revealing a new layer. Keep ordinary transitions brief. Respect reduced-motion preferences. Never require motion to understand a result.

## Voice

Curious, lucid, warm, and ambitious. Take creators seriously. Ask a sharp question when it advances the work. Ground agent claims in the evidence available. Leave room for a human to disagree.

### Preferred language

- “What do you wish existed?”
- “What would have to become true?”
- “Explore another path.”
- “What supports this?”
- “Find your first proof.”
- “This is a hypothesis. Add evidence to examine it.”
- “Save this possibility.”

Use **future**, **path**, **possibility**, **evidence**, **assumption**, and **proof** where their meaning is accurate. An experiment can provide evidence or demonstrate a narrow capability; it does not prove an entire business will work.

### Avoid

“Revolutionary,” “guaranteed,” “trillion-dollar idea,” “validated” without actual evidence, fabricated live activity, decorative confidence percentages, and copy that implies an agent has researched something it has not examined.

## Asset inventory

| File | Use |
|---|---|
| `logo.svg` | Primary horizontal signature |
| `wordmark.svg` | Ink outlined wordmark |
| `wordmark-paper.svg` | Light outlined wordmark on ink |
| `mark.svg` | Symbol using `currentColor` for inline SVG usage |
| `mark-ink.svg` | Ink symbol for image elements |
| `mark-paper.svg` | Paper symbol for dark surfaces |
| `mark-chartreuse.svg` | Accent symbol for ink surfaces |
| `app-icon.svg` | 1024 × 1024 rounded app icon source |
| `app-icon.png` | 1024 × 1024 transparent PNG export |
| `app-icon.icns` | Native Mac icon with 16–1024 px representations |
| `icon-192.png`, `icon-512.png` | Browser/PWA icon exports |
| `/favicon.svg` | Small-size browser icon |
| `social-card.svg` | 1200 × 630 launch/share card; outlined lettering |
| `social-card.png` | 1200 × 630 ready-to-share PNG export |
| `brand-board.html` | Local, responsive identity preview and downloads |
| `dm-sans-variable.ttf` | Offline UI typeface |
| `instrument-serif.ttf` | Offline display typeface |
| `instrument-serif-italic.ttf` | Offline italic display typeface |
| `DM-Sans-OFL.txt` | DM Sans license |
| `Instrument-Serif-OFL.txt` | Instrument Serif license |

All identity artwork is vector-native. No external stock images, runtime font services, or image-generation dependencies are used.
