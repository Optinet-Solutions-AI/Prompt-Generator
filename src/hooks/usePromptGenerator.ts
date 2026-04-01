import { useState, useCallback, useRef, useEffect } from 'react';
import {
  AppState,
  FormData,
  INITIAL_FORM_DATA,
  GeneratePromptResponse,
  PromptMetadata,
} from '@/types/prompt';

// Supabase config — used to auto-save every generated image to the library
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL      || '';
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const SB_HEADERS = {
  apikey: SUPABASE_ANON,
  Authorization: `Bearer ${SUPABASE_ANON}`,
  'Content-Type': 'application/json',
};

/** Save a single image record to the generated_images table (fire-and-forget). */
function saveImageToLibrary(params: {
  publicUrl: string;
  provider: string;
  aspectRatio: string;
  resolution: string;
  filename: string;
}) {
  if (!SUPABASE_URL || !params.publicUrl) return;
  fetch(`${SUPABASE_URL}/rest/v1/generated_images`, {
    method: 'POST',
    headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify({
      public_url:   params.publicUrl,
      provider:     params.provider,
      aspect_ratio: params.aspectRatio,
      resolution:   params.resolution || '1K',
      filename:     params.filename,
      storage_path: '',
    }),
  }).catch(err => console.error('[saveImageToLibrary] failed:', err));
}

type FormErrors = Partial<Record<keyof FormData, string>>;

// API call to generate prompt via n8n webhook
async function generatePrompt(formData: FormData): Promise<GeneratePromptResponse> {
  const apiData = {
    brand: formData.brand,
    reference: formData.reference, // already the full prompt_name from Airtable
    subjectPosition: formData.subjectPosition,
    aspectRatio: formData.aspectRatio,
    theme: formData.theme,
    description: formData.description,
    format_layout: formData.format_layout,
    primary_object: formData.primary_object,
    subject: formData.subject,
    lighting: formData.lighting,
    mood: formData.mood,
    background: formData.background,
    positive_prompt: formData.positive_prompt,
    negative_prompt: formData.negative_prompt,
  };

  const response = await fetch('/api/generate-prompt', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(apiData),
  });

  if (!response.ok) {
    throw new Error('Failed to generate prompt');
  }

  return response.json();
}

// API call to save prompt via n8n webhook
async function savePrompt(
  formData: FormData,
  generatedPrompt: string,
  timestamp: string
): Promise<{ success: boolean; message: string }> {
  const response = await fetch('/api/save-prompt', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      brand:            formData.brand,
      generated_prompt: generatedPrompt, // n8n sends this to GPT for dissection
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to save prompt');
  }

  return response.json();
}

export type GeneratedImage = {
  displayUrl: string;
  editUrl: string;
  referenceLabel: string;
  provider: 'chatgpt' | 'gemini';
  generatedBrand: string;
};

export type GeneratedImages = { 
  chatgpt: GeneratedImage[]; 
  gemini: GeneratedImage[] 
};

export function usePromptGenerator() {
  const [appState, setAppState] = useState<AppState>('FORM');
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState<FormErrors>({});
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [promptMetadata, setPromptMetadata] = useState<PromptMetadata | null>(null);
  const [processingTime, setProcessingTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [generatedTimestamp, setGeneratedTimestamp] = useState('');
  const [generatedImages, setGeneratedImages] = useState<GeneratedImages>({ chatgpt: [], gemini: [] });
  const [isRegeneratingPrompt, setIsRegeneratingPrompt] = useState(false);

  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // Timer effect
  useEffect(() => {
    if (appState === 'PROCESSING') {
      startTimeRef.current = Date.now();
      timerRef.current = window.setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 100);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [appState]);

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.brand) newErrors.brand = 'Please select a brand';
    if (!formData.reference) newErrors.reference = 'Please select a reference';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleFieldChange = useCallback((field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }, [errors]);

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;

    setAppState('PROCESSING');
    setElapsedTime(0);
    setErrorMessage('');

    try {
      const startTime = Date.now();
      const response = await generatePrompt(formData);
      const endTime = Date.now();
      setGeneratedPrompt(response.prompt);
      setPromptMetadata(response.metadata);
      setProcessingTime((endTime - startTime) / 1000);
      setGeneratedTimestamp(new Date().toISOString());
      setAppState('RESULT');
    } catch (error) {
      console.error('Error generating prompt:', error);
      setErrorMessage('Something went wrong. Please try again.');
      setAppState('FORM');
    }
  }, [formData, validateForm]);

  const handleSave = useCallback(async () => {
    setAppState('SAVING');

    try {
      await savePrompt(formData, generatedPrompt, generatedTimestamp);
      setAppState('SAVED');
    } catch (error) {
      console.error('Error saving prompt:', error);
      setErrorMessage('Failed to save prompt. Please try again.');
      setAppState('RESULT');
    }
  }, [formData, generatedPrompt, generatedTimestamp]);

  const handleDontSave = useCallback(() => {
    setAppState('SAVED'); // Just hide the save buttons
  }, []);

  const handleGenerateAgain = useCallback(async () => {
    // Use metadata values if available (for regenerating from result page)
    if (promptMetadata) {
      setIsRegeneratingPrompt(true);
      setErrorMessage('');

      try {
        const startTime = Date.now();
        // Send metadata directly to API (already has formatted reference)
        const response = await fetch('/api/generate-prompt', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(promptMetadata),
        });

        if (!response.ok) {
          throw new Error('Failed to generate prompt');
        }

        const data = await response.json();
        const endTime = Date.now();
        setGeneratedPrompt(data.prompt);
        setPromptMetadata(data.metadata);
        setProcessingTime((endTime - startTime) / 1000);
        setGeneratedTimestamp(new Date().toISOString());
      } catch (error) {
        console.error('Error generating prompt:', error);
        setErrorMessage('Something went wrong. Please try again.');
      } finally {
        setIsRegeneratingPrompt(false);
      }
    } else {
      handleSubmit();
    }
  }, [promptMetadata, handleSubmit]);

  const handleAddGeneratedImage = useCallback((provider: 'chatgpt' | 'gemini', image: { displayUrl: string; editUrl: string; referenceLabel: string; generatedBrand: string; resolution?: string }) => {
    setGeneratedImages(prev => ({
      ...prev,
      [provider]: [...prev[provider], { ...image, provider }]
    }));

    // Auto-save to image library immediately so it persists when navigating away
    saveImageToLibrary({
      publicUrl:   image.displayUrl,
      provider,
      aspectRatio: promptMetadata?.aspectRatio || '16:9',
      resolution:  image.resolution || '1K',
      brand:       image.generatedBrand,
      filename:    `${provider}-${Date.now()}.png`,
    });
  }, [promptMetadata]);

  const handleRemoveGeneratedImage = useCallback((provider: 'chatgpt' | 'gemini', index: number) => {
    setGeneratedImages(prev => ({
      ...prev,
      [provider]: prev[provider].filter((_, i) => i !== index)
    }));
  }, []);

  const handlePromptChange = useCallback((newPrompt: string) => {
    setGeneratedPrompt(newPrompt);
  }, []);

  const handleMetadataChange = useCallback((field: keyof PromptMetadata, value: string) => {
    setPromptMetadata((prev) => prev ? { ...prev, [field]: value } : null);
  }, []);

  const handleClearForm = useCallback(() => {
    setFormData(INITIAL_FORM_DATA);
    setErrors({});
    setGeneratedPrompt('');
    setPromptMetadata(null);
    setProcessingTime(0);
    setElapsedTime(0);
    setErrorMessage('');
    setGeneratedTimestamp('');
    setGeneratedImages({ chatgpt: [], gemini: [] });
    setAppState('FORM');
  }, []);

  const handleGoBack = useCallback(() => {
    setErrorMessage('');
    setAppState('FORM');
  }, []);

  const handleEditForm = useCallback(() => {
    // Go back to form but keep data
    setAppState('FORM');
  }, []);

  /**
   * Used by the Sports Banner Wizard to submit a fully assembled FormData
   * without going through the normal form validation (brand + reference check).
   * The wizard pre-fills all fields before calling this.
   */
  const handleSubmitWithData = useCallback(async (data: Partial<FormData>) => {
    const mergedData: FormData = { ...INITIAL_FORM_DATA, ...data };
    setFormData(mergedData);
    setAppState('PROCESSING');
    setElapsedTime(0);
    setErrorMessage('');
    setGeneratedImages({ chatgpt: [], gemini: [] });

    try {
      const startTime = Date.now();
      const response = await generatePrompt(mergedData);
      const endTime = Date.now();
      setGeneratedPrompt(response.prompt);
      setPromptMetadata(response.metadata);
      setProcessingTime((endTime - startTime) / 1000);
      setGeneratedTimestamp(new Date().toISOString());
      setAppState('RESULT');
    } catch (error) {
      console.error('Error generating prompt:', error);
      setErrorMessage('Something went wrong. Please try again.');
      setAppState('FORM');
    }
  }, []);

  return {
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
  };
}