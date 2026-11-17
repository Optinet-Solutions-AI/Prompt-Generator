/**
 * AppFrame — the frame around every signed-in screen.
 *
 *   ┌──────────┬──────────────────────────────────────────┐
 *   │          │ [☰] | Screen name      who's online · me │  ← top bar
 *   │ sidebar  │ (Connect Google Drive bar, when needed)  │
 *   │          │ the work screens (kept loaded, hidden)   │
 *   │          │ the other pages (<Outlet/>)               │
 *   └──────────┴──────────────────────────────────────────┘
 *
 * The address decides what shows: a work screen (Custom prompt, Sports banner,
 * Video, Email checker) or one of the other pages (Home, libraries, …).
 */
import { useCallback, useEffect, useState } from 'react';
import { Menu, PanelLeft } from 'lucide-react';
import { Outlet, useLocation } from 'react-router-dom';
import { SidebarInset, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { UserBar } from '@/components/auth/UserBar';
import { ConnectDriveBar } from '@/components/auth/AuthGate';
import { useAuth } from '@/hooks/useAuth';
import { announceActivity } from '@/hooks/useOnlineUsers';
import { SCREENS, LAST_SCREEN_KEY, activeScreenForLocation, workScreenForPath } from '@/lib/nav/screens';
import { AppSidebar } from './AppSidebar';
import { WorkScreens, type BusyState } from './WorkScreens';

// Browser-storage key that remembers whether the sidebar is open or shrunk.
const SIDEBAR_OPEN_KEY = 'pg_sidebarOpen';

/** The button that opens the sidebar: a ☰ menu icon on phones, the panel icon on bigger screens. */
function MenuButton() {
  const { isMobile, toggleSidebar } = useSidebar();
  const label = isMobile ? 'Open menu' : 'Toggle sidebar';
  return (
    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleSidebar} aria-label={label} title={label}>
      {isMobile ? <Menu /> : <PanelLeft />}
    </Button>
  );
}

export function AppFrame() {
  const { pathname, search } = useLocation();
  const { user, driveConnected } = useAuth();

  // Sidebar open/shrunk, remembered in the browser (open unless saved as 'false').
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_OPEN_KEY) !== 'false'; } catch { return true; }
  });
  const handleSidebarOpenChange = useCallback((open: boolean) => {
    setSidebarOpen(open);
    try { localStorage.setItem(SIDEBAR_OPEN_KEY, String(open)); } catch { /* ignore */ }
  }, []);

  // Which work screens are still busy (shown as pulsing dots in the sidebar).
  const [busy, setBusy] = useState<BusyState>({ custom: false, video: false });

  // Moving to another page starts at the top (the browser doesn't do this by itself).
  // Only the page path matters, so changing a filter in the address doesn't jump.
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  // Each time the screen changes: tell the "who's online" list what I'm doing,
  // and remember the screen for Home's "Continue where you left off".
  // (A library showing someone else's items counts as "Shared with me".)
  useEffect(() => {
    const id = activeScreenForLocation(pathname, search);
    const screen = SCREENS.find(s => s.id === id);
    if (!screen) return;
    announceActivity(screen.activity);
    if (screen.id !== 'home') {
      try { localStorage.setItem(LAST_SCREEN_KEY, screen.id); } catch { /* ignore */ }
    }
  }, [pathname, search]);

  // The name of the open screen, shown next to the menu button (on a phone the
  // sidebar is hidden, so this is how you know where you are).
  const current = SCREENS.find(s => s.id === activeScreenForLocation(pathname, search));

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={handleSidebarOpenChange}>
      <AppSidebar busy={busy} />
      {/* min-w-0 lets wide pages shrink to fit next to the sidebar instead of pushing past the screen edge */}
      <SidebarInset className="min-w-0">
        {/* Top bar: menu button + screen name on the left, who's online + my account on the right */}
        <div className="flex items-center justify-between">
          <div className="pl-3 sm:pl-5 pt-3 flex items-center gap-3 min-w-0">
            <MenuButton />
            {current && (
              <>
                <span className="h-4 w-px bg-border shrink-0" aria-hidden="true" />
                <span className="text-sm font-medium text-foreground/80 truncate">{current.label}</span>
              </>
            )}
          </div>
          <UserBar />
        </div>
        {user?.has_google === false && !driveConnected && <ConnectDriveBar />}

        <WorkScreens visible={workScreenForPath(pathname)} onBusyChange={setBusy} />
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
