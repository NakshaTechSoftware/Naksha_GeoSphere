# Naksha GeoSphere Frontend

This is the frontend application for **Naksha GeoSphere** - The Geospatial Data Marketplace.

## Overview

A premium Next.js application that provides a professional interface for users to:

- Search and explore geospatial locations
- Preview various data formats (Imagery, Elevation, LiDAR, Vector layers)
- Select Areas of Interest (AOI)
- View pricing and purchase geospatial data
- Download datasets securely

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **React**: 19.0.0
- **Styling**: Tailwind CSS 3.4
- **Maps**: MapLibre GL JS 4.7
- **TypeScript**: 5.7
- **Testing**: Vitest + Playwright
- **Linting**: ESLint + Prettier

## Design System

### Color Palette (60-30-10 Rule)

- **Polar Pearl** (`#F6F8FB`) - 60%: Primary backgrounds, surfaces
- **Obsidian Graphite** (`#151A23`) - 30%: Headers, text, dark surfaces
- **Atlas Cobalt** (`#3563E9`) - 10%: CTAs, accents, active states

### Design Principles

- Premium visual quality
- Enterprise-grade appearance
- Geospatial and technical aesthetic
- Accessible and responsive
- Clean, minimal interface

## Project Structure

```
frontend/
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── layout.tsx       # Root layout
│   │   └── page.tsx         # Home/landing page
│   ├── components/          # React components
│   │   ├── landing/         # Landing page components
│   │   ├── layout/          # Layout components (Header, Footer)
│   │   ├── map/             # Map-related components
│   │   └── ui/              # Reusable UI components
│   ├── lib/                 # Utilities and helpers
│   │   ├── api-client.ts    # API communication
│   │   ├── cn.ts            # Class name utilities
│   │   └── config.ts        # App configuration
│   ├── styles/              # Global styles
│   │   ├── globals.css      # Global CSS
│   │   └── tokens.css       # Design tokens
│   └── types/               # TypeScript type definitions
├── public/                  # Static assets
├── tests/                   # Test files
└── package.json
```

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# or
yarn install
```

### Development

```bash
# Start development server
npm run dev

# or
yarn dev
```

The application will be available at [http://localhost:3000](http://localhost:3000)

### Available Scripts

```bash
# Development
npm run dev          # Start dev server

# Building
npm run build        # Build for production
npm start            # Start production server

# Code Quality
npm run lint         # Run ESLint
npm run typecheck    # Run TypeScript type checking
npm run format       # Format code with Prettier
npm run format:check # Check code formatting

# Testing
npm test             # Run unit tests
npm run test:watch   # Run tests in watch mode
npm run test:e2e     # Run e2e tests with Playwright
```

## Environment Variables

Create a `.env.local` file in the root of the frontend directory:

```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8000

# App Configuration
NEXT_PUBLIC_APP_NAME=Naksha GeoSphere

# Map Configuration (optional)
NEXT_PUBLIC_MAP_STYLE_URL=your_map_style_url_here
```

## Component Architecture

### UI Components

Reusable, accessible components following design system tokens:

- `Button` - Primary, secondary, and ghost variants
- `Card` - Container component with consistent styling
- `Badge` - Status and category indicators
- `Container` - Page-width container with responsive padding
- `StatusIndicator` - Service health indicators

### Landing Page Components

Purpose-built components for the welcome page:

- `LandingHeader` - Premium navigation header
- `HeroSection` - Hero content with CTA
- `MarketplaceMapPreview` - Interactive map preview
- `FeatureStrip` - Three-feature cards
- `DataFormatsSection` - Supported data formats
- `HowItWorksSection` - Workflow steps
- `TrustStrip` - Trust and value propositions

## Styling Guidelines

### Tailwind CSS

- Use design tokens defined in `tokens.css`
- Follow 60-30-10 color distribution
- Maintain consistent spacing scale
- Use semantic color variables

### Component Styling

```tsx
// Good: Using design tokens
className = "bg-[var(--color-page-background)] text-[var(--color-primary-text)]";

// Avoid: Hard-coding colors
className = "bg-gray-100 text-gray-900";
```

## Accessibility

- Semantic HTML elements
- Proper ARIA attributes
- Keyboard navigation support
- Visible focus states
- Sufficient color contrast
- Screen reader compatibility

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Last 2 versions
- No IE11 support

## Performance

- Server-side rendering (SSR) with Next.js
- Image optimization with next/image
- Code splitting by route
- Optimized for Core Web Vitals

## Contributing

1. Follow existing code patterns
2. Maintain TypeScript strict mode
3. Write tests for new features
4. Run linting and type checking before commit
5. Use Prettier for code formatting

## Docker Support

### Development

```bash
docker build -f Dockerfile -t naksha_frontend:dev --target=development .
docker run -p 3000:3000 naksha_frontend:dev
```

### Production

```bash
docker build -f Dockerfile -t naksha_frontend:latest .
docker run -p 3000:3000 naksha_frontend:latest
```

## Related Documentation

- [Architecture](../docs/ARCHITECTURE.md)
- [Development Guide](../docs/DEVELOPMENT_GUIDE.md)
- [Deployment](../docs/DEPLOYMENT.md)
- [Local Setup](../docs/LOCAL_SETUP.md)

## License

This project is part of the Naksha GeoSphere platform.
