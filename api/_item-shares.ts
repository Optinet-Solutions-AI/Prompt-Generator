/**
 * _item-shares.ts — share ONE image or video with specific colleagues.
 *
 * Library sharing (library_shares) shares everything; this shares a single
 * file (item_shares). The viewer sees it under "Shared with me → Individual
 * items"; the server checks the share on every list/stream request.
 *
 * Underscore file = helper, not its own Vercel route.
 */
import { AuthError, sb, getProfileById, type Profile } from './_session.js';
import { userFileMeta, userFilesInFolder, type UserDriveFile } from './_user-drive.js';

export type ItemKind = 'image' | 'video';
const PERSON = 'id,email,name,avatar_url';

const folderKey = (kind: ItemKind) => (kind === 'image' ? 'drive_images_folder_id' : 'drive_videos_folder_id');

function checkArgs(kind: unknown, fileId: unknown): { kind: ItemKind; fileId: string } {
  if (kind !== 'image' && kind !== 'video') throw new AuthError(400, 'kind must be image or video');
  const id = String(fileId || '');
  if (!/^[\w-]{10,}$/.test(id)) throw new AuthError(400, 'invalid file id');
  return { kind, fileId: id };
}

/** Only the owner can share, and only files that really are in their own folder. */
async function assertOwnFile(p: Profile, kind: ItemKind, fileId: string) {
  const folder = p[folderKey(kind)];
  const meta = folder ? await userFileMeta(p, fileId) : null;
  if (!meta || !meta.parents?.includes(folder as string)) {
    throw new AuthError(403, `You can only share ${kind}s from your own library.`);
  }
}

/** Who can currently see this one item (owner's view). */
export async function itemViewers(p: Profile, kindIn: unknown, fileIdIn: unknown) {
  const { kind, fileId } = checkArgs(kindIn, fileIdIn);
  const rows = await sb(`item_shares?owner_id=eq.${p.id}&kind=eq.${kind}&file_id=eq.${encodeURIComponent(fileId)}&select=viewer:profiles!item_shares_viewer_id_fkey(${PERSON})`) as Array<{ viewer: unknown }>;
  return { viewers: rows.map(r => r.viewer).filter(Boolean) };
}

export async function shareItem(p: Profile, body: Record<string, unknown>, add: boolean) {
  const { kind, fileId } = checkArgs(body.kind, body.file_id);
  const viewer = String(body.viewer_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(viewer) || viewer === p.id) throw new AuthError(400, 'Pick someone to share with');
  if (add) {
    await assertOwnFile(p, kind, fileId);
    const target = (await sb(`profiles?id=eq.${viewer}&status=eq.approved&select=id`) as unknown[])[0];
    if (!target) throw new AuthError(404, 'That person is not an approved user of the app');
    await sb('item_shares?on_conflict=owner_id,viewer_id,kind,file_id', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ owner_id: p.id, viewer_id: viewer, kind, file_id: fileId }),
    });
  } else {
    await sb(`item_shares?owner_id=eq.${p.id}&viewer_id=eq.${viewer}&kind=eq.${kind}&file_id=eq.${encodeURIComponent(fileId)}`,
      { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  }
  return { success: true };
}

/** Everything shared with `viewer` one by one, grouped by owner (newest first). */
export async function itemsSharedWithMe(viewer: Profile, kind: ItemKind): Promise<Array<{ owner: Profile; files: UserDriveFile[]; sharedAt: Record<string, string> }>> {
  let rows: Array<{ owner_id: string; file_id: string; created_at: string }> = [];
  try {
    rows = await sb(`item_shares?viewer_id=eq.${viewer.id}&kind=eq.${kind}&select=owner_id,file_id,created_at&order=created_at.desc&limit=500`) as typeof rows;
  } catch (err) {
    // Table not created yet → nothing shared.
    if (err instanceof Error && /item[_-]shares/.test(err.message)) return [];
    throw err;
  }
  const byOwner = new Map<string, Array<{ file_id: string; created_at: string }>>();
  for (const r of rows) byOwner.set(r.owner_id, [...(byOwner.get(r.owner_id) || []), r]);
  const groups = await Promise.all([...byOwner.entries()].map(async ([ownerId, items]) => {
    const owner = await getProfileById(ownerId);
    if (!owner || owner.status !== 'approved') return null;
    const files = await userFilesInFolder(owner, kind === 'image' ? 'images' : 'videos', items.map(i => i.file_id)).catch(() => []);
    return { owner, files, sharedAt: Object.fromEntries(items.map(i => [i.file_id, i.created_at])) };
  }));
  return groups.filter((g): g is NonNullable<typeof g> => !!g && g.files.length > 0);
}
