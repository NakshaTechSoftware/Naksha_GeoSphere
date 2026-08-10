import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** Returns true when the user prefers reduced motion (respects the OS setting). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia(QUERY).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
