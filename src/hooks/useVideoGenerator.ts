/**
 * useVideoGenerator — state for the Video tab.
 *
 * Flow:  FORM → RENDERING (poll Higgsfield every 5s) → RESULT
 *                     ↘ on any failure → back to FORM with an error message
 *
 * Generation runs on the Higgsfield PLAN credits of the connected account
 * (the "Connect Higgsfield" card). When a render finishes, the server stamps
 * the brand (corner logo + end card) and saves it to the Video Drive folder,
 * so it shows up in the Video Library without an extra click.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildUgcPrompt, EMPTY_VIDEO_FORM, UGC_STYLES, type CustomBusiness, type VideoFormData, type VideoMode } from '@/lib/ugc-video';
import { findIndustry } from '@/lib/ugc-industries';
import { videoApi, type LibraryVideo } from '@/lib/video-api';

export type VideoAppState = 'FORM' | 'RENDERING' | 'RESULT';

const POLL_MS = 5000;
const MAX_WAIT_MS = 15 * 60 * 1000; // give up after 15 minutes

export interface VideoResult {
  /** What the player shows: the raw Higgsfield file first, then the branded Drive copy once saved. */
  previewUrl: string;
  saved: LibraryVideo | null;
  saving: boolean;
  saveError: string;
  /** Set when the video saved fine but the logo/end card couldn't be added. */
  brandError: string;
}

export function useVideoGenerator() {
  const [form, setForm] = useState<VideoFormData>(EMPTY_VIDEO_FORM);
  // The prompt is built from the fields, but the user can edit it by hand.
  // Once they do, we stop overwriting it until they press "Rebuild".
  const [prompt, setPrompt] = useState('');
  const [promptEdited, setPromptEdited] = useState(false);

  const [appState, setAppState] = useState<VideoAppState>('FORM');
  const [statusText, setStatusText] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<VideoResult | null>(null);

  // Higgsfield connection ("Connected as …" / "Connect Higgsfield")
  // One shared TEAM connection for everyone; only admins can change it (canManage).
  const [connection, setConnection] = useState<{ loading: boolean; connected: boolean; email: string | null; canManage: boolean; error: string }>(
    { loading: true, connected: false, email: null, canManage: false, error: '' },
  );
  // Credits the current settings would cost (null = unknown / not connected)
  const [cost, setCost] = useState<{ loading: boolean; credits: number | null }>({ loading: false, credits: null });

  const cancelled = useRef(false);

  useEffect(() => {
    if (!promptEdited) setPrompt(buildUgcPrompt(form));
  }, [form, promptEdited]);

  const refreshConnection = useCallback(async () => {
    setConnection(c => ({ ...c, loading: true, error: '' }));
    try {
      const s = await videoApi.hfStatus();
      setConnection({ loading: false, connected: s.connected, email: s.email, canManage: !!s.can_manage, error: '' });
    } catch (e) {
      setConnection({ loading: false, connected: false, email: null, canManage: false, error: e instanceof Error ? e.message : 'Could not check the connection' });
    }
  }, []);
  useEffect(() => { refreshConnection(); }, [refreshConnection]);

  // Price check whenever the settings that affect cost change (debounced so
  // typing in the prompt doesn't fire a request per keystroke).
  useEffect(() => {
    if (!connection.connected || !prompt.trim()) { setCost({ loading: false, credits: null }); return; }
    setCost(c => ({ ...c, loading: true }));
    const t = setTimeout(async () => {
      try {
        const { credits } = await videoApi.cost({
          prompt, model: form.model, aspectRatio: form.aspectRatio, duration: form.duration, audio: form.audio,
        });
        setCost({ loading: false, credits });
      } catch {
        setCost({ loading: false, credits: null });
      }
    }, 800);
    return () => clearTimeout(t);
    // Cost depends on model/duration/ratio/audio, not the exact wording — but
    // the server needs a prompt, so re-check only when it goes empty/non-empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.connected, form.model, form.aspectRatio, form.duration, form.audio, !!prompt.trim()]);

  // Elapsed-seconds counter while rendering.
  useEffect(() => {
    if (appState !== 'RENDERING') return;
    const t0 = Date.now();
    setElapsed(0);
    const t = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(t);
  }, [appState]);

  const setField = useCallback(<K extends keyof VideoFormData>(key: K, value: VideoFormData[K]) => {
    setForm(f => ({ ...f, [key]: value }));
  }, []);

  /** Choosing a UGC style pre-fills the creator/setting/action/camera fields. */
  const applyStyle = useCallback((styleId: string) => {
    const s = UGC_STYLES.find(x => x.id === styleId);
    if (!s) return;
    setForm(f => ({ ...f, styleId, creator: s.creator, setting: s.setting, action: s.action, camera: s.camera }));
  }, []);

  // ── "Custom business" mode ──
  const setMode = useCallback((mode: VideoMode) => {
    // Switching mode clears the style fields so a brand preset never leaks into a clinic ad.
    setForm(f => ({ ...f, mode, styleId: '', creator: '', setting: '', action: '', camera: '', dialogue: '' }));
  }, []);

  const setCustom = useCallback(<K extends keyof CustomBusiness>(key: K, value: CustomBusiness[K]) => {
    setForm(f => ({ ...f, custom: { ...f.custom, [key]: value } }));
  }, []);

  /**
   * Load a saved business (or a blank one) into the form. A real business
   * gets its first format filled in straight away (★ business-specific first,
   * else the industry's best one) so the form is never a wall of empty boxes.
   */
  const loadBusiness = useCallback((b: CustomBusiness) => {
    const first = b.name.trim() ? (b.presets[0] || findIndustry(b.industry)?.styles[0]) : undefined;
    setForm(f => ({
      ...f, custom: first ? { ...b, tagline: b.tagline || first.endCard } : b,
      styleId: first?.id || '', creator: first?.creator || '', setting: first?.setting || '', action: first?.action || '',
      camera: first?.camera || '', dialogue: first?.line || '', hook: (first as { hook?: string } | undefined)?.hook || '',
    }));
  }, []);

  /** Industry preset → fields + its suggested spoken line + end-card line (if still empty). */
  const applyIndustryStyle = useCallback((styleId: string) => {
    setForm(f => {
      // Formats written for this business (from its website research) come first.
      const st = [...f.custom.presets, ...(findIndustry(f.custom.industry)?.styles || [])].find(x => x.id === styleId);
      if (!st) return f;
      return {
        ...f, styleId, creator: st.creator, setting: st.setting, action: st.action, camera: st.camera, dialogue: st.line,
        hook: (st as { hook?: string }).hook || f.hook,
        custom: { ...f.custom, tagline: f.custom.tagline || st.endCard },
      };
    });
  }, []);

  // ── "✨ Write the script for me" (optional) ──
  const [writing, setWriting] = useState(false);
  const writeScript = useCallback(async () => {
    const c = form.custom;
    const fmt = [...c.presets, ...(findIndustry(c.industry)?.styles || [])].find(x => x.id === form.styleId);
    setWriting(true); setError('');
    try {
      const s = await videoApi.writeScript({
        business: { name: c.name, industry: c.industry, promote: c.promote, research: c.research },
        format: fmt ? { label: fmt.label, creator: fmt.creator, setting: fmt.setting, action: fmt.action, camera: fmt.camera } : null,
        duration: form.duration, audio: form.audio,
      });
      setForm(f => ({ ...f, creator: s.creator, setting: s.setting, action: s.action, camera: s.camera, dialogue: s.line || f.dialogue, hook: s.hook || f.hook }));
      setPromptEdited(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write the script');
    } finally { setWriting(false); }
  }, [form.custom, form.styleId, form.duration, form.audio]);

  const editPrompt = useCallback((text: string) => { setPrompt(text); setPromptEdited(true); }, []);
  const rebuildPrompt = useCallback(() => setPromptEdited(false), []);

  const connect = useCallback(async () => {
    try {
      const { url } = await videoApi.hfConnect();
      window.location.href = url; // Higgsfield sign-in, then back to /?hf=connected
    } catch (e) {
      setConnection(c => ({ ...c, error: e instanceof Error ? e.message : 'Could not start sign-in' }));
    }
  }, []);

  const disconnectHf = useCallback(async () => {
    try { await videoApi.hfDisconnect(); } finally { await refreshConnection(); }
  }, [refreshConnection]);

  const generate = useCallback(async () => {
    if (!connection.connected) { setError('Connect your Higgsfield account first (top of this tab).'); return; }
    const brandName = form.mode === 'custom' ? form.custom.name.trim() : form.brand;
    if (!brandName) { setError(form.mode === 'custom' ? 'Enter the business name first.' : 'Select a brand first.'); return; }
    if (!prompt.trim()) { setError('The prompt is empty — pick a UGC style or fill the fields.'); return; }

    cancelled.current = false;
    setError('');
    setResult(null);
    setAppState('RENDERING');
    setStatusText('Sending to Higgsfield…');

    try {
      const { request_id } = await videoApi.submit({
        prompt, brand: brandName, model: form.model, aspectRatio: form.aspectRatio, duration: form.duration, audio: form.audio,
        startImage: form.startImage || undefined,
      });

      // Poll until Higgsfield reports a final status.
      const started = Date.now();
      let videoUrl: string | null = null;
      while (!cancelled.current) {
        if (Date.now() - started > MAX_WAIT_MS) throw new Error('Timed out waiting for Higgsfield (15 min).');
        await new Promise(r => setTimeout(r, POLL_MS));
        if (cancelled.current) return;
        const s = await videoApi.status(request_id);
        if (s.status === 'completed' && s.video_url) { videoUrl = s.video_url; break; }
        if (['failed', 'nsfw', 'canceled', 'cancelled'].includes(s.status)) {
          throw new Error(s.status === 'nsfw'
            ? 'Higgsfield blocked this prompt as unsafe — try rewording it.'
            : s.error || `Higgsfield ${s.status}`);
        }
        setStatusText(['queued', 'pending'].includes(s.status) ? 'Waiting in Higgsfield queue…' : 'Rendering video…');
      }
      if (!videoUrl) return;

      // Show the raw video immediately, then brand + save it in the background.
      setResult({ previewUrl: videoUrl, saved: null, saving: true, saveError: '', brandError: '' });
      setAppState('RESULT');
      try {
        const out = await videoApi.save({
          video_url: videoUrl, brand: brandName, prompt, aspectRatio: form.aspectRatio, duration: form.duration,
          model: form.model, brandLogo: form.brandLogo, brandEndCard: form.brandEndCard,
          hook: form.hook, hookOn: form.hookOn,
          ...(form.mode === 'custom' ? {
            mode: 'custom' as const,
            custom: { industry: form.custom.industry, color: form.custom.color, accent: form.custom.accent, tagline: form.custom.tagline, logo: form.custom.logo },
          } : {}),
        });
        // Switch the player to the saved (branded) copy.
        setResult(r => r && { ...r, saved: out.file, saving: false, previewUrl: out.file.video_url, brandError: out.brand_error || '' });
      } catch (e) {
        setResult(r => r && { ...r, saving: false, saveError: e instanceof Error ? e.message : 'Save failed' });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setAppState('FORM');
      // A lost login shows up as an error here — re-check so the card updates.
      refreshConnection();
    }
  }, [form, prompt, connection.connected, refreshConnection]);

  const cancel = useCallback(() => { cancelled.current = true; setAppState('FORM'); }, []);
  /** "Edit" — back to the form with every field and the prompt kept. */
  const backToEdit = useCallback(() => setAppState('FORM'), []);
  const clear = useCallback(() => {
    setForm(EMPTY_VIDEO_FORM); setPromptEdited(false); setError(''); setResult(null); setAppState('FORM');
  }, []);
  const markLiked = useCallback((liked: boolean) => {
    setResult(r => r && r.saved ? { ...r, saved: { ...r.saved, liked } } : r);
  }, []);

  return {
    form, setField, applyStyle, setMode, setCustom, loadBusiness, applyIndustryStyle, writeScript, writing,
    prompt, promptEdited, editPrompt, rebuildPrompt,
    appState, statusText, elapsed, error, result,
    connection, connect, disconnectHf, refreshConnection, cost,
    generate, cancel, backToEdit, clear, markLiked,
  };
}
