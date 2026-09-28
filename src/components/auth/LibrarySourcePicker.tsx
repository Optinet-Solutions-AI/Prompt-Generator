/**
 * LibrarySourcePicker — "Showing: My library ▾" for the Image and Video Libraries.
 *
 * Options: My library · each colleague who shared their library with me ·
 * Team archive (everything made before accounts existed).
 */
import { useEffect, useState } from 'react';
import { Archive, ChevronDown, User, Users } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authApi, firstName, type Person } from '@/lib/auth-api';

export type LibrarySource =
  | { kind: 'mine' }
  | { kind: 'archive' }
  | { kind: 'shared'; ownerId: string; name: string };

/** The `owner` value the list APIs expect. */
export function ownerParam(s: LibrarySource): string {
  return s.kind === 'mine' ? '' : s.kind === 'archive' ? 'archive' : s.ownerId;
}

export function sourceLabel(s: LibrarySource): string {
  return s.kind === 'mine' ? 'My library' : s.kind === 'archive' ? 'Team archive' : `${s.name}'s library`;
}

export function LibrarySourcePicker({ value, onChange }: { value: LibrarySource; onChange: (s: LibrarySource) => void }) {
  const [sharedWithMe, setSharedWithMe] = useState<Person[]>([]);

  useEffect(() => {
    authApi.shares().then(r => setSharedWithMe(r.shared_with_me)).catch(() => setSharedWithMe([]));
  }, []);

  const Icon = value.kind === 'mine' ? User : value.kind === 'archive' ? Archive : Users;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-sm font-medium hover:bg-muted/60">
          <Icon className="w-4 h-4 text-primary" />
          <span className="max-w-[160px] truncate">{sourceLabel(value)}</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuItem onClick={() => onChange({ kind: 'mine' })}>
          <User className="w-4 h-4 mr-2" />My library
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Shared with me</DropdownMenuLabel>
        {sharedWithMe.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Nobody has shared their library with you yet.</p>
        )}
        {sharedWithMe.map(p => (
          <DropdownMenuItem key={p.id} onClick={() => onChange({ kind: 'shared', ownerId: p.id, name: firstName(p) })}>
            {p.avatar_url
              ? <img src={p.avatar_url} alt="" referrerPolicy="no-referrer" className="w-5 h-5 rounded-full mr-2" />
              : <Users className="w-4 h-4 mr-2" />}
            <span className="truncate">{p.name || p.email}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onChange({ kind: 'archive' })}>
          <Archive className="w-4 h-4 mr-2" />
          <span>Team archive <span className="text-xs text-muted-foreground">(before accounts)</span></span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
