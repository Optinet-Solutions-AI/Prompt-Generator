/**
 * AppSidebar — the menu on the left of every signed-in screen.
 *
 *   logo + "AI Prompt Generator" (goes Home)
 *   Home
 *   Create:    Custom prompt, Sports banner, Video
 *   Libraries: My images, My videos, Shared with me
 *   Tools:     Email checker
 *
 * It is dark (the logo's deep indigo) so it frames the light work area.
 * The screen you are on is highlighted and gets a small indigo-to-pink bar
 * on its left edge (the logo's colours). A small pulsing dot shows next to a
 * screen that is still working (a prompt/image or a video being made).
 * On a computer it can be shrunk to a strip of icons; on a phone it slides in
 * from the left and closes when you pick something.
 */
import { Link, useLocation } from 'react-router-dom';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar';
import { SCREENS, GROUP_LABELS, activeScreenForLocation, type ScreenId, type ScreenInfo } from '@/lib/nav/screens';
import { SCREEN_ICONS } from './screen-icons';
import type { BusyState } from './WorkScreens';

// Look of one menu item: a bit taller than the default, lavender icon, and the
// open screen gets white text plus the indigo-to-pink bar on its left edge.
const ITEM_CLASS = [
  'relative h-9 text-[13.5px] [&>svg]:text-sidebar-foreground/80',
  'data-[active=true]:[&>svg]:text-white data-[active=true]:shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06)]',
  "before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:content-['']",
  'before:bg-gradient-to-b before:from-indigo-400 before:to-fuchsia-400 before:opacity-0 data-[active=true]:before:opacity-100',
  'group-data-[collapsible=icon]:before:top-1.5 group-data-[collapsible=icon]:before:bottom-1.5',
].join(' ');

// The sections of the menu, top to bottom. Home has no heading.
const GROUPS: { id: ScreenInfo['group']; label: string | null }[] = [
  { id: 'home', label: null },
  { id: 'create', label: GROUP_LABELS.create },
  { id: 'libraries', label: GROUP_LABELS.libraries },
  { id: 'tools', label: GROUP_LABELS.tools },
];

export function AppSidebar({ busy }: { busy: BusyState }) {
  const { pathname, search } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const active = activeScreenForLocation(pathname, search);

  // On a phone the menu covers the screen, so close it after a choice.
  const closeOnPhone = () => {
    if (isMobile) setOpenMobile(false);
  };

  // Which screens get the pulsing "working" dot.
  const isWorking = (id: ScreenId) => (id === 'custom' && busy.custom) || (id === 'video' && busy.video);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="AI Prompt Generator" className="hover:bg-transparent">
              <Link to="/" onClick={closeOnPhone}>
                <img src="/logo.svg" alt="" className="size-8 shrink-0 drop-shadow-[0_4px_12px_rgba(192,38,211,0.35)]" />
                <span className="font-display text-[15px] font-semibold tracking-tight text-white">AI Prompt Generator</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {GROUPS.map(group => (
          <SidebarGroup key={group.id}>
            {group.label && <SidebarGroupLabel className="text-xs text-sidebar-foreground/60">{group.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {SCREENS.filter(s => s.group === group.id).map(screen => {
                  const Icon = SCREEN_ICONS[screen.id];
                  return (
                    <SidebarMenuItem key={screen.id}>
                      <SidebarMenuButton asChild isActive={active === screen.id} tooltip={screen.label} className={ITEM_CLASS}>
                        <Link to={screen.path} onClick={closeOnPhone}>
                          <Icon />
                          <span>{screen.label}</span>
                          {isWorking(screen.id) && (
                            // When the menu is shrunk to icons, the dot sits on the icon's corner.
                            <span
                              className="w-2 h-2 rounded-full bg-fuchsia-400 shadow-[0_0_0_3px_rgba(232,121,249,0.25)] animate-pulse ml-auto shrink-0 group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:top-1 group-data-[collapsible=icon]:right-1"
                              role="img"
                              aria-label="working"
                            />
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
