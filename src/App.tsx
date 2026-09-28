import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import ImageLibrary from "./pages/ImageLibrary";
import VideoLibrary from "./pages/VideoLibrary";
import NotFound from "./pages/NotFound";
import AssistantPage from "./pages/AssistantPage";
import EmailContentChecker from "./pages/EmailContentChecker";
import { AuthProvider } from "@/hooks/useAuth";
import { AuthGate } from "@/components/auth/AuthGate";

const queryClient = new QueryClient();

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
            {/* Everything else needs Sign in with Google (and approval). */}
            <Route
              path="/*"
              element={
                <AuthGate>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/library" element={<ImageLibrary />} />
                    <Route path="/video-library" element={<div className="container mx-auto p-6"><VideoLibrary /></div>} />
                    <Route path="/email-content-checker" element={<EmailContentChecker />} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </AuthGate>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
