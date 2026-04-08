# Feedback on BRD: AI Image Generator for Sportsbook Promotions

**Date:** 2026-04-08
**Status:** Review — Awaiting Alignment

---

## TL;DR

The BRD describes a system we **already partially built**. Our existing Sports Banner Wizard covers ~60% of what's described. The remaining ~40% (Arabic support, strict dimension/file-size control, brand guideline enforcement module, download/export pipeline) is achievable but needs clearer specs before we build.

---

## What Already Exists (No Need to Rebuild)

| BRD Requirement | Current State | Status |
|---|---|---|
| AI image generation | OpenAI (gpt-image-1) + Google Gemini + Cloud Run (up to 4K) | DONE |
| Input fields for description | Sports Banner Wizard — 5-step form with sport, players, action, background, lighting, occasion | DONE |
| Preview generated images | ImageModal with side-by-side preview, 4-variation spectrum | DONE |
| Allow regeneration | "Regenerate Prompt" + variation generation (4 creativity levels) | DONE |
| Brand enforcement (partial) | Brand color lock system for 9 brands with palette enforcement | DONE |
| Mobile & desktop dimensions | Banner size selector with Portrait/Square/Landscape + custom dimensions | DONE |
| Process flow (User Input → AI → Generate → Preview) | Full pipeline working end-to-end via n8n webhooks | DONE |

---

## What's Missing / Needs Work

### 1. Arabic Version Support (NEW — Needs Spec)
**BRD says:** "Build same image for Arabic version"
**Questions we need answered:**
- Is this RTL text overlay on the same generated image? Or a completely separate Arabic-language prompt that generates a different image?
- Do we need Arabic text rendered ON the banner (AI models are notoriously bad at text rendering)?
- Or is this just mirrored/flipped layout for RTL contexts?
- Who provides the Arabic translations — the user types it, or we auto-translate?

**Our recommendation:** If Arabic means text overlays, AI image generators can't reliably render Arabic script. We'd need a **post-processing step** (e.g., HTML/Canvas overlay on top of the AI image). This is doable but is a separate feature with its own complexity.

### 2. Strict Dimension & File Size Control (PARTIAL)
**BRD says:** "Accept dimensions, file size"
**Current state:** We support aspect ratios and general sizes (512px to 4K), but:
- No **exact pixel dimension** input (e.g., "1328x784 exactly")
- No **file size targeting** (e.g., "must be under 200KB")
- AI models generate at fixed sizes — exact dimensions require post-processing (resize/crop)

**Our recommendation:** Add a resize/compress step after generation. Achievable with sharp or canvas libraries on Vercel serverless. Low effort.

### 3. Brand Consistency Module (PARTIAL)
**BRD says:** "Brand enforcement" + "Brand guidelines provided"
**Current state:** We enforce brand **colors** via color-lock in prompts. But we don't enforce:
- Logo placement
- Typography rules
- Safe zones / margins
- Specific brand characters (we reference them in prompts but can't guarantee AI renders them correctly)

**Questions we need answered:**
- What does "brand compliance" mean specifically? Color only? Or logo + typography + layout rules?
- If logo/text placement is needed, this is a **post-processing overlay** — not something AI generation can guarantee
- Will brand guidelines be provided as a structured document we can codify?

### 4. Download Module (PARTIAL)
**BRD says:** "Downloadable outputs"
**Current state:** Users can view and copy images, but there's no dedicated **download button with format selection** (PNG/JPEG/WebP) or batch download.

**Our recommendation:** Simple to add. Low effort.

### 5. Versioning (NEW)
**BRD says:** "Versioning"
**Questions we need answered:**
- Version history per prompt? Per generated image? Per campaign?
- Do users need to rollback to previous versions?
- Is this audit trail ("who generated what, when") or creative versioning ("v1, v2, v3 of this banner")?

**Our recommendation:** If it's image version history, we can store generations in Supabase with timestamps. If it's full audit trail, that's a bigger scope item.

### 6. A/B Testing & Templates (FUTURE — Out of Scope for Now)
Listed as "Future Enhancements" in BRD. Agreed — park these for later.

---

## Feasibility Summary

| Requirement | Feasibility | Effort | Notes |
|---|---|---|---|
| Core AI generation | Already built | 0 | No work needed |
| Input module (description, settings) | Already built | 0 | Sports Wizard exists |
| Brand color enforcement | Already built | 0 | Color-lock system works |
| Preview & regenerate | Already built | 0 | Full pipeline works |
| Exact dimension control | Easy | Low | Add resize post-processing |
| File size targeting | Easy | Low | Add compression step |
| Download with format options | Easy | Low | Add download button + format picker |
| Arabic image generation | Needs clarification | Medium-High | Depends on whether text overlay is needed |
| Brand guideline enforcement (full) | Needs clarification | Medium | Post-processing overlay for logos/text |
| Versioning | Needs clarification | Medium | Depends on scope definition |
| Multi-language support | Needs clarification | Medium | Translation source? Auto or manual? |
| A/B testing | Future | High | Park for later |
| Templates | Future | Medium | Park for later |

---

## Recommended Next Steps

1. **Align on the 3 open questions** (Arabic support scope, brand compliance definition, versioning scope)
2. **Confirm whether this is an extension of the current app or a separate tool** — the BRD reads like a new product, but 60% already exists in our Sports Banner Wizard
3. **Once aligned, we build only the delta** — don't rebuild what works
4. **Priority order:** Exact dimensions + download > Brand overlay > Arabic > Versioning

---

## Bottom Line

**Is this achievable? Yes.** Most of it already exists. The real work is in the gaps (Arabic, brand overlays, versioning), and those need clearer specs before we can estimate accurately. The BRD is a solid starting point but is too generic in places — we need specifics on the items flagged above before committing to a timeline.
