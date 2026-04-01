import { Images, Sparkles, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { PromptForm } from "@/components/PromptForm";
import { ProcessingState } from "@/components/ProcessingState";
import { ResultDisplay } from "@/components/ResultDisplay";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { SportsBannerWizard } from "@/components/SportsBannerWizard";
import ImageLibrary from "@/pages/ImageLibrary";
import { usePromptGenerator } from "@/hooks/usePromptGenerator";
import { useReferencePromptData } from "@/hooks/useReferencePromptData";
import { LikedImagesPanel } from "@/components/LikedImagesPanel";
import { FormData } from "@/types/prompt";
import type { GalleryImage } from "@/components/ImageModal";

const Index = () => {
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
    handleSave,
    handleDontSave,
    handleEditForm,
    handleGenerateAgain,
    handleClearForm,
    handleGoBack,
    handlePromptChange,
    handleMetadataChange,
    handleAddGeneratedImage,
    handleRemoveGeneratedImage,
    handleSubmitWithData,
  } = usePromptGenerator();

  // Track which top-level mode the user is in — persisted in localStorage so
  // switching to Image Library and back restores exactly where they left off
  const [activeTab, setActiveTab] = useState<'form' | 'wizard' | 'library'>(() => {
    try { return (localStorage.getItem('pg_activeTab') as 'form' | 'wizard' | 'library') || 'form'; }
    catch { return 'form'; }
  });
  const handleTabChange = (tab: 'form' | 'wizard' | 'library') => {
    try { localStorage.setItem('pg_activeTab', tab); } catch { /* ignore */ }
    setActiveTab(tab);
  };

  const { referencePromptData, isLoadingReferenceData, fetchReferencePromptData, clearReferencePromptData } =
    useReferencePromptData();

  const [showLikedPanel, setShowLikedPanel] = useState(false);

  // Variation images generated inside the modal — lifted here so they survive tab switches
  const [persistedVariations, setPersistedVariations] = useState<GalleryImage[]>([]);

  // Clear variations whenever new images are generated (fresh session)
  useEffect(() => { setPersistedVariations([]); }, [generatedImages]);

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

  const showForm = appState === "FORM";
  const showProcessing = appState === "PROCESSING";
  const showResult = ["RESULT", "SAVING", "SAVED"].includes(appState);
  const showError = !!errorMessage && appState === "FORM";

  return (
    <div className="min-h-screen bg-background">
      {/* Decorative background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/4 w-[800px] h-[800px] rounded-full gradient-primary opacity-[0.03] blur-3xl" />
        <div className="absolute -bottom-1/2 -left-1/4 w-[600px] h-[600px] rounded-full gradient-primary opacity-[0.03] blur-3xl" />
      </div>

      <div className={`relative mx-auto px-3 sm:px-4 py-6 sm:py-8 md:py-16 ${activeTab === 'library' ? 'max-w-full' : 'container max-w-3xl'}`}>
        {/* Header */}
        <div className="text-center mb-6 sm:mb-10">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl gradient-primary shadow-glow mb-4 sm:mb-6">
            <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-2 sm:mb-3">
            AI Prompt Generator
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg max-w-lg mx-auto px-2">
            Create stunning AI image prompts tailored for your brand and campaign needs
          </p>
          <button
            type="button"
            onClick={() => handleTabChange('library')}
            className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/25 hover:border-primary/50 text-primary font-medium text-sm transition-all duration-150 shadow-sm hover:shadow"
          >
            <Images className="w-4 h-4" />
            Image Library
          </button>
        </div>

        {/* Mode tabs — hidden when library is active (library has its own top bar) */}
        {activeTab !== 'library' && appState !== "PROCESSING" && (
          <div className="flex gap-1 p-1 rounded-xl bg-muted/50 border border-border mb-4">
            <button
              type="button"
              onClick={() => handleTabChange('form')}
              className={[
                'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                activeTab === 'form'
                  ? 'bg-card shadow-sm text-foreground border border-border'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              <Sparkles className="w-4 h-4" />
              Custom Prompt
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('wizard')}
              className={[
                'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                activeTab === 'wizard'
                  ? 'bg-card shadow-sm text-foreground border border-border'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              <Trophy className="w-4 h-4" />
              Sports Banner
            </button>
          </div>
        )}

        {/* ── Image Library — full-width, uses its own header with a Back button ── */}
        {activeTab === 'library' && (
          <ImageLibrary embedded onBack={() => handleTabChange('form')} />
        )}

        {/* Main Card — hidden when library is showing */}
        <div className={`bg-card rounded-xl sm:rounded-2xl border border-border shadow-lg overflow-hidden ${activeTab === 'library' ? 'hidden' : ''}`}>
          <div className="p-4 sm:p-6 md:p-8">

              {/* ── Sports Banner Wizard ─────────────────────────────────────────
                  Always rendered when wizard tab is active, regardless of appState.
                  Switching back to Custom Prompt preserves form/result state intact. */}
              {activeTab === 'wizard' && !showProcessing && (
                <SportsBannerWizard
                  onSubmit={(data) => {
                    handleTabChange('form'); // switch to Custom Prompt tab to show the result
                    handleSubmitWithData(data as Partial<FormData>);
                  }}
                />
              )}

              {/* ── Custom Prompt flow ───────────────────────────────────────────
                  Hidden when wizard tab is active, but state is preserved in memory
                  so switching back restores exactly where the user left off. */}
              {activeTab === 'form' && (
                <>
                  {showError && <ErrorDisplay message={errorMessage} onGoBack={handleGoBack} />}

                  {showForm && !showError && (
                    <PromptForm
                      formData={formData}
                      errors={errors}
                      referencePromptData={referencePromptData}
                      isLoadingReferenceData={isLoadingReferenceData}
                      onFieldChange={handleFieldChange}
                      onReferenceChange={handleReferenceChange}
                      onSubmit={handleSubmit}
                      onClear={handleClearFormWithReference}
                      onOpenFavorites={() => setShowLikedPanel(true)}
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
                      onSave={handleSave}
                      onDontSave={handleDontSave}
                      onEditForm={handleEditForm}
                      onGenerateAgain={handleGenerateAgain}
                      onClearForm={handleClearFormWithReference}
                      onPromptChange={handlePromptChange}
                      onMetadataChange={handleMetadataChange}
                      onAddGeneratedImage={handleAddGeneratedImage}
                      onRemoveGeneratedImage={handleRemoveGeneratedImage}
                      onOpenFavorites={() => setShowLikedPanel(true)}
                      persistedVariations={persistedVariations}
                      onVariationsChange={setPersistedVariations}
                    />
                  )}
                </>
              )}

              {/* Processing state spans both tabs — shown on top while generating */}
              {showProcessing && activeTab === 'wizard' && (
                <ProcessingState elapsedTime={elapsedTime} />
              )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs sm:text-sm text-muted-foreground mt-6 sm:mt-8">
          Powered by AI • Generate professional prompts in seconds
        </p>
      </div>

      {/* Liked Images Panel */}
      <LikedImagesPanel isOpen={showLikedPanel} onClose={() => setShowLikedPanel(false)} brand={currentBrand} />
    </div>
  );
};

export default Index;
