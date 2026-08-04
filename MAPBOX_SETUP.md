# Mapbox Satellite Imagery Setup (FREE)

Mapbox provides the highest quality satellite imagery with accurate place names, similar to Google Earth.

## Free Tier:
- 200,000 tile requests per month (FREE)
- No credit card required
- Accurate labels in local languages
- High-resolution satellite imagery

## Setup Instructions:

1. **Get Free API Key:**
   - Go to: https://account.mapbox.com/auth/signup/
   - Sign up for free account
   - Go to: https://account.mapbox.com/access-tokens/
   - Copy your "Default public token" (starts with `pk.`)

2. **Add to `.env` file:**
   ```env
   NEXT_PUBLIC_MAPBOX_TOKEN=pk.YOUR_TOKEN_HERE
   ```

3. **Restart the frontend:**
   ```bash
   cd frontend
   npm run dev
   ```

The map will automatically use Mapbox satellite imagery with accurate place names!

## Alternative Free Options:

If you don't want to sign up for Mapbox, the code will fall back to:
- ESRI World Imagery (satellite)
- Stadia Maps terrain labels (OpenStreetMap based)

But Mapbox is recommended for the best accuracy and quality.
