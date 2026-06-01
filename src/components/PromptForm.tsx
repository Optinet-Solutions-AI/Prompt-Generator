import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormField } from "./FormField";
import { ReferenceSelect } from "./ReferenceSelect";
import { PositionAndRatioSelector } from "./PositionAndRatioSelector";
import { SizePresetSelect } from "./SizePresetSelect";
import { ReferencePromptDataDisplay } from "./ReferencePromptDataDisplay";
import { CreateBlendedPromptDialog } from "./CreateBlendedPromptDialog";
import { Archive, Heart, Loader2, Pencil, Sparkles, Trash2 } from "lucide-react";
import { FormData, BRANDS, ReferencePromptData } from "@/types/prompt";
import { usePromptList } from "@/hooks/usePromptList";
import { toast } from "sonner";

interface PromptFormProps {
  formData: FormData;
  errors: Partial<Record<keyof FormData, string>>;
  referencePromptData: ReferencePromptData | null;
  isLoadingReferenceData: boolean;
  onFieldChange: (field: keyof FormData, value: string) => void;
  onReferenceChange: (brand: string, referenceId: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  onOpenFavorites: () => void;
}

export function PromptForm({
  formData,
  errors,
  referencePromptData,
  isLoadingReferenceData,
  onFieldChange,
  onReferenceChange,
  onSubmit,
  onClear,
  onOpenFavorites,
}: PromptFormProps) {
  // Load all prompts from Airtable via n8n
  const { getReferencesForBrand, getRecordId, refetch, isLoading: isLoadingList, error: listError } = usePromptList();

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
    if (!selectedRecordId) return;
    setIsRenaming(true);
    setRenameError('');
    try {
      // Preserve the description part (everything after " — ") so only the
      // short name changes. e.g. "Royal Casino — A right-aligned..." becomes
      // "New Name — A right-aligned..." in Airtable.
      const parts = formData.reference.split(' — ');
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
      onFieldChange('reference', fullNewName); // keep the renamed reference selected
      refetch();                               // reload dropdown with new name
      toast.success('Reference renamed successfully');
    } catch (error) {
      console.error('Error renaming reference:', error);
      setRenameError('Something went wrong. Please try again.');
    } finally {
      setIsRenaming(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  // Get references for the selected brand from Airtable (dynamic, not hardcoded)
  const availableReferences = formData.brand ? getReferencesForBrand(formData.brand) : [];

  // Get the category of the currently selected reference so we can pass it to the save dialog
  const selectedCategory = availableReferences.find(r => r.id === formData.reference)?.category || '';

  // Get the Airtable record ID for the currently selected reference (needed for archive)
  const selectedRecordId = formData.reference ? getRecordId(formData.reference, formData.brand) : '';

  // Archive the currently selected reference: move it to Archived Prompts in Airtable
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
      onFieldChange('reference', ''); // clear the selection
      refetch();                      // refresh the dropdown
      toast.success('Reference archived');
    } catch (error) {
      console.error('Error archiving reference:', error);
      toast.error('Failed to archive. Please try again.');
    } finally {
      setIsArchiving(false);
    }
  };

  // Reset reference when brand changes
  const handleBrandChange = (value: string) => {
    onFieldChange("brand", value);
    if (formData.reference) {
      onFieldChange("reference", "");
    }
  };

  const handleReferenceChange = (selectedValue: string) => {
    // selectedValue is the prompt_name (we use prompt_name as the option id).
    // Store it in formData.reference — this is what gets sent to the generate-prompt n8n workflow.
    onFieldChange("reference", selectedValue);

    // Look up the Airtable record ID so we can fetch the full reference data.
    const recordId = getRecordId(selectedValue, formData.brand);
    onReferenceChange(formData.brand, recordId);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6"
    >
      <div className="grid gap-6 md:grid-cols-2">
        <FormField
          type="select"
          label="Brand"
          required
          options={[...BRANDS]}
          value={formData.brand}
          onChange={handleBrandChange}
          placeholder="Select a brand"
          error={errors.brand}
        />

        <div className="space-y-1.5">
          <ReferenceSelect
            label="Reference"
            required
            value={formData.reference}
            onChange={handleReferenceChange}
            placeholder={
              !formData.brand
                ? "Select a brand first"
                : isLoadingList
                ? "Loading prompts..."
                : availableReferences.length === 0
                ? "No prompts found for this brand"
                : "Select a reference"
            }
            error={errors.reference}
            disabled={!formData.brand || isLoadingList || availableReferences.length === 0}
            references={availableReferences}
          />
          {/* Action buttons row — always visible when a brand is selected */}
          {formData.brand && (
            <div className="flex justify-end gap-1">
              {/* Create New Prompt — lets user blend multiple references into a new one */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCreateDialogOpen(true)}
                className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
              >
                <Sparkles className="h-3 w-3" />
                Create New Prompt
              </Button>

              {/* Rename + Archive — only shown when a reference is selected */}
              {formData.reference && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const shortName = formData.reference.split(' — ')[0].trim();
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
      </div>

      {/* Show error if the prompt list failed to load */}
      {listError && (
        <p className="text-sm text-destructive">
          Could not load prompts: {listError}. Please refresh the page.
        </p>
      )}

      <PositionAndRatioSelector
        subjectPosition={formData.subjectPosition}
        aspectRatio={formData.aspectRatio}
        onSubjectPositionChange={(value) => onFieldChange("subjectPosition", value)}
        onAspectRatioChange={(value) => onFieldChange("aspectRatio", value)}
      />

      <FormField
        type="text"
        label="Theme"
        value={formData.theme}
        onChange={(value) => onFieldChange("theme", value)}
        placeholder="e.g., Dark Luxury Noir Valentine's"
        maxLength={100}
        error={errors.theme}
      />

      <FormField
        type="textarea"
        label="Description"
        value={formData.description}
        onChange={(value) => onFieldChange("description", value)}
        placeholder="Describe your image in detail..."
        maxLength={500}
        rows={4}
        error={errors.description}
      />

      <ReferencePromptDataDisplay
        brand={formData.brand}
        category={selectedCategory}
        onSaved={refetch}
        data={
          formData.reference
            ? {
                format_layout: formData.format_layout || referencePromptData?.format_layout || "",
                primary_object: formData.primary_object || referencePromptData?.primary_object || "",
                subject: formData.subject || referencePromptData?.subject || "",
                lighting: formData.lighting || referencePromptData?.lighting || "",
                mood: formData.mood || referencePromptData?.mood || "",
                background: formData.background || referencePromptData?.background || "",
                positive_prompt: formData.positive_prompt || referencePromptData?.positive_prompt || "",
                negative_prompt: formData.negative_prompt || referencePromptData?.negative_prompt || "",
              }
            : null
        }
        isLoading={isLoadingReferenceData}
        disabled={false}
        onChange={(field, value) => onFieldChange(field, value)}
      />

      <div className="flex flex-col sm:flex-row gap-3 pt-4">
        <Button
          type="submit"
          disabled={isLoadingReferenceData}
          className="flex-1 sm:flex-none gradient-primary gap-2 h-12 text-base font-medium shadow-glow disabled:opacity-50"
        >
          <Sparkles className="w-5 h-5" />
          {isLoadingReferenceData ? "Loading..." : "Generate Prompt"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onClear}
          disabled={isLoadingReferenceData}
          className="gap-2 h-12"
        >
          <Trash2 className="w-4 h-4" />
          Clear Form
        </Button>
        <Button type="button" variant="outline" onClick={onOpenFavorites} className="gap-2 h-12 sm:ml-auto">
          <Heart className="w-4 h-4" />
          Favorites
        </Button>
      </div>
      {/* Rename dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Reference</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="rename-input-form">New name</Label>
            <Input
              id="rename-input-form"
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

      {/* Create blended prompt dialog */}
      <CreateBlendedPromptDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        brand={formData.brand}
        references={availableReferences}
        getRecordId={getRecordId}
        onSaved={refetch}
      />

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
    </form>
  );
}
