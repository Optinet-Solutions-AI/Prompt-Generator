// The icon for each screen. Used by the sidebar and the Home page, so both
// always show the same picture for the same screen.
import { House, Sparkles, Trophy, Video, Images, Clapperboard, Share2, Mail, type LucideIcon } from 'lucide-react';
import type { ScreenId } from '@/lib/nav/screens';

export const SCREEN_ICONS: Record<ScreenId, LucideIcon> = {
  home: House,
  custom: Sparkles,
  sports: Trophy,
  video: Video,
  images: Images,
  videos: Clapperboard,
  shared: Share2,
  email: Mail,
};
