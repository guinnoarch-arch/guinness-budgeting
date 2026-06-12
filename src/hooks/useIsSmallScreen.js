import { useEffect, useState } from "react";

export default function useIsSmallScreen(query = "(max-width: 640px)") {
  const [matches, setMatches] = useState(() => (
    typeof window !== "undefined" && window.matchMedia?.(query).matches
  ));

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);

    update();
    mediaQuery.addEventListener?.("change", update);
    return () => mediaQuery.removeEventListener?.("change", update);
  }, [query]);

  return matches;
}
