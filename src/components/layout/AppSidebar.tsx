/**
 * AppSidebar — the menu on the left of every signed-in screen.
 *
 *   logo + "AI Prompt Generator" (goes Home)
 *   Home
 *   CREATE:    Custom prompt, Sports banner, Video
 *   LIBRARIES: My images, My videos, Shared with me
 *   TOOLS:     Email checker
 *
 * The screen you are on is highlighted. A small pulsing dot shows next to a
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
            <SidebarMenuButton asChild size="lg" tooltip="AI Prompt Generator">
              <Link to="/" onClick={closeOnPhone}>
                <img src="/logo.svg" alt="" className="size-8 shrink-0" />
                <span className="font-semibold">AI Prompt Generator</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {GROUPS.map(group => (
          <SidebarGroup key={group.id}>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {SCREENS.filter(s => s.group === group.id).map(screen => {
                  const Icon = SCREEN_ICONS[screen.id];
                  return (
                    <SidebarMenuItem key={screen.id}>
                      <SidebarMenuButton asChild isActive={active === screen.id} tooltip={screen.label}>
                        <Link to={screen.path} onClick={closeOnPhone}>
                          <Icon />
                          <span>{screen.label}</span>
                          {isWorking(screen.id) && (
                            // When the menu is shrunk to icons, the dot sits on the icon's corner.
                            <span
                              className="w-2 h-2 rounded-full bg-primary animate-pulse ml-auto shrink-0 group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:top-1 group-data-[collapsible=icon]:right-1"
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
