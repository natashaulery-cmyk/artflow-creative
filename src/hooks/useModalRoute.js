import { useSearchParams, useNavigate } from "react-router-dom";

// Syncs a sheet's open state to ?modal=open so the native Android back gesture
// closes it instead of leaving the page. `open()` pushes the query param (a new
// history entry); pressing back pops that entry and `isOpen` becomes false.
// `close()` (X button / after save) pops history, mirroring the back gesture.
export function useModalRoute(key = "modal") {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const isOpen = searchParams.get(key) === "open";

  const open = () => {
    const next = new URLSearchParams(searchParams);
    next.set(key, "open");
    setSearchParams(next);
  };

  const close = () => navigate(-1);

  return { isOpen, open, close };
}