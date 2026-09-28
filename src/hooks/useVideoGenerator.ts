/**
 * useVideoGenerator — state for the Video tab.
 *
 * Flow:  FORM → RENDERING (poll Higgsfield every 5s) → RESULT
 *                     ↘ on any failure → back to FORM with an error message
 *
 * When Higgsfield finishes, the video is saved to the Video Drive folder
 * automatically, so it shows up in the Video Library without an extra click.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildUgcPrompt, EMPTY_VIDEO_FORM, UGC_STYLES, type VideoFormData } from '@/lib/ugc-video';
import { videoApi, type LibraryVideo } from '@/lib/video-api';

export type VideoAppState = 'FORM' | 'RENDERING' | 'RESULT';

const POLL_MS = 5000;
const MAX_WAIT_MS = 15 * 60 * 1000; // give up after 15 minutes

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
  const [result, setResult] = useState<{ previewUrl: string; saved: LibraryVideo | null; saveError: string } | null>(null);

  const cancelled = useRef(false);

  useEffect(() => {
    if (!promptEdited) setPrompt(buildUgcPrompt(form));
  }, [form, promptEdited]);

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

  const editPrompt = useCallback((text: string) => { setPrompt(text); setPromptEdited(true); }, []);
  const rebuildPrompt = useCallback(() => setPromptEdited(false), []);

  const generate = useCallback(async () => {
    if (!form.brand) { setError('Select a brand first.'); return; }
    if (!prompt.trim()) { setError('The prompt is empty — pick a UGC style or fill the fields.'); return; }

    cancelled.current = false;
    setError('');
    setResult(null);
    setAppState('RENDERING');
    setStatusText('Sending to Higgsfield…');

    try {
      const { request_id } = await videoApi.submit({
        prompt, aspectRatio: form.aspectRatio, duration: form.duration, audio: form.audio,
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
        if (['failed', 'nsfw', 'canceled'].includes(s.status)) {
          throw new Error(s.status === 'nsfw'
            ? 'Higgsfield blocked this prompt as unsafe — try rewording it.'
            : `Higgsfield ${s.status}${s.error ? `: ${s.error}` : ''}`);
        }
        setStatusText(s.status === 'queued' ? 'Waiting in Higgsfield queue…' : 'Rendering video…');
      }
      if (!videoUrl) return;

      // Show the video immediately, then save it to Drive in the background.
      setResult({ previewUrl: videoUrl, saved: null, saveError: '' });
      setAppState('RESULT');
      try {
        const { file } = await videoApi.save({
          video_url: videoUrl, brand: form.brand, prompt, aspectRatio: form.aspectRatio, duration: form.duration,
        });
        setResult(r => r && { ...r, saved: file });
      } catch (e) {
        setResult(r => r && { ...r, saveError: e instanceof Error ? e.message : 'Save failed' });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setAppState('FORM');
    }
  }, [form, prompt]);

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
    form, setField, applyStyle,
    prompt, promptEdited, editPrompt, rebuildPrompt,
    appState, statusText, elapsed, error, result,
    generate, cancel, backToEdit, clear, markLiked,
  };
}
