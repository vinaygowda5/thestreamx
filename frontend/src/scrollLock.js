import { useEffect } from "react";

// While a full-screen overlay (player, legal page...) is open, lock the page
// behind it so only ONE scrollbar is ever visible.
let locks = 0;
export function useBodyScrollLock() {
  useEffect(() => {
    locks++;
    document.documentElement.classList.add("sx-locked");
    return () => {
      locks--;
      if (locks <= 0) { locks = 0; document.documentElement.classList.remove("sx-locked"); }
    };
  }, []);
}