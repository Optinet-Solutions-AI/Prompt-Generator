# Test image models — short design (2026-11-19)

## Why

ChatGPT image quality has slipped and the 16 Nov meeting asked us to try newer models.
A side-by-side test on 3 real prompts (2026-11-18) found:

- **GPT Image 2.6 Flare** looks as good as or better than GPT Image 2 (the model behind the
  ChatGPT button today) at about a quarter of the price (~$0.042 against ~$0.161 per 2K image).
- **Nano Banana 2.1** (`gemini-nano-banana-2.1`) looks clearly better than the Gemini default
  (2.5 Flash). Its published price is about $0.050 per 2K image.

Before changing any default, the whole team should be able to try both on real work and
compare them with the current models.

## Goals

- Every approved user can choose **GPT Image 2.6 (test)** for ChatGPT images and
  **Nano Banana 2.1 (test)** for Gemini images.
- Each option shows its price per image, the same way the Gemini dropdown does today.
- The team usage page records the right cost for the new models.

## Non-goals

- Changing a default. GPT Image 2 and 2.5 Flash stay the defaults, so nobody's results change
  unless they pick a test model.
- Gemini Omni video and video frame editing. These are the next, separate piece.
- The RocketSpin tester page (`useAssistantImageGen`). It stays unchanged.
- Adding Nano Banana 2 (`gemini-3.1-flash-image`) or GPT Image 2.6 Sunburst. They cost the same
  or more and looked no better.

## Anti-goals

- A test model reaching someone who did not pick it. Every unknown or missing model id falls
  back to the current model, on both the server and the browser.
- A price or cost record that is a guess. Rates are checked against the official
  Google and OpenAI pricing pages and against one real call each.

## Approaches considered

- **A. A ChatGPT model dropdown beside the existing Gemini one (picked by John).** It matches
  what users already know, lets people mix models, and remembers each person's choice.
- B. One "Try test models" switch that moves both buttons at once. Fewer clicks, but no mixing,
  and a new kind of control.
- C. Swap the ChatGPT button to 2.6 for everyone. Cheaper straight away, but there is nothing to
  compare against, so it is not a test.

## How it works

- **Who sees it:** all users (John's choice). No tester list and no admin gate.
- **The model registry** (`api/_image-models.ts` and its mirror `src/lib/image-models.ts`) gets
  two new entries:
  - `gemini-nano-banana-2.1`, labelled "Nano Banana 2.1 (test)", shown in the Gemini dropdown.
  - `gpt-image-2.6-flare`, labelled "GPT Image 2.6 (test)", shown in a new ChatGPT dropdown.
  - `gpt-image-2` becomes the ChatGPT dropdown's "(current)" option.
- **The ChatGPT dropdown follows the rule the Gemini dropdown already uses:** one remembered
  choice per browser, used for new images, edits and variations.
  - The Gemini choice already drives Edit and Variations (`ImageModal`, `LikedImagesPanel`,
    `ImageLibrary`), so Nano Banana 2.1 will too.
  - The ChatGPT choice is wired the same way: `generate-image`, `edit-image` and
    `generate-variations` accept an OpenAI model id and resolve it safely, in the same way as
    `resolveGeminiModel`.
  - If a real call shows GPT Image 2.6 cannot edit images, edits and variations stay on
    GPT Image 2 for this test and the dropdown says so.
- **Where the dropdowns show:** next to the image buttons in the generated-prompt panel
  (`ResultDisplay`) and in the Get ideas result panel (`GeneratedPromptPanel`).
- **Prices shown:**
  - GPT Image 2.6 at ~$0.042 per image (measured at 2K, high quality).
  - Nano Banana 2.1 at $0.050 per image (2K).
  - Both are confirmed against the official pricing pages before they ship.
- **Cost records** use the new entries' token rates through the existing `recordImageUsage`
  and pricing code.

## Left to the builder

- Whether to make `ImageModelSelect` take a model list and storage key, or add a sibling
  component.
- The exact test cases. They must cover the fallback for an unknown or missing id on both
  providers, the dropdown labels, and each route sending the chosen model.

## Proof it is done

- Unit tests cover the registry, the resolvers, the labels and each route's model choice.
  The full suite, type check, lint (compared per file with main) and build pass.
- One real call per new model per path, at about $0.50 in total:
  - Nano Banana 2.1: generate and edit.
  - GPT Image 2.6: generate, edit and one variation.
- Each image is looked at, and each cost record is checked against the published rates.
- The UI is screenshotted before and after, on both panels.
- After deploy, the live site shows both dropdowns, and one image from each test model shows
  up in the Library and on the team usage page.

## Note

This branch starts from `main`. The sidebar branch (PR #4) needs `main` merged in again before
it ships, as before.
