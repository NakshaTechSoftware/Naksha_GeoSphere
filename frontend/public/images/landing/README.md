# Landing Page Assets

## Map Preview

To use a real map preview instead of the CSS gradient:

1. Create a map preview image: `map-preview.webp` or `map-preview.png`
2. Place it in this directory
3. Update `MarketplaceMapPreview.tsx` to use the image

```tsx
<Image src="/images/landing/map-preview.webp" alt="Map preview" fill className="object-cover" />
```

## Map Provider Integration

When a map style URL is configured:

1. Set `NEXT_PUBLIC_MAP_STYLE_URL` in `.env.local`
2. Use MapLibre GL JS to render the actual map
3. Add real geographic data layers

See `IMPLEMENTATION.md` for details.
