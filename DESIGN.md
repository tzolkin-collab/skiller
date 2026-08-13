---
name: Radiant Obsidian
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#e9bcba'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#af8786'
  outline-variant: '#5f3e3e'
  surface-tint: '#ffb3b2'
  primary: '#ffb3b2'
  on-primary: '#680012'
  primary-container: '#ff525c'
  on-primary-container: '#5b000f'
  inverse-primary: '#bf002a'
  secondary: '#c8c6c5'
  on-secondary: '#313030'
  secondary-container: '#474746'
  on-secondary-container: '#b7b5b4'
  tertiary: '#c8c6c5'
  on-tertiary: '#303030'
  tertiary-container: '#929090'
  on-tertiary-container: '#2a2a2a'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad8'
  primary-fixed-dim: '#ffb3b2'
  on-primary-fixed: '#410008'
  on-primary-fixed-variant: '#92001e'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474746'
  tertiary-fixed: '#e4e2e1'
  tertiary-fixed-dim: '#c8c6c5'
  on-tertiary-fixed: '#1b1c1c'
  on-tertiary-fixed-variant: '#474746'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  headline-lg:
    fontFamily: Geist
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: '0'
  body-sm:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '450'
    lineHeight: 20px
    letterSpacing: '0'
  label-xs:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
  container-max: 1440px
---

## Brand & Style

The design system is a high-performance, developer-centric environment designed for technical precision and urgent action. It targets power users, engineers, and data scientists who require a focused, low-strain interface for complex tasks.

The aesthetic merges **Minimalism** with **Modern Corporate** efficiency, utilizing a deep obsidian foundation to reduce visual noise. High-tech "Radiant Red" accents provide immediate visual hierarchy and a sense of "live" system activity. The emotional response should be one of absolute control, technical sophistication, and high-priority clarity.

## Colors

The palette is anchored by a true obsidian black (`#0A0A0A`) for the base background, with tiered charcoal layers (`#121212`, `#1A1A1A`) for containers. 

**Radiant Red** (`#FF003C`) serves as the singular primary accent. It must be used for all primary actions, critical status indicators, and active states. Gradients should transition from `#FF003C` to a deeper `#990024`. Interactive elements utilize a subtle outer glow of the primary red to simulate a high-tech "powered-on" state.

## Typography

This design system uses **Geist** for all UI prose and headers to maintain a clean, modernist geometric feel. **JetBrains Mono** is reserved for technical metadata, labels, and code blocks to emphasize the system's developer-first DNA.

Headlines should use tight letter spacing and heavy weights. Labels and captions should always utilize JetBrains Mono to distinguish system-generated data from user-generated content.

## Layout & Spacing

The layout follows a **fluid grid** model with a base-4 spacing scale. Desktop views utilize a 12-column grid with 16px gutters. For data-heavy views, density can be increased by reducing internal component padding to 8px, but external margins must remain at 24px-32px to ensure breathability against the dark background.

Mobile transitions collapse the grid to 4 columns, removing side margins for code blocks to maximize horizontal scanning space.

## Elevation & Depth

Depth is conveyed through **Tonal Layers** rather than traditional shadows. Because the background is obsidian, higher elevation is represented by progressively lighter charcoal fills:
- **Level 0 (Base):** #0A0A0A
- **Level 1 (Cards/Sidebar):** #121212
- **Level 2 (Modals/Popovers):** #1A1A1A

For critical high-priority elements (like active primary buttons), use a thin 1px inner border of the Radiant Red at 30% opacity and a soft 12px outer blur of the same red at 10% opacity to create a "bloom" effect.

## Shapes

The design system adopts a **Soft** shape language (4px radius) to maintain a precise, engineered appearance without the aggressive sharpness of pure brutalism.

- **Standard Elements:** 4px (0.25rem)
- **Large Containers:** 8px (0.5rem)
- **Inputs:** 4px

Avoid pill-shaped buttons; rectangles with subtle rounding reinforce the technical, structured nature of the interface.

## Components

### Buttons
- **Primary:** Solid Radiant Red (#FF003C) background, white text. On hover, apply a 20px red glow.
- **Secondary:** Transparent background with a 1px border of #262626. Text is Geist Medium.
- **Ghost:** No border, JetBrains Mono label in medium grey, turning Radiant Red on hover.

### Inputs
Use a dark charcoal fill (#121212) with a 1px border (#262626). On focus, the border transitions to Radiant Red with a subtle inner glow.

### Cards & Lists
Cards should have no visible shadow. Use a 1px border of #1A1A1A to define boundaries against the #0A0A0A background. List items should use JetBrains Mono for secondary metadata.

### Chips/Tags
Technical tags should use JetBrains Mono in all-caps. Active tags should use a Radiant Red background with 15% opacity and a solid red left-hand border.

### Status Indicators
- **Active/Live:** Pulsing Radiant Red dot.
- **Idle:** Mid-grey dot.
- **Terminal/Console:** Pure JetBrains Mono text on obsidian background.