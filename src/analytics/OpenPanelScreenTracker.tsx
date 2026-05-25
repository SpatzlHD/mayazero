import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { trackOpenPanelScreenView } from "./openpanel";

export function OpenPanelScreenTracker() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  useEffect(() => {
    trackOpenPanelScreenView(pathname);
  }, [pathname]);

  return null;
}
