/**
 * WorkScreens — the screens where people do work: Custom prompt, Sports banner,
 * Video and the Email checker.
 *
 * They live in the frame (AppFrame) and are NEVER closed once opened: when you go
 * to another screen they are only hidden. So a half-filled form, a finished
 * prompt, an image or a video that is still being made all survive a trip to
 * the library and back.
 *
 * A screen is only built the first time you visit it, so opening Home (or a
 * library) first doesn't slow anything down.
 *
 * The address decides which one is visible (see `workScreenForPath`).
 */
import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PromptForm } from "@/components/PromptForm";
import { ProcessingState } from "@/components/ProcessingState";
import { ResultDisplay } from "@/components/ResultDisplay";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { SportsBannerWizard } from "@/components/SportsBannerWizard";
import { VideoGenerator } from "@/components/video/VideoGenerator";
import EmailContentChecker from "@/pages/EmailContentChecker";
import { useVideoGenerator } from "@/hooks/useVideoGenerator";
import { usePromptGenerator } from "@/hooks/usePromptGenerator";
import { useReferencePromptData } from "@/hooks/useReferencePromptData";
import { useSportsBannerWizard } from "@/hooks/useSportsBannerWizard";
import { LikedImagesPanel } from "@/components/LikedImagesPanel";
import { toast } from "sonner";
import { FormData } from "@/types/prompt";
import type { GalleryImage } from "@/components/ImageModal";
import type { WorkScreenId } from "@/lib/nav/screens";

/** What is "still working" right now — the sidebar shows a pulsing dot for each. */
export interface BusyState { custom: boolean; video: boolean }

/** The same centred card the Custom Prompt / Sports Banner / Video tabs had before. */
function WorkCard({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto px-3 sm:px-4 py-6 sm:py-8 md:py-16 container max-w-3xl">
      <div className="bg-card rounded-xl sm:rounded-2xl border border-border shadow-lg overflow-hidden">
        <div className="p-4 sm:p-6 md:p-8">{children}</div>
      </div>

      {/* Footer */}
      <p className="text-center text-xs sm:text-sm text-muted-foreground mt-6 sm:mt-8">
        Powered by AI • Generate professional prompts in seconds
      </p>
    </div>
  );
}

export function WorkScreens({ visible, onBusyChange }: { visible: WorkScreenId | null; onBusyChange: (b: BusyState) => void }) {
  const navigate = useNavigate();

  const {
    appState,
    formData,
    errors,
    generatedPrompt,
    promptMetadata,
    processingTime,
    elapsedTime,
    errorMessage,
    generatedImages,
    isRegeneratingPrompt,
    handleFieldChange,
    handleSubmit,
    handleEditForm,
    handleGenerateAgain,
    handleClearForm,
    handleGoBack,
    handlePromptChange,
    handleMetadataChange,
    handleAddGeneratedImage,
    handleAppendEditedImage,
    handleRemoveGeneratedImage,
    handleSubmitWithData,
  } = usePromptGenerator();

  // Wizard state lifted here so it survives moving to other screens
  const wizardState = useSportsBannerWizard();
  // Video state lifted here too, so a render in progress survives moving to other screens
  const videoState = useVideoGenerator();
  const [wizardBrand, setWizardBrand] = useState('');

  // Track whether the latest result came from the wizard or the custom form
  const [lastGenerationSource, setLastGenerationSource] = useState<'form' | 'wizard'>('form');

  // ── Which screens have been opened at least once ──────────────────────────
  // A screen is built the first time it becomes visible, then kept forever
  // (only hidden). `isBuilt` also counts the screen being shown right now, so it
  // appears straight away instead of one moment later.
  const [visited, setVisited] = useState<Set<WorkScreenId>>(() => new Set(visible ? [visible] : []));
  useEffect(() => {
    if (!visible) return;
    setVisited(prev => (prev.has(visible) ? prev : new Set(prev).add(visible)));
  }, [visible]);
  const isBuilt = (id: WorkScreenId) => visited.has(id) || visible === id;

  // ── Stop sound from hidden screens ────────────────────────────────────────
  // Hiding a screen doesn't pause a playing video or audio, so a finished video
  // would keep playing (with sound) after you leave. Each time the visible
  // screen changes, pause everything inside the screens that are now hidden.
  // A video can also START while its screen is hidden (one that finishes
  // rendering while you're on another screen autoplays), so hidden screens
  // also stop anything that starts playing. 'play' doesn't bubble, so it is
  // caught on the way down (capture). We never press play again when you come back.
  const wrapperRefs = useRef<Partial<Record<WorkScreenId, HTMLDivElement | null>>>({});
  useEffect(() => {
    const hidden = (Object.keys(wrapperRefs.current) as WorkScreenId[])
      .filter(id => id !== visible)
      .map(id => wrapperRefs.current[id])
      .filter((wrapper): wrapper is HTMLDivElement => !!wrapper);
    const stopIfStarted = (e: Event) => { if (e.target instanceof HTMLMediaElement) e.target.pause(); };
    hidden.forEach(wrapper => {
      wrapper.querySelectorAll<HTMLMediaElement>('video, audio').forEach(media => media.pause());
      wrapper.addEventListener('play', stopIfStarted, true);
    });
    return () => hidden.forEach(wrapper => wrapper.removeEventListener('play', stopIfStarted, true));
  }, [visible]);

  const { referencePromptData, isLoadingReferenceData, fetchReferencePromptData, clearReferencePromptData } =
    useReferencePromptData();

  const [showLikedPanel, setShowLikedPanel] = useState(false);
  // Moving to another screen closes the favourites panel, so it doesn't stay
  // open on top of the next page.
  useEffect(() => { setShowLikedPanel(false); }, [visible]);

  // Variation images generated inside the modal — in-memory only, like the main
  // gallery. They survive moving between screens (the screen stays loaded) but
  // a full page refresh clears them so each session starts fresh.
  const [persistedVariations, setPersistedVariations] = useState<GalleryImage[]>([]);

  // One-time cleanup of keys left behind by older versions (the old persistent
  // variations, and the old tab memory that the address now replaces).
  useEffect(() => {
    try { localStorage.removeItem('pg_current_variations'); } catch { /* ignore */ }
    try { localStorage.removeItem('pg_activeTab'); } catch { /* ignore */ }
  }, []);

  // Clear variations whenever a fresh batch of images is generated
  useEffect(() => { setPersistedVariations([]); }, [generatedImages]);

  // Returning from the Higgsfield sign-in (…?hf=connected or …?hf=error:…), on any
  // address: show the outcome, re-check the connection, and go to the Video
  // screen with a tidy address. We use the router (not the browser history
  // directly) so the app notices the address changed.
  const [searchParams] = useSearchParams();
  const hf = searchParams.get('hf');
  const refreshVideoConnection = videoState.refreshConnection;
  useEffect(() => {
    if (!hf) return;
    if (hf === 'connected') toast.success('Higgsfield connected — you can generate videos now.');
    else toast.error(`Higgsfield sign-in failed: ${hf.replace(/^error:/, '')}`);
    refreshVideoConnection();
    navigate('/video', { replace: true });
  }, [hf, navigate, refreshVideoConnection]);

  // ── "Still working" dots in the sidebar ───────────────────────────────────
  // Custom prompt is busy while a prompt is being written or rewritten
  // ("Regenerate prompt"), or an image is being made (ResultDisplay tells us
  // about images). Video is busy while rendering.
  const [imageBusy, setImageBusy] = useState(false);
  const customBusy = appState === 'PROCESSING' || isRegeneratingPrompt || imageBusy;
  const videoBusy = videoState.appState === 'RENDERING';
  useEffect(() => {
    onBusyChange({ custom: customBusy, video: videoBusy });
  }, [customBusy, videoBusy, onBusyChange]);

  // Get current brand from metadata (result view) or formData (form view)
  const currentBrand = promptMetadata?.brand || formData.brand || "";

  // Sync reference prompt data to formData and metadata when loaded
  useEffect(() => {
    if (referencePromptData) {
      handleFieldChange("format_layout", referencePromptData.format_layout || "");
      handleFieldChange("primary_object", referencePromptData.primary_object || "");
      handleFieldChange("subject", referencePromptData.subject || "");
      handleFieldChange("lighting", referencePromptData.lighting || "");
      handleFieldChange("mood", referencePromptData.mood || "");
      handleFieldChange("background", referencePromptData.background || "");
      handleFieldChange("positive_prompt", referencePromptData.positive_prompt || "");
      handleFieldChange("negative_prompt", referencePromptData.negative_prompt || "");

      handleMetadataChange("format_layout", referencePromptData.format_layout || "");
      handleMetadataChange("primary_object", referencePromptData.primary_object || "");
      handleMetadataChange("subject", referencePromptData.subject || "");
      handleMetadataChange("lighting", referencePromptData.lighting || "");
      handleMetadataChange("mood", referencePromptData.mood || "");
      handleMetadataChange("background", referencePromptData.background || "");
      handleMetadataChange("positive_prompt", referencePromptData.positive_prompt || "");
      handleMetadataChange("negative_prompt", referencePromptData.negative_prompt || "");
    }
  }, [referencePromptData, handleFieldChange, handleMetadataChange]);

  const handleReferenceChange = (brand: string, referenceId: string) => {
    if (referenceId) {
      fetchReferencePromptData(brand, referenceId);
    } else {
      clearReferencePromptData();
      handleFieldChange("format_layout", "");
      handleFieldChange("primary_object", "");
      handleFieldChange("subject", "");
      handleFieldChange("lighting", "");
      handleFieldChange("mood", "");
      handleFieldChange("background", "");
      handleFieldChange("positive_prompt", "");
      handleFieldChange("negative_prompt", "");
    }
  };

  const handleClearFormWithReference = () => {
    handleClearForm();
    clearReferencePromptData();
  };

  // Go back to the wizard with all settings intact so the user can tweak and regenerate
  const handleEditWizard = useCallback(() => {
    handleEditForm();
    navigate('/sports');
  }, [handleEditForm, navigate]);

  const showForm = appState === "FORM";
  const showProcessing = appState === "PROCESSING";
  const showResult = ["RESULT", "SAVING", "SAVED"].includes(appState);
  const showError = !!errorMessage && appState === "FORM";

  return (
    <>
      {/* ── Custom prompt (form → processing → result) ─────────────────────── */}
      {isBuilt('custom') && (
        <div ref={el => { wrapperRefs.current.custom = el; }} hidden={visible !== 'custom'}>
          <WorkCard>
            {showError && <ErrorDisplay message={errorMessage} onGoBack={handleGoBack} />}

            {showForm && !showError && (
              <PromptForm
                formData={formData}
                errors={errors}
                referencePromptData={referencePromptData}
                isLoadingReferenceData={isLoadingReferenceData}
                onFieldChange={handleFieldChange}
                onReferenceChange={handleReferenceChange}
                onSubmit={() => { setLastGenerationSource('form'); handleSubmit(); }}
                onClear={handleClearFormWithReference}
                onOpenFavorites={() => setShowLikedPanel(true)}
                isVisible={visible === 'custom'}
              />
            )}

            {showProcessing && <ProcessingState elapsedTime={elapsedTime} />}

            {showResult && (
              <ResultDisplay
                prompt={generatedPrompt}
                metadata={promptMetadata}
                processingTime={processingTime}
                appState={appState}
                generatedImages={generatedImages}
                isRegeneratingPrompt={isRegeneratingPrompt}
                referencePromptData={referencePromptData}
                isLoadingReferenceData={isLoadingReferenceData}
                onReferenceChange={handleReferenceChange}
                onEditForm={handleEditForm}
                onEditWizard={handleEditWizard}
                lastGenerationSource={lastGenerationSource}
                onGenerateAgain={handleGenerateAgain}
                onClearForm={handleClearFormWithReference}
                onPromptChange={handlePromptChange}
                onMetadataChange={handleMetadataChange}
                onAddGeneratedImage={handleAddGeneratedImage}
                onAppendEditedImage={handleAppendEditedImage}
                onRemoveGeneratedImage={handleRemoveGeneratedImage}
                onOpenFavorites={() => setShowLikedPanel(true)}
                persistedVariations={persistedVariations}
                onVariationsChange={setPersistedVariations}
                onImageBusyChange={setImageBusy}
                isVisible={visible === 'custom'}
              />
            )}
          </WorkCard>
        </div>
      )}

      {/* ── Sports banner wizard ──────────────────────────────────────────────
          While a prompt is being made, the wizard is hidden (not closed, so
          nothing in it is lost) and the progress is shown instead. */}
      {isBuilt('sports') && (
        <div ref={el => { wrapperRefs.current.sports = el; }} hidden={visible !== 'sports'}>
          <WorkCard>
            <div hidden={showProcessing}>
              <SportsBannerWizard
                wizardState={wizardState}
                brand={wizardBrand}
                onBrandChange={setWizardBrand}
                onSubmit={(data) => {
                  setLastGenerationSource('wizard');
                  navigate('/custom'); // go to Custom prompt to show the result
                  handleSubmitWithData(data as Partial<FormData>);
                }}
              />
            </div>
            {showProcessing && <ProcessingState elapsedTime={elapsedTime} />}
          </WorkCard>
        </div>
      )}

      {/* ── Video (Higgsfield) ─────────────────────────────────────────────── */}
      {isBuilt('video') && (
        <div ref={el => { wrapperRefs.current.video = el; }} hidden={visible !== 'video'}>
          <WorkCard>
            <VideoGenerator state={videoState} onOpenLibrary={() => navigate('/library/videos')} />
          </WorkCard>
        </div>
      )}

      {/* ── Email checker — full width, its own layout ─────────────────────── */}
      {isBuilt('email') && (
        <div ref={el => { wrapperRefs.current.email = el; }} hidden={visible !== 'email'}>
          <EmailContentChecker />
        </div>
      )}

      {/* Liked Images Panel */}
      <LikedImagesPanel isOpen={showLikedPanel} onClose={() => setShowLikedPanel(false)} brand={currentBrand} />
    </>
  );
}
