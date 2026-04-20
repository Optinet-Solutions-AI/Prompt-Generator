import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Archive, Check, Copy, Loader2, Pencil, Sparkles, RotateCcw, Bot, Gem, Save, X, Heart, Shuffle } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { FavoriteHeart } from "./FavoriteHeart";
import type { AppState, PromptMetadata, ReferencePromptData } from "@/types/prompt";
import { BRANDS } from "@/types/prompt";
import { usePromptList } from "@/hooks/usePromptList";
import { ImageModal, type GalleryImage } from "./ImageModal";
import { SavePromptModal } from "./SavePromptModal";
import { FormField } from "./FormField";
import { ReferenceSelect } from "./ReferenceSelect";
import { PositionAndRatioSelector } from "./PositionAndRatioSelector";
import { ReferencePromptDataDisplay } from "./ReferencePromptDataDisplay";
import { CreateBlendedPromptDialog } from "./CreateBlendedPromptDialog";
import type { GeneratedImages } from "@/hooks/usePromptGenerator";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import { normalizeN8nImageResponse } from "@/lib/n8nImage";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface ResultDisplayProps {
  prompt: string;
  metadata: PromptMetadata | null;
  processingTime: number;
  appState: AppState;
  generatedImages: GeneratedImages;
  isRegeneratingPrompt: boolean;
  referencePromptData: ReferencePromptData | null;
  isLoadingReferenceData: boolean;
  onReferenceChange: (brand: string, referenceId: string) => void;
  onSave: () => void;
  onDontSave: () => void;
  onEditForm: () => void;
  onEditWizard?: () => void;
  lastGenerationSource?: 'form' | 'wizard';
  onGenerateAgain: () => void;
  onClearForm: () => void;
  onOpenFavorites: () => void;
  onPromptChange?: (newPrompt: string) => void;
  onMetadataChange?: (field: keyof PromptMetadata, value: string) => void;
  onAddGeneratedImage?: (
    provider: "chatgpt" | "gemini",
    image: { displayUrl: string; editUrl: string; referenceLabel: string; generatedBrand: string },
  ) => void;
  onRemoveGeneratedImage?: (provider: "chatgpt" | "gemini", index: number) => void;
  persistedVariations?: GalleryImage[];
  onVariationsChange?: (variations: GalleryImage[]) => void;
}

export function ResultDisplay({
  prompt,
  metadata,
  processingTime,
  appState,
  generatedImages,
  isRegeneratingPrompt,
  referencePromptData,
  isLoadingReferenceData,
  onReferenceChange,
  onSave,
  onDontSave,
  onEditForm,
  onEditWizard,
  lastGenerationSource = 'form',
  onGenerateAgain,
  onClearForm,
  onOpenFavorites,
  onPromptChange,
  onMetadataChange,
  onAddGeneratedImage,
  onRemoveGeneratedImage,
  persistedVariations: persistedVariationsProp = [],
  onVariationsChange,
}: ResultDisplayProps) {
  // Load all prompts from Airtable via n8n (same as the form page)
  const { getReferencesForBrand, getRecordId, refetch } = usePromptList();

  // Derive the category for the currently selected reference (needed for Save as New Reference)
  const resultAvailableReferences = metadata?.brand ? getReferencesForBrand(metadata.brand) : [];
  const resultSelectedCategory = resultAvailableReferences.find(r => r.id === metadata?.reference)?.category || '';

  // Airtable record ID for the currently selected reference (needed for archive)
  const selectedRecordId = metadata?.reference ? getRecordId(metadata.reference, metadata?.brand || '') : '';

  // Resolution and backend selection for image generation
  type Resolution = "1K" | "2K" | "3K" | "4K";
  const [resolution, setResolution] = useState<Resolution>("2K");

  // Create blended prompt dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Archive dialog state
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  // Rename dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameError, setRenameError] = useState('');

  const handleRename = async () => {
    if (!renameInput.trim()) { setRenameError('Please enter a name.'); return; }
    if (!selectedRecordId || !metadata?.reference) return;
    setIsRenaming(true);
    setRenameError('');
    try {
      // Preserve the description part (everything after " — ") so only the
      // short name changes. e.g. "Royal Casino — A right-aligned..." becomes
      // "New Name — A right-aligned..." in Airtable.
      const parts = metadata.reference.split(' — ');
      const existingDescription = parts.length > 1 ? parts.slice(1).join(' — ').trim() : '';
      const fullNewName = renameInput.trim() + (existingDescription ? ' — ' + existingDescription : '');

      const response = await fetch('/api/rename-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: selectedRecordId, newName: fullNewName }),
      });
      if (!response.ok) throw new Error('Failed to rename reference');
      setRenameDialogOpen(false);
      setRenameInput('');
      onMetadataChange?.('reference', fullNewName); // keep the renamed reference selected
      refetch();                                     // reload dropdown with new name
      toast.success('Reference renamed successfully');
    } catch (error) {
      console.error('Error renaming reference:', error);
      setRenameError('Something went wrong. Please try again.');
    } finally {
      setIsRenaming(false);
    }
  };

  const handleArchive = async () => {
    if (!selectedRecordId) return;
    setIsArchiving(true);
    try {
      const response = await fetch('/api/remove-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: selectedRecordId }),
      });
      if (!response.ok) throw new Error('Failed to archive reference');
      setArchiveDialogOpen(false);
      onMetadataChange?.('reference', ''); // clear the selection
      refetch();                            // refresh the dropdown
      toast.success('Reference archived');
    } catch (error) {
      console.error('Error archiving reference:', error);
      toast.error('Failed to archive. Please try again.');
    } finally {
      setIsArchiving(false);
    }
  };

  const [copied, setCopied] = useState(false);
  const [generatingImage, setGeneratingImage] = useState<{ chatgpt: boolean; gemini: boolean }>({
    chatgpt: false,
    gemini: false,
  });
  const [imageError, setImageError] = useState<string | null>(null);
  const [modalImage, setModalImage] = useState<{
    initialIndex: number;
  } | null>(null);
  // Variations: use prop from parent (persists across tab switches)
  const persistedVariations = persistedVariationsProp;
  const setPersistedVariations = onVariationsChange ?? (() => {});
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [editablePrompt, setEditablePrompt] = useState(prompt);

  // Track URL overrides from in-modal edits so the thumbnail strip reflects edits after closing
  const [imageUpdates, setImageUpdates] = useState<Map<string, { displayUrl: string; editUrl: string }>>(new Map());

  // Save as New Reference dialog state (triggered by the 💾 toolbar button)
  const [saveAsRefOpen, setSaveAsRefOpen] = useState(false);
  const [refTitle, setRefTitle] = useState('');
  const [isRefSaving, setIsRefSaving] = useState(false);
  const [refSaveError, setRefSaveError] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Clear image-edit overrides whenever a fresh set of images is generated.
  // NOTE: persistedVariations is owned by Index.tsx — do NOT clear it here.
  useEffect(() => {
    setImageUpdates(new Map());
  }, [generatedImages]);

  const handleSaveAsRef = async () => {
    if (!refTitle.trim()) { setRefSaveError('Please enter a title.'); return; }
    if (!metadata) return;
    setIsRefSaving(true);
    setRefSaveError('');
    try {
      const response = await fetch('/api/save-as-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:           refTitle.trim(),
          brand_name:      metadata.brand,
          prompt_category: resultSelectedCategory,
          format_layout:   metadata.format_layout   || '',
          primary_object:  metadata.primary_object  || '',
          subject:         metadata.subject         || '',
          lighting:        metadata.lighting        || '',
          mood:            metadata.mood            || '',
          background:      metadata.background      || '',
          positive_prompt: metadata.positive_prompt || '',
          negative_prompt: metadata.negative_prompt || '',
        }),
      });
      if (!response.ok) throw new Error('Failed to save reference');
      setSaveAsRefOpen(false);
      setRefTitle('');
      refetch();
      toast.success('Saved as new reference');
    } catch (err) {
      console.error('Error saving reference:', err);
      setRefSaveError('Something went wrong. Please try again.');
    } finally {
      setIsRefSaving(false);
    }
  };

  // Store record_id and img_url per imageId for consistent like/unlike payloads
  const imageMetaRef = useRef<Map<string, { recordId: string; imgUrl: string }>>(new Map());
  // Store generated brand per imageId separately
  const imageBrandRef = useRef<Map<string, string>>(new Map());
  const pendingWebhookRef = useRef<Set<string>>(new Set());

  const getImageMeta = useCallback((imageId: string) => {
    if (imageMetaRef.current.has(imageId)) {
      return imageMetaRef.current.get(imageId)!;
    }
    // Extract the actual image URL from the imageId (format: "provider-index-url")
    const urlStart = imageId.indexOf("-", imageId.indexOf("-") + 1) + 1;
    const imgUrl = imageId.substring(urlStart);

    // Derive record_id from the file name (last segment of the URL path)
    let recordId: string;
    try {
      const urlObj = new URL(imgUrl);
      const pathSegments = urlObj.pathname.split("/").filter(Boolean);
      recordId = pathSegments[pathSegments.length - 1] || imgUrl;
    } catch {
      const lastSlash = imgUrl.lastIndexOf("/");
      recordId = lastSlash >= 0 ? imgUrl.substring(lastSlash + 1) : imgUrl;
    }

    const meta = { recordId, imgUrl };
    imageMetaRef.current.set(imageId, meta);
    return meta;
  }, []);

  const handleToggleFavorite = useCallback(
    (imageId: string, liked: boolean) => {
      setFavorites((prev) => {
        const next = new Set(prev);
        if (liked) next.add(imageId);
        else next.delete(imageId);
        return next;
      });

      // Prevent duplicate rapid clicks
      if (pendingWebhookRef.current.has(imageId)) return;
      pendingWebhookRef.current.add(imageId);

      const { recordId, imgUrl } = getImageMeta(imageId);

      // Get the stored brand from the image brand ref
      const storedBrand = imageBrandRef.current.get(imageId);
      const brandName = storedBrand || metadata?.brand || "No Brand";

      const endpoint = liked
        ? "/api/like-img"
        : "/api/unlike-img";

      const payload = liked
        ? { record_id: recordId, img_url: imgUrl, brand_name: brandName }
        : { record_id: recordId, img_url: imgUrl };

      if (liked) {
        console.log("Liking image generated for brand:", brandName);
        console.log("Current brand selector:", metadata?.brand);
        console.log("Using stored brand:", storedBrand);
        console.log("Payload:", payload);
      }

      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .catch(() => {})
        .finally(() => {
          pendingWebhookRef.current.delete(imageId);
        });
    },
    [getImageMeta, metadata],
  );

  // Elapsed time trackers for different operations
  const chatgptTimer = useElapsedTime();
  const geminiTimer = useElapsedTime();

  // Sync editablePrompt with prompt prop when it changes (e.g., after regenerating)
  useEffect(() => {
    setEditablePrompt(prompt);
  }, [prompt]);

  // Called when an image is edited inside the modal — tracks the new URL so the
  // thumbnail strip shows the edited version even after the modal closes.
  const handleImageUpdated = useCallback((newDisplay: string, newEdit: string, imageId?: string) => {
    if (!imageId) return;
    setImageUpdates(prev => {
      const next = new Map(prev);
      next.set(imageId, { displayUrl: newDisplay, editUrl: newEdit });
      return next;
    });
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(editablePrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePromptEdit = (value: string) => {
    setEditablePrompt(value);
    onPromptChange?.(value);
  };

  // Get reference label from metadata.
  // metadata.reference is now the prompt_name directly (e.g. "Stormcraft Arrival").
  const getReferenceLabel = (): string => {
    return metadata?.reference || "Unknown";
  };

  const handleGenerateImage = async (provider: "chatgpt" | "gemini") => {
    // Prevent multiple simultaneous requests for the same provider
    if (generatingImage[provider]) return;

    const timer = provider === "chatgpt" ? chatgptTimer : geminiTimer;

    setGeneratingImage((prev) => ({ ...prev, [provider]: true }));
    timer.start();
    setImageError(null);

    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: editablePrompt,
          provider,
          aspectRatio: metadata?.aspectRatio || "16:9",
          backend: "cloud-run",
          resolution,
          brand: metadata?.brand || "",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate image");
      }

      const data = await response.json();
      console.log("RAW API RESPONSE:", data); // ADD THIS

      const normalized = normalizeN8nImageResponse(data);
      console.log("NORMALIZED RESPONSE:", normalized); // ADD THIS

      const displayUrl = normalized.displayUrl;
      const editUrl = normalized.editUrl;

      console.log("DISPLAY URL:", displayUrl); // ADD THIS
      console.log("EDIT URL:", editUrl); // ADD THIS

      if (displayUrl && editUrl) {
        const generatedBrand = metadata?.brand || "No Brand";
        onAddGeneratedImage?.(provider, { displayUrl, editUrl, referenceLabel: getReferenceLabel(), generatedBrand, resolution });
      } else {
        throw new Error("No image URL returned from response");
      }
    } catch (error) {
      console.error("Image generation error:", error);
      setImageError(error instanceof Error ? error.message : "Failed to generate image");
    } finally {
      setGeneratingImage((prev) => ({ ...prev, [provider]: false }));
      timer.stop();
    }
  };

  const handleGenerateBoth = async () => {
    // Start both generations simultaneously
    handleGenerateImage("chatgpt");
    handleGenerateImage("gemini");
  };

  const isSaving = appState === "SAVING";
  const isSaved = appState === "SAVED";

  return (
    <div className="space-y-6">
      {/* Editable Request Data Form */}
      {metadata && (
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Request Details</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              type="select"
              label="Brand"
              required
              options={[...BRANDS]}
              value={metadata.brand}
              onChange={(value) => {
                onMetadataChange?.("brand", value);
                // Reset reference when brand changes
                onMetadataChange?.("reference", "");
              }}
              placeholder="Select a brand"
              disabled={isRegeneratingPrompt}
            />

            <div className="space-y-1.5">
              <ReferenceSelect
                label="Reference"
                required
                value={metadata.reference || ""}
                onChange={(selectedValue) => {
                  // selectedValue is the prompt_name (we use prompt_name as option id).
                  // Store prompt_name as the reference, then look up the Airtable record ID
                  // so we can fetch the full reference data.
                  onMetadataChange?.("reference", selectedValue);
                  const recordId = getRecordId(selectedValue, metadata.brand);
                  onReferenceChange(metadata.brand, recordId);
                }}
                placeholder={metadata.brand ? "Select a reference" : "Select a brand first"}
                disabled={!metadata.brand || isRegeneratingPrompt}
                references={getReferencesForBrand(metadata.brand)}
              />
              {/* Action buttons — shown when a brand is selected */}
              {metadata.brand && (
                <div className="flex justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCreateDialogOpen(true)}
                    className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <Sparkles className="h-3 w-3" />
                    Create New
                  </Button>
                  {/* Rename + Archive — only shown when a reference is selected */}
                  {metadata.reference && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const shortName = metadata.reference.split(' — ')[0].trim();
                          setRenameInput(shortName);
                          setRenameError('');
                          setRenameDialogOpen(true);
                        }}
                        className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3 w-3" />
                        Rename
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setArchiveDialogOpen(true)}
                        className="h-6 px-2 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Archive className="h-3 w-3" />
                        Archive
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="sm:col-span-2">
              <PositionAndRatioSelector
                subjectPosition={metadata.subjectPosition || "Centered"}
                aspectRatio={metadata.aspectRatio || "16:9"}
                onSubjectPositionChange={(value) => onMetadataChange?.("subjectPosition", value)}
                onAspectRatioChange={(value) => onMetadataChange?.("aspectRatio", value)}
                disabled={isRegeneratingPrompt}
              />
            </div>

            <FormField
              type="text"
              label="Theme"
              value={metadata.theme || ""}
              onChange={(value) => onMetadataChange?.("theme", value)}
              placeholder="e.g., Dark Luxury Noir Valentine's"
              disabled={isRegeneratingPrompt}
            />

            <FormField
              type="textarea"
              label="Description"
              value={metadata.description || ""}
              onChange={(value) => onMetadataChange?.("description", value)}
              placeholder="Describe your image..."
              rows={2}
              disabled={isRegeneratingPrompt}
            />
          </div>

          {/* Reference Prompt Data - Collapsible & Editable */}
          <ReferencePromptDataDisplay
            brand={metadata.brand}
            category={resultSelectedCategory}
            onSaved={refetch}
            data={{
              format_layout: metadata.format_layout || "",
              primary_object: metadata.primary_object || "",
              subject: metadata.subject || "",
              lighting: metadata.lighting || "",
              mood: metadata.mood || "",
              background: metadata.background || "",
              positive_prompt: metadata.positive_prompt || "",
              negative_prompt: metadata.negative_prompt || "",
            }}
            isLoading={isLoadingReferenceData}
            disabled={isRegeneratingPrompt}
            onChange={(field, value) => onMetadataChange?.(field, value)}
          />

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {lastGenerationSource === 'wizard' && onEditWizard ? (
              <Button variant="outline" size="sm" onClick={onEditWizard} className="gap-2">
                <Pencil className="w-4 h-4" />
                Edit in Wizard
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={onEditForm} className="gap-2">
                <Pencil className="w-4 h-4" />
                Edit Form
              </Button>
            )}
            <Button
              onClick={onGenerateAgain}
              disabled={isRegeneratingPrompt || isLoadingReferenceData}
              className="gap-2 gradient-primary"
            >
              {isRegeneratingPrompt ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Regenerating...
                </>
              ) : isLoadingReferenceData ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Regenerate Prompt
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Editable Prompt Card */}
      <div className="relative">
        <div className="absolute -inset-1 gradient-primary rounded-2xl opacity-20 blur-sm" />
        <div className="relative bg-card rounded-xl border-2 border-primary/30 shadow-lg shadow-primary/10 overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5">
            <div>
              <h3 className="font-bold text-base sm:text-lg text-foreground tracking-tight">Your Generated Prompt</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Generated in {processingTime.toFixed(1)}s • Edit before generating
              </p>
            </div>

            {/* Toolbar */}
            <TooltipProvider>
              <div className="flex items-center gap-0.5 bg-background rounded-lg p-1 border border-border shadow-sm">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleCopy} className="h-8 w-8 hover:bg-primary/10">
                      {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{copied ? "Copied!" : "Copy"}</p>
                  </TooltipContent>
                </Tooltip>

                <div className="w-px h-4 bg-border" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={onClearForm} className="h-8 w-8 hover:bg-primary/10">
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Reset</p>
                  </TooltipContent>
                </Tooltip>

                <div className="w-px h-4 bg-border" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setRefTitle(''); setRefSaveError(''); setSaveAsRefOpen(true); }}
                      className="h-8 w-8 text-primary hover:bg-primary/10"
                    >
                      <Save className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Save as New Reference</p>
                  </TooltipContent>
                </Tooltip>

                <div className="w-px h-4 bg-border" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onOpenFavorites}
                      className="h-8 w-8 text-primary hover:bg-primary/10"
                    >
                      <Heart className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Favorites</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
          <div className="p-4 sm:p-6">
            <Textarea
              value={editablePrompt}
              onChange={(e) => handlePromptEdit(e.target.value)}
              className="text-foreground leading-relaxed text-sm sm:text-[15px] font-medium bg-muted/30 p-4 sm:p-5 rounded-lg min-h-[180px] sm:min-h-[200px] max-h-96 border border-border/50 resize-y"
              placeholder="Your generated prompt will appear here..."
            />
          </div>
        </div>
      </div>

      {/* Rename dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Reference</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="rename-input-result">New name</Label>
            <Input
              id="rename-input-result"
              value={renameInput}
              onChange={(e) => { setRenameInput(e.target.value); setRenameError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              disabled={isRenaming}
              autoFocus
            />
            {renameError && <p className="text-sm text-destructive">{renameError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)} disabled={isRenaming}>Cancel</Button>
            <Button onClick={handleRename} disabled={isRenaming}>
              {isRenaming ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Renaming…</> : 'Rename'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirmation dialog */}
      <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this reference?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the reference to the Archived Prompts table. It won't be deleted — you can restore it from Airtable later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isArchiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchive}
              disabled={isArchiving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isArchiving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Archiving…</> : 'Archive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save as New Reference dialog — triggered by the 💾 toolbar button */}
      <Dialog open={saveAsRefOpen} onOpenChange={setSaveAsRefOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save as New Reference</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="ref-title-result">Title</Label>
            <Input
              id="ref-title-result"
              placeholder="e.g. Neon Warrior"
              value={refTitle}
              onChange={(e) => { setRefTitle(e.target.value); setRefSaveError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveAsRef()}
              disabled={isRefSaving}
              autoFocus
            />
            {refSaveError && <p className="text-sm text-destructive">{refSaveError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveAsRefOpen(false)} disabled={isRefSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveAsRef} disabled={isRefSaving}>
              {isRefSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Prompt Modal - Only opens on icon click */}
      <SavePromptModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={() => {
          setShowSaveModal(false);
          onSave();
        }}
        onDontSave={() => {
          setShowSaveModal(false);
          onDontSave();
        }}
      />

      {/* Create blended prompt dialog */}
      <CreateBlendedPromptDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        brand={metadata?.brand || ""}
        references={metadata?.brand ? getReferencesForBrand(metadata.brand) : []}
        getRecordId={getRecordId}
        onSaved={refetch}
      />

      {/* Saving State */}
      {isSaving && (
        <div className="flex items-center justify-center gap-2 py-4">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
          <span className="text-muted-foreground">Saving...</span>
        </div>
      )}

      {/* Saved State */}
      {isSaved && (
        <div className="flex items-center justify-center gap-2 py-4 text-success">
          <Check className="w-5 h-5" />
          <span className="font-medium">Saved successfully!</span>
        </div>
      )}

      {/* Image Generation Section */}
      <div className="bg-card rounded-xl border border-border p-4 sm:p-6 shadow-md">
        <p className="text-center text-muted-foreground text-xs sm:text-sm mb-4">Generate images using this prompt</p>

        {/* Resolution toggle */}
        <div className="mb-4">
          <p className="text-center text-xs text-muted-foreground mb-2">Resolution</p>
          <div className="flex justify-center gap-2">
            {(["1K", "2K", "3K", "4K"] as const).map((r) => (
              <Button
                key={r}
                type="button"
                variant={resolution === r ? "default" : "outline"}
                size="sm"
                onClick={() => setResolution(r)}
                className={`min-w-[52px] ${resolution === r ? "gradient-primary" : ""}`}
              >
                {r}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center">
          <Button
            onClick={() => handleGenerateImage("chatgpt")}
            disabled={generatingImage.chatgpt}
            variant="outline"
            className="gap-2 w-full sm:w-auto sm:min-w-[120px]"
          >
            {generatingImage.chatgpt ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="tabular-nums">{chatgptTimer.elapsedTime}s</span>
              </>
            ) : (
              <>
                <Bot className="w-4 h-4" />
                ChatGPT
              </>
            )}
          </Button>
          <Button
            onClick={() => handleGenerateImage("gemini")}
            disabled={generatingImage.gemini}
            variant="outline"
            className="gap-2 w-full sm:w-auto sm:min-w-[120px]"
          >
            {generatingImage.gemini ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="tabular-nums">{geminiTimer.elapsedTime}s</span>
              </>
            ) : (
              <>
                <Gem className="w-4 h-4" />
                Gemini
              </>
            )}
          </Button>
          <Button
            onClick={handleGenerateBoth}
            disabled={generatingImage.chatgpt || generatingImage.gemini}
            variant="default"
            className="gap-2 gradient-primary w-full sm:w-auto sm:min-w-[140px]"
          >
            {generatingImage.chatgpt && generatingImage.gemini ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate Both
              </>
            )}
          </Button>
        </div>

        {/* Error Message */}
        {imageError && <p className="text-destructive text-sm text-center mt-3">{imageError}</p>}

        {/* Generated Images Gallery - Combined by reference label */}
        {(generatedImages.chatgpt.length > 0 || generatedImages.gemini.length > 0) && (
          <div className="mt-6 space-y-4">
            {/* All images combined, grouped by reference label */}
            {(() => {
              // Create images with original index for removal
              const chatgptWithIndex = generatedImages.chatgpt.map((img, idx) => ({ ...img, originalIndex: idx }));
              const geminiWithIndex = generatedImages.gemini.map((img, idx) => ({ ...img, originalIndex: idx }));
              const allImages = [...chatgptWithIndex, ...geminiWithIndex];
              const flatGallery: GalleryImage[] = allImages.map(img => {
                const imageId = `${img.provider}-${img.originalIndex}-${img.displayUrl}`;
                const update = imageUpdates.get(imageId);
                return {
                  displayUrl: update?.displayUrl ?? img.displayUrl,
                  editUrl:    update?.editUrl    ?? img.editUrl,
                  provider:   img.provider,
                  imageId,
                };
              });
              const groupedByRef = allImages.reduce(
                (acc, img) => {
                  const label = img.referenceLabel || "Unknown";
                  if (!acc[label]) acc[label] = [];
                  acc[label].push(img);
                  return acc;
                },
                {} as Record<string, typeof allImages>,
              );

              return Object.entries(groupedByRef).map(([label, images]) => (
                <div key={label}>
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">
                      {label} ({images.length})
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {images.map((img, index) => {
                      const imageId = `${img.provider}-${img.originalIndex}-${img.displayUrl}`;
                      // Apply any URL updates from in-modal edits
                      const update = imageUpdates.get(imageId);
                      const thumbUrl = update?.displayUrl ?? img.displayUrl;
                      // Register the brand stored at generation time
                      if (img.generatedBrand && !imageBrandRef.current.has(imageId)) {
                        imageBrandRef.current.set(imageId, img.generatedBrand);
                      }
                      return (
                        <div
                          key={`${label}-${img.provider}-${index}`}
                          className="relative group cursor-pointer aspect-square"
                          onClick={() => {
                            const flatIdx = flatGallery.findIndex(g => g.imageId === imageId);
                            setModalImage({ initialIndex: flatIdx >= 0 ? flatIdx : 0 });
                          }}
                        >
                          <div className="absolute inset-0 bg-primary/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                            <span className="text-primary-foreground bg-primary/80 px-2 py-1 rounded text-xs font-medium">
                              View
                            </span>
                          </div>
                          {/* Remove button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveGeneratedImage?.(img.provider, img.originalIndex);
                            }}
                            className="absolute top-1 left-1 z-20 bg-destructive/90 hover:bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove image"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          {/* Favorite heart */}
                          <FavoriteHeart
                            imageId={imageId}
                            liked={favorites.has(imageId)}
                            onToggle={handleToggleFavorite}
                            className="top-1 right-8"
                          />
                          {/* Provider badge */}
                          <div className="absolute top-1 right-1 z-10">
                            {img.provider === "chatgpt" ? (
                              <div className="bg-background/80 backdrop-blur-sm rounded p-1">
                                <Bot className="w-3 h-3 text-muted-foreground" />
                              </div>
                            ) : (
                              <div className="bg-background/80 backdrop-blur-sm rounded p-1">
                                <Gem className="w-3 h-3 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          {/* Brand badge */}
                          {img.generatedBrand && (
                            <div className="absolute bottom-1 left-1 z-10">
                              <span className="bg-background/80 backdrop-blur-sm text-foreground text-[10px] font-medium px-1.5 py-0.5 rounded">
                                {img.generatedBrand}
                              </span>
                            </div>
                          )}
                          {/* Edited badge — shown when this image has been edited in the modal */}
                          {update && (
                            <div className="absolute bottom-1 right-1 z-10">
                              <span className="bg-amber-500/90 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded">
                                Edited
                              </span>
                            </div>
                          )}
                          <img
                            src={thumbUrl}
                            alt={`${label} - ${img.provider}`}
                            className="w-full h-full object-cover rounded-lg border border-border shadow-sm"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
            {/* Variation thumbnails — shown after main images when variations have been generated */}
            {persistedVariations.length > 0 && (() => {
              const originalCount = generatedImages.chatgpt.length + generatedImages.gemini.length;
              return (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Shuffle className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">
                      Variations ({persistedVariations.length})
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {persistedVariations.map((v, i) => (
                      <div
                        key={v.imageId}
                        className="relative group cursor-pointer aspect-square"
                        onClick={() => setModalImage({ initialIndex: originalCount + i })}
                      >
                        <div className="absolute inset-0 bg-primary/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                          <span className="text-primary-foreground bg-primary/80 px-2 py-1 rounded text-xs font-medium">View</span>
                        </div>
                        {/* Mode badge (top-left) */}
                        <span className={`absolute top-1 left-1 z-10 text-[8px] rounded px-1 py-0.5 leading-none font-semibold ${v.variationMode === 'subtle' ? 'bg-sky-500/80 text-white' : 'bg-violet-500/80 text-white'}`}>
                          {v.variationMode === 'subtle' ? 'SUB' : 'STR'}
                        </span>
                        {/* Variation number badge (bottom-left) */}
                        <span className="absolute bottom-1 left-1 z-10 text-[9px] bg-primary/80 text-white rounded px-1 py-0.5 leading-none">
                          V{v.variationIndex}
                        </span>
                        <img
                          src={v.displayUrl}
                          alt={`Variation ${v.variationIndex} (${v.variationMode})`}
                          className="w-full h-full object-cover rounded-lg border border-border shadow-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Add Favorites button at the bottom right of the generated images section */}
            <div className="flex justify-end mt-4">
              <Button type="button" variant="outline" onClick={onOpenFavorites} className="gap-2 h-10">
                <Heart className="w-4 h-4" />
                Favorites
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Image Gallery Modal */}
      {modalImage && (() => {
        const chatgptImgs = generatedImages.chatgpt.map((img, idx) => {
          const imageId = `chatgpt-${idx}-${img.displayUrl}`;
          const update = imageUpdates.get(imageId);
          return { displayUrl: update?.displayUrl ?? img.displayUrl, editUrl: update?.editUrl ?? img.editUrl, provider: 'chatgpt' as const, imageId };
        });
        const geminiImgs = generatedImages.gemini.map((img, idx) => {
          const imageId = `gemini-${idx}-${img.displayUrl}`;
          const update = imageUpdates.get(imageId);
          return { displayUrl: update?.displayUrl ?? img.displayUrl, editUrl: update?.editUrl ?? img.editUrl, provider: 'gemini' as const, imageId };
        });
        const galleryImages: GalleryImage[] = [...chatgptImgs, ...geminiImgs];
        return (
          <ImageModal
            isOpen={true}
            onClose={() => setModalImage(null)}
            allImages={galleryImages}
            initialIndex={modalImage.initialIndex}
            likedImages={favorites}
            onToggleFavorite={handleToggleFavorite}
            onImageUpdated={handleImageUpdated}
            resolution={resolution}
            brand={metadata?.brand}
            sourceRecipe={metadata ? {
              lighting:   metadata.lighting   || undefined,
              mood:       metadata.mood       || undefined,
              background: metadata.background || undefined,
            } : undefined}
            persistedVariations={persistedVariations}
            onVariationsChange={setPersistedVariations}
          />
        );
      })()}
    </div>
  );
}
