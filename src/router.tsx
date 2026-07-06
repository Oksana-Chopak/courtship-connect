import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// After every Lovable rebuild, any tab/installed PWA opened BEFORE the deploy
// still holds the old HTML and will lazy-import route chunks that no longer
// exist — which throws during render and trips the error boundary ("hit a
// snag"). Vite fires `vite:preloadError` for exactly this case: reload once to
// pick up the fresh build. The sessionStorage guard prevents reload loops.
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event: Event) => {
    event.preventDefault();
    const KEY = "courtship.chunkReloadedAt";
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last > 30_000) {
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
    }
  });
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
