# Landing Page Implementation

## Overview

This document describes the implementation of the premium welcome page for Naksha GeoSphere following the design system and requirements.

## Design System

### Color Palette (60-30-10 Rule)

- **Polar Pearl** (#F6F8FB) - 60%: Page backgrounds, surfaces
- **Obsidian Graphite** (#151A23) - 30%: Headers, text, dark surfaces
- **Atlas Cobalt** (#3563E9) - 10%: CTAs, accents, active states

### Design Tokens

All colors, shadows, and spacing values are defined in `/src/styles/tokens.css` as CSS custom properties. Components reference these tokens rather than hard-coding values.

### Typography

- **Font**: Inter (system fallback to ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif)
- **Hero Headline**: 60px (5xl) on desktop, 48px (4xl) on mobile
- **Section Headings**: 30px (3xl)
- **Body Text**: 16px (base)

### Shadows

- **Card Shadow**: `0 12px 32px rgba(21, 26, 35, 0.08)`
- **Map Shadow**: `0 18px 48px rgba(21, 26, 35, 0.16)`
- **Button Shadow**: `0 4px 12px rgba(53, 99, 233, 0.2)`

### Border Radius

- **Small**: 8px
- **Medium**: 12px
- **Large**: 18px

## Component Structure

```
src/components/landing/
├── LandingPage.tsx              # Main container component
├── LandingHeader.tsx            # Premium navigation header
├── HeroSection.tsx              # Hero section container
├── HeroContent.tsx              # Hero text and CTAs
├── MarketplaceMapPreview.tsx    # Interactive map preview demo
├── FeatureStrip.tsx             # Three feature cards
├── DataFormatsSection.tsx       # Six data format tiles
├── HowItWorksSection.tsx        # Four workflow steps
└── TrustStrip.tsx               # Four trust pillars
```

## Page Structure

The landing page follows this exact order:

1. **Header** (70px height)

   - Logo with geometric globe icon
   - Product name and subtitle
   - Desktop navigation: Explore Data, Solutions, Pricing, About, Contact
   - Mobile hamburger menu
   - Sign In + Get Started buttons

2. **Hero Section**

   - Two-column layout (39% / 61%)
   - Left: Badge, headline with cobalt periods, description, CTAs
   - Right: Interactive map preview with layers, toolbar, and data card
   - Subtle topographic background pattern

3. **Feature Strip**

   - Three cards: Latest Data, Flexible Selection, Secure Delivery
   - Icons in cobalt containers
   - Equal-height responsive grid

4. **Data Formats Section**

   - Six format tiles in responsive grid
   - KML/KMZ, GeoTIFF, GeoJSON, Shapefile, DEM/DSM/DTM, LAS/LAZ
   - Hover states with cobalt accents

5. **How It Works Section**

   - Four steps: Search, Preview, Select & Pay, Download
   - Horizontal layout on desktop with connector line
   - Vertical stepper on mobile
   - Numbered badges and icons

6. **Trust Strip**

   - Dark obsidian background
   - Four pillars: Quality, Pricing, Coverage, Security
   - Vertical separators on desktop
   - Subtle contour pattern

7. **Footer**
   - Minimal design
   - Copyright and links

## Interactive Elements

### Map Preview

The `MarketplaceMapPreview` component includes:

- **Search Bar**: Functional input with demo alert
- **Layer Panel**: Toggle 7 layers (Imagery, Elevation, Buildings, Roads, Hydrography, Land Use, Contours)
- **Toolbar**: 7 tools (Select, Rectangle, Location, Measurement, Layers, Zoom In/Out)
- **Selected Data Card**: Shows active layers, area (12.45 km²), resolution, and price ($1,245 USD)
- **Map Tabs**: Four preview tabs (Imagery, Elevation, Contours, 3D View)
- **AOI Polygon**: Drawn with Atlas Cobalt fill and stroke, with vertex handles

### Header Navigation

- **Desktop**: Horizontal navigation with smooth scroll to sections
- **Mobile**: Hamburger menu with slide-down panel
- **Accessibility**: aria-labels, aria-expanded, keyboard navigation

### Buttons

- **Primary**: Atlas Cobalt background, white text, hover darkens
- **Secondary**: White/pearl background, cobalt text and border
- **Ghost**: Transparent with border

## Responsive Breakpoints

- **Mobile**: < 768px (single column, stacked layout)
- **Tablet**: 768px - 1023px (2-column grids)
- **Desktop**: ≥ 1024px (full layout as specified)
- **Large Desktop**: ≥ 1440px (optimal viewing)

### Mobile Adaptations

- Hero switches to single column
- Map preview moves below hero content
- Navigation collapses to hamburger menu
- Feature cards stack vertically
- Data format tiles adjust to 2 columns then 1
- How It Works becomes vertical stepper
- Trust strip stacks vertically

## Accessibility

### Semantic HTML

- `<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`
- Proper heading hierarchy (h1, h2, h3)
- Descriptive button text

### ARIA Attributes

- `aria-label` on icon buttons
- `aria-expanded` on mobile menu toggle
- `aria-controls` linking toggle to menu
- `aria-hidden="true"` on decorative elements

### Keyboard Navigation

- All interactive elements are keyboard accessible
- Visible focus rings using Atlas Cobalt
- Tab order follows visual order
- Mobile menu closes with Escape key

### Motion

- `prefers-reduced-motion` respected
- Animations disabled when requested
- Smooth scroll can be disabled

## Performance

### Optimization

- Server-side rendering with Next.js App Router
- Static generation where possible
- Minimal JavaScript for interactivity
- CSS-only animations where feasible
- Lazy loading not required (above-the-fold content)

### Bundle Size

Production build:

- Main route: ~5.74 kB
- First Load JS: ~111 kB
- All pages pre-rendered as static content

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Last 2 versions
- No IE11 support

## File Modifications

### New Files Created

1. `/src/components/landing/LandingPage.tsx`
2. `/src/components/landing/LandingHeader.tsx`
3. `/src/components/landing/HeroSection.tsx`
4. `/src/components/landing/HeroContent.tsx`
5. `/src/components/landing/MarketplaceMapPreview.tsx`
6. `/src/components/landing/FeatureStrip.tsx`
7. `/src/components/landing/DataFormatsSection.tsx`
8. `/src/components/landing/HowItWorksSection.tsx`
9. `/src/components/landing/TrustStrip.tsx`

### Modified Files

1. `/src/app/page.tsx` - Now uses LandingPage component
2. `/src/app/layout.tsx` - Updated metadata and body styles
3. `/src/styles/tokens.css` - Added new design system tokens
4. `/src/styles/globals.css` - Updated for new brand colors
5. `/tailwind.config.ts` - Added new color utilities
6. `/src/components/layout/Footer.tsx` - Simplified footer

### Dependencies Added

- `lucide-react` - Icon library for all UI icons

## Running the Project

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Production Build

```bash
npm run build
npm start
```

### Validation

All validation checks pass:

```bash
npm run typecheck  # ✓ TypeScript types valid
npm run lint       # ✓ No ESLint warnings
npm run format     # ✓ Code formatted
npm run build      # ✓ Production build successful
```

## Future Enhancements

### When Map Provider is Configured

Replace the gradient fallback in `MarketplaceMapPreview.tsx` with MapLibre GL JS:

```tsx
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Use NEXT_PUBLIC_MAP_STYLE_URL from environment
const map = new maplibregl.Map({
  container: mapContainerRef.current,
  style: process.env.NEXT_PUBLIC_MAP_STYLE_URL,
  center: [-74.5, 40],
  zoom: 9,
});
```

### When Routes are Connected

Update href values in:

- `LandingHeader.tsx` - Sign In, Get Started
- `HeroContent.tsx` - CTAs
- Navigation links

### When Backend is Ready

- Connect search bar to geocoding API
- Implement real layer toggling with map
- Connect pricing calculation
- Implement Add to Cart functionality

## Visual Validation Checklist

- [x] Header matches reference (70px height, dark background)
- [x] Atlas Cobalt used selectively (~10% of page)
- [x] Polar Pearl is dominant background
- [x] Obsidian Graphite provides contrast
- [x] Hero headline uses cobalt periods
- [x] Map preview includes all panels and controls
- [x] AOI polygon visible in Atlas Cobalt
- [x] Layer panel and Selected Data card legible
- [x] Three feature cards aligned
- [x] Six data format tiles present
- [x] Four workflow steps present
- [x] Four trust pillars present
- [x] Desktop layout professional
- [x] Tablet layout responsive
- [x] Mobile layout functional
- [x] No content overlap
- [x] No text clipping
- [x] No horizontal scroll
- [x] Buttons have consistent states
- [x] Keyboard navigation works
- [x] Design looks premium and production-ready

## Notes

- The map preview uses a fallback gradient since no map style URL is configured
- All demo interactions show appropriate messages
- Layer toggling updates the Selected Data card
- The implementation prioritizes accessibility and performance
- Code follows TypeScript strict mode
- All components are properly typed
- No console errors or warnings
