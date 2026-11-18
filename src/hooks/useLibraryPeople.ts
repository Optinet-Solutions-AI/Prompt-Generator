import { useEffect, useState } from 'react';
import { authApi } from '@/lib/auth-api';
import type { LibraryPeople } from '@/lib/nav/library-labels';

/**
 * Loads, once per library page, the people whose libraries I can open.
 * The page heading and the "Showing" picker both use it, so they show the same name.
 */
export function useLibraryPeople(): LibraryPeople {
  const [people, setPeople] = useState<LibraryPeople>({ sharedWithMe: [], everyone: [] });
  useEffect(() => {
    authApi.shares()
      // `everyone` is sent to admins only
      .then(r => setPeople({ sharedWithMe: r.shared_with_me, everyone: r.everyone || [] }))
      .catch(() => setPeople({ sharedWithMe: [], everyone: [] }));
  }, []);
  return people;
}
