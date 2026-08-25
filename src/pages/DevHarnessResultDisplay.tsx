// ============================================================================
// THROWAWAY SCREENSHOT HARNESS — NOT PART OF THE FEATURE. DELETE BEFORE MERGE.
// ============================================================================
//
// Why this exists: ResultDisplay never renders on the local dev server in the
// normal app flow, because appState only reaches 'RESULT' after a successful
// POST to /api/generate-prompt, and `npm run dev` (Vite) does not serve /api
// routes. That means the Save-as-New-Reference dialog — where the FIX 1
// layout bug lives — cannot be seen locally without either a full Vercel
// deploy or a harness like this one.
//
// This file mounts <ResultDisplay> directly with hand-written mock props, and
// stubs window.fetch (in THIS file only) so clicking "Dissect" in paste mode
// returns a canned response instead of hitting a real API. ResultDisplay.tsx
// itself is not modified in any way to make this work — it is used exactly
// as shipped.
//
// Delete this file and its route in App.tsx once the screenshot has been
// taken and reviewed.
// ============================================================================

import { useEffect, useState } from "react";
import { ResultDisplay } from "@/components/ResultDisplay";
import type { PromptMetadata } from "@/types/prompt";

const MOCK_METADATA: PromptMetadata = {
  brand: "Roosterbet",
  reference: "",
  subjectPosition: "Centered",
  aspectRatio: "16:9",
  theme: "",
  description: "",
  format_layout: "",
  primary_object: "",
  subject: "",
  lighting: "",
  mood: "",
  background: "",
  positive_prompt: "",
  negative_prompt: "",
};

// A realistic ~300-word prompt, the length the review specifically flagged as
// the worst case (renders at full height once in the "Prompt text" box and
// again in positive_prompt).
const LONG_MOCK_PROMPT = `A hyperrealistic cinematic sports banner: a lone athlete mid-sprint on a professional running track at night, captured from a low three-quarter angle just as their front foot strikes the track, every muscle tensed and visibly straining under the effort. Above and slightly behind them, a massive holographic trophy hovers over the stadium pitch, rendered in glowing cyan and gold light with faint particle trails drifting off its edges and catching the stadium floodlights. The background is a packed night stadium full of thousands of blurred spectators under bright stadium floodlights, with a faint scoreboard glow visible in the far distance and a light haze hanging over the upper tiers. The mood is triumphant and electric, full of high-stakes anticipation, the kind of moment right before a personal record falls. Camera lens flare glints off the trophy's holographic surface and off the beads of sweat on the athlete's brow. Shot in a wide cinematic aspect ratio with dramatic rim lighting separating the athlete from the dark stadium background, giving the whole scene a sense of depth and scale. Ultra-detailed skin texture, realistic fabric physics on the athlete's jersey rippling mid-stride, shallow depth of field blurring the crowd into soft bokeh so the eye stays on the runner. The overall composition leaves clear negative space on the left third of the frame for promotional text and a logo. Color grading leans into deep stadium blacks contrasted against the trophy's cyan-gold glow, giving the image a premium, big-event broadcast look rather than a flat product shot. No text, no logos, no watermarks anywhere in the image itself.`;

// Canned /api/dissect-prompt response. Deliberately leaves format_layout,
// lighting and negative_prompt as "Not specified" — the prompt above says
// nothing about any of those — so the screenshot also doubles as a quick
// sanity check that the extract-don't-invent behaviour looks right.
const MOCK_DISSECT_FIELDS = {
  format_layout: "Not specified in the source prompt",
  primary_object:
    "A massive holographic trophy hovering above the stadium pitch, glowing cyan and gold with faint particle trails drifting off its edges",
  subject:
    "A lone athlete captured mid-sprint, muscles tensed, photographed from a low three-quarter angle at the instant their front foot strikes the track",
  lighting: "Not specified in the source prompt",
  mood: "Triumphant, electric, high-stakes anticipation",
  background:
    "A packed night stadium with thousands of blurred spectators under bright floodlights, a faint scoreboard glow visible in the distance",
  positive_prompt: LONG_MOCK_PROMPT,
  negative_prompt: "Not specified in the source prompt",
};

export default function DevHarnessResultDisplay() {
  const [metadata, setMetadata] = useState<PromptMetadata>(MOCK_METADATA);

  useEffect(() => {
    const realFetch = window.fetch.bind(window);
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;

      if (url.includes("/api/dissect-prompt")) {
        await new Promise((r) => setTimeout(r, 300)); // simulate network latency
        return new Response(
          JSON.stringify({
            fields: MOCK_DISSECT_FIELDS,
            usage: { input_tokens: 500, cached_input_tokens: 0, output_tokens: 420 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      // The reference dropdown (usePromptList) fetches this on mount; return
      // an empty list so it resolves cleanly instead of erroring against a
      // dev server that doesn't serve /api.
      if (url.includes("/api/list-prompts")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return realFetch(input as any, init);
    }) as typeof window.fetch;

    return () => {
      window.fetch = realFetch;
    };
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "sans-serif", marginBottom: 16 }}>
        DEV HARNESS — click the save icon (top toolbar) to open the dialog
      </h1>
      <ResultDisplay
        prompt={LONG_MOCK_PROMPT}
        metadata={metadata}
        processingTime={4.2}
        appState="RESULT"
        generatedImages={{ chatgpt: [], gemini: [] }}
        isRegeneratingPrompt={false}
        referencePromptData={null}
        isLoadingReferenceData={false}
        onReferenceChange={() => {}}
        onEditForm={() => {}}
        onGenerateAgain={() => {}}
        onClearForm={() => {}}
        onOpenFavorites={() => {}}
        onPromptChange={() => {}}
        onMetadataChange={(field, value) => setMetadata((m) => ({ ...m, [field]: value }))}
        onAddGeneratedImage={() => {}}
        onAppendEditedImage={() => {}}
        onRemoveGeneratedImage={() => {}}
        persistedVariations={[]}
        onVariationsChange={() => {}}
      />
    </div>
  );
}
