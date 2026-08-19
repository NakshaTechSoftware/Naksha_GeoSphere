import { NextResponse } from "next/server";

// Reports the current build stamp so the mobile app can detect a newly deployed
// build and reload (see AppVersionCheck.tsx). Never cached - the whole point is
// to reflect a fresh build even when the WebView is holding a stale page.
export async function GET() {
  return NextResponse.json(
    { version: process.env.APP_BUILD_ID ?? "unknown" },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
        Pragma: "no-cache",
      },
    }
  );
}
