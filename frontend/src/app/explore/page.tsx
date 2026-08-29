"use client";

import { ExplorePage } from "@/components/explore/ExplorePage";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getStoredUserSession } from "@/lib/userSession";

/**
 * Wraps the explore page: unauthenticated users can only pan and zoom the map.
 * Any click (on place names, buttons, map features, etc.) redirects to /signup.
 */
export default function Explore() {
  const router = useRouter();
  const redirected = useRef(false);
  const dragRef = useRef({ startX: 0, startY: 0, dragged: false });

  useEffect(() => {
    if (getStoredUserSession()) return;

    const onDown = (e: MouseEvent) => {
      dragRef.current = { startX: e.clientX, startY: e.clientY, dragged: false };
    };
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d.dragged && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 8) {
        d.dragged = true;
      }
    };
    const onUp = (e: MouseEvent) => {
      if (redirected.current) return;
      // If the user dragged (panned), don't redirect
      if (dragRef.current.dragged) return;
      redirected.current = true;
      router.push("/signup");
    };

    window.addEventListener("mousedown", onDown, { capture: true });
    window.addEventListener("mousemove", onMove, { capture: true });
    window.addEventListener("mouseup", onUp, { capture: true, passive: true });
    return () => {
      window.removeEventListener("mousedown", onDown, { capture: true });
      window.removeEventListener("mousemove", onMove, { capture: true });
      window.removeEventListener("mouseup", onUp, { capture: true });
    };
  }, [router]);

  return <ExplorePage />;
}
