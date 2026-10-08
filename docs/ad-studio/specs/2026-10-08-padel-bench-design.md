# "Padel Bench": Trivago-style acted version of the Optinet ad (design)

Status: design approved by the client on 2026-10-08 ("it can be many people, not just two, then proceed").
Owner: executive producer. Team: see `docs/ad-studio/ROLES.md` (team map).

## 1. Goal
The client reviewed "Four Seats": "looks good but not that entertaining." This is a second 30 s version in the Trivago format: real-looking people in a relatable moment, short natural dialogue, the brand said in the scene. It ends on the approved end card, where the narrator says "Digital team? … Go with Optinet!" while OP / TI / NET reveal on the spoken syllables.

**Success means all of these:**
- the client calls it entertaining and premium;
- no "AI slop" tells (voices, faces, hands);
- Optinet's offer is clear with the sound off by about 3 s;
- the cut-downs (15/10/6 s) can be made from it like the master.

**Not this:** "The Tooth" (round 2: costume premise, too much talking, AI voices, unclear message). This version is an explicit client exception to the no-on-camera-dialogue rule (LESSONS rule 2, RUBRIC gate 1), not a precedent.

## 2. Decisions (client)
| Question | Decision |
|---|---|
| Story | Business owners compare notes (Trivago structure: the peers who didn't vs. the one who did) |
| Script | "Padel Bench": same match, different night |
| Cast | Many people allowed: the doubles foursome on the bench after a padel match (revision in progress) |
| Acting method | Tested both on the hardest shot. **Client picked A (Veo 3.1 speaking actors), 2026-10-08.** Method B failed by measurement: in a 4-person frame sync.so put both lines on the wrong face (Grace) |
| Casting | Group still "Option 1" (Ben / Leo / Grace / Maya in Set 1) locked; every shot's first frame is derived from it |

## 3. Script
**Base:**
- Setting: a glass-walled indoor padel court at 9 a.m., with no signage and no other people.
- Shot structure:
  - 0–4.6: wrecked owners vs. one fresh owner.
  - 4.6–9.2: the inbox and support pain; she "slept. We went with Optinet."
  - 9.2–13.8: the phone demo naming SEO, AI automation, design and support.
  - 13.8–19.0: the laugh line, "I'm also our chatbot."
  - 19.0–24.0: the catchphrase "You should've gone with Optinet." and an echo.
  - 24–30: the existing end card.

**The foursome revision** (the writer is working on it) follows these rules:
- up to 4 characters;
- at most about 50 words, at most 8 words per line;
- at most 2 speakers per shot, with group reactions non-speaking;
- one wide four-shot to open and one for the payoff;
- each character in a distinct wardrobe colour.

**Graphics layer** (our HTML engine, never inside the AI footage): glass "job tags" stack on the wrecked owners (Owner / SEO / Website / Support / Chatbot), the fresh owner has one green chip, "Digital team: Optinet", and a services card ticks on the spoken words.

## 4. Production method
- **Casting:** Gemini 3 Pro Image portrait candidates per character, a set plate, and one group still (all four on the bench in the set). The client approves a casting sheet. Veo accepts at most 3 reference images: the group still plus the speaking characters' close portraits, chosen per shot.
- **Test (A vs B), on the catchphrase shot (≤ 8 s):**
  - **A:** Veo 3.1 Standard, 1080p, 9:16, 8 s, with reference images; the dialogue goes in quotes in the prompt and the audio is generated natively. 2 takes.
  - **B:** the same shot generated silent; the lines recorded as directed Gemini TTS character voices (not Despina or Charon, which stay the narrator), checked against the transcript and clean-trimmed, then lip-synced with Higgsfield `sync_so` (Sync Lipsync 3). sync.so handles one face per pass, so the shot may be split into singles for B.
  - **Gate for both:** every take is transcribed back and must match the words, especially "Optinet" = OP-tih-net. The client watches A and B and picks.
- **Full production with the winner:** 5 shots × 2 takes. Continuity comes from the references and first frames. The production lead and QC pick per shot. Graphics are rendered over the footage, then the end card is spliced in from the master.

## 5. Sound
- **Under the scene:** room tone, distant padel ball pops and the dialogue. No music.
- **End card:** music drops in at 24.0 on a downbeat with a 15 ms start ("problem = quiet, solution = music"), then the narrator tag and the piano motif on the syllables.
- **Mix:** the dialogue sits ≥ 18 dB median above everything else (measured with the voice-muted render), -14 LUFS, ≤ -1 dBTP, with every TTS clip clean-trimmed.

## 6. Budget (approval limits)
| Item | Estimate |
|---|---|
| Casting + set + group still (Gemini 3 Pro Image, ~12 images) | ≈ $2 |
| Test A (2 × 8 s Veo 3.1 Standard) | ≈ $6.40 |
| Test B (2 × 8 s silent Veo 3.1 Fast + TTS + sync.so) | ≈ $2 + a few Higgsfield credits |
| Full production (5 shots × 8 s × 2 takes): Standard / Fast | ≈ $32 / ≈ $10 |
| **Cap** | **$50 Google spend + 40 Higgsfield credits**; stop and ask before exceeding |

## 7. Gates before the client sees anything
1. Voice director: transcript gate on every line, phonetic "Opti-net" where needed, no robotic tells reported by measurement.
2. Brand guardian: no logos or brand marks on the court glass, rackets, phones or clothing; phones face-down or screen away; no invented metrics.
3. QC lead: contact sheet plus dense frames per shot (faces stay consistent across shots, hands, reflections in the glass, no text in the footage).
4. Client proxy: score against RUBRIC as this exception.
5. Client: picks at casting, at the A-vs-B test, and at the final.

## 8. Deliverables
30 s master (9:16), then 15 / 10 / 6 s cut-downs. All of these go in `Desktop/Four Seats/padel-bench/`.

## 9. Risks
- **AI voices:** handled by the test and the client's ear before the full spend.
- **Multiple faces drifting between shots:** handled by the group still and per-shot references, with at most 2 speakers per shot.
- **Brand mispronunciation:** handled by the transcript gate and re-rolls.
- **Glass reflections and props:** handled by keeping rackets untouched and the court glass angled and defocused.
- **Veo safety filters on people:** fall back to another take or prompt wording.
