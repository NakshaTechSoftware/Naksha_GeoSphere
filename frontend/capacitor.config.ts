import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.naksha.nmaps',
  appName: 'N-MAPS',
  webDir: 'out',
  // Development mode: the app is a shell that loads the live Next.js dev server over the
  // LAN, so every code change hot-reloads on the phone. The phone must be on the same
  // Wi-Fi network as this machine.
  //
  // For production (Play Store / App Store) this must point at the hosted, HTTPS app URL
  // (e.g. https://app.n-maps.example) - or, if the app is ever statically exported, the
  // webDir assets below can be bundled instead and this block removed entirely.
  server: {
    // Public tunnel URL - the app works over cellular/mobile internet too, not just
    // the local Wi-Fi. NOTE: this trycloudflare URL is ephemeral - it changes every time
    // the tunnel restarts, so the APK only works while THIS tunnel instance is running.
    // For a stable URL, use a cloudflared named tunnel or a hosted server.
    url: 'https://creativity-nut-foods-indicates.trycloudflare.com',
    cleartext: true,
  },
  android: {
    // Allow plain-HTTP access to the LAN dev server. Remove once server.url is HTTPS.
    allowMixedContent: true,
  },
};

export default config;
