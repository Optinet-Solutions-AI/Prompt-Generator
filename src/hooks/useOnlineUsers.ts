/**
 * useOnlineUsers — who has the app open right now (Supabase Realtime presence).
 *
 * Each open tab joins one shared channel and announces
 * { id, name, avatar, activity }. When a tab closes, Supabase drops it
 * automatically, so the list is always live. `activity` is what the person is
 * doing ("Video", "Image Library", …) — pages announce it with
 * announceActivity('Video').
 */
import { useEffect, useState } from 'react';
import type { AppUser } from '@/lib/auth-api';
import { supabaseBrowser } from '@/lib/supabase-browser';

export interface OnlineUser {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  activity: string;
}

const ACTIVITY_EVENT = 'pg:activity';
let lastActivity = 'Prompt Generator';

/** Tell everyone what I'm doing (e.g. when switching tabs). */
export function announceActivity(label: string) {
  lastActivity = label;
  window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT, { detail: label }));
}

export function useOnlineUsers(me: AppUser | null): OnlineUser[] {
  const [online, setOnline] = useState<OnlineUser[]>([]);

  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb || !me) return;
    const channel = sb.channel('online-users', { config: { presence: { key: me.id } } });

    const payload = (activity: string): OnlineUser => ({
      id: me.id, name: me.name || me.email.split('@')[0], email: me.email, avatar: me.avatar_url, activity,
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<OnlineUser>();
      // One entry per person even if they have several tabs open (latest wins).
      const byId = new Map<string, OnlineUser>();
      for (const metas of Object.values(state)) for (const m of metas) byId.set(m.id, m);
      setOnline([...byId.values()].sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : a.name.localeCompare(b.name))));
    });

    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') channel.track(payload(lastActivity));
    });

    const onActivity = (e: Event) => { channel.track(payload((e as CustomEvent<string>).detail)); };
    window.addEventListener(ACTIVITY_EVENT, onActivity);

    return () => {
      window.removeEventListener(ACTIVITY_EVENT, onActivity);
      sb.removeChannel(channel);
    };
  }, [me]);

  return online;
}
