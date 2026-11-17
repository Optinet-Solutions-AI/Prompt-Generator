import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import ImageLibrary from "./pages/ImageLibrary";
import VideoLibrary from "./pages/VideoLibrary";
import NotFound from "./pages/NotFound";
import Home from "./pages/Home";
import SharedWithMe from "./pages/SharedWithMe";
import AssistantPage from "./pages/AssistantPage";
import { AuthProvider } from "@/hooks/useAuth";
import { AuthGate } from "@/components/auth/AuthGate";
import { AppFrame } from "@/components/layout/AppFrame";
import { LEGACY_REDIRECTS } from "@/lib/nav/screens";

const queryClient = new QueryClient();

/** Old addresses (/library, /video-library) forward to their new ones, keeping any ?query. */
function LegacyRedirect() {
  const { pathname, search } = useLocation();
  // The router also matches "/Library/" here, so tidy the address before looking it up.
  const target = LEGACY_REDIRECTS[pathname.toLowerCase().replace(/\/+$/, '')] ?? '/';
  return <Navigate to={target + search} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* AI Assistant tester links use their own token — no Google sign-in. */}
            <Route path="/assistant/:token" element={<AssistantPage />} />
            {/* Everything else needs sign-in (and approval), and shows inside the frame
                (sidebar + top bar). The frame draws the pages below in its <Outlet/>. */}
            <Route element={<AuthGate><AppFrame /></AuthGate>}>
              {/* Home — the start page */}
              <Route index element={<Home />} />
              {/* Work screens: the frame itself draws these (kept loaded while you move around), so nothing here. */}
              <Route path="custom" element={null} />
              <Route path="sports" element={null} />
              <Route path="video" element={null} />
              <Route path="email-content-checker" element={null} />
              <Route path="library/images" element={<ImageLibrary />} />
              <Route path="library/videos" element={<VideoLibrary />} />
              {/* Shared with me — every library you can open besides your own */}
              <Route path="shared" element={<SharedWithMe />} />
              {/* Old addresses */}
              <Route path="library" element={<LegacyRedirect />} />
              <Route path="video-library" element={<LegacyRedirect />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
