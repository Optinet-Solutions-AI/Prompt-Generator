# Ad Studio: lessons log (the team's "training")

Every agent on the ad team reads this file **before** doing any work. Each entry is a real client verdict and the rule it teaches. When the client rejects or praises something, a new entry goes at the top. Rules here override anything in a role playbook.

The client is the Optinet founder, who is also the product owner. Their taste is the target.

---

## 2026-10-09: "Page Seven" test clip rejected, "still bad… I'm disappointed with the results, it's all bad"
**What we made:** the single "moment" test the client approved: 7 s, a florist (Marcus) checks his phone after a café owner (Priya) says her customer googled "florist near me". A glass search card types the query and a page counter ticks 1→7 as his smile drops; "…Uh, page seven." Our panel had scored the concept 6.5 ("maybe, leaning yes").

**Client verdict:** "Still bad. By now I'm disappointed with the results. It's all bad."

**What this tells us (executive producer):**
1. **AI-acted comedy is not working for this client, four times running** (Padel Bench, Four Hires, Page Seven, and "The Tooth" before them), even when every technical gate passes and the script was approved. Stop proposing it unless the client asks.
2. **Veo cannot deliver comic timing on demand.** In 4 of 4 takes it bunched Marcus's two lines together, so the silent beat the joke needed never existed. It swapped speakers in 2 takes and added music in another. A joke that depends on a performance beat is not dependable with these tools.
3. **Our panel is miscalibrated for acted work.** The client proxy scored concepts 6–6.5 that the client rejected outright. Until recalibrated, subtract about 3 points from proxy scores for acted/comedy concepts, and never present a proxy score as a prediction of approval.
4. **The best-rated work is still "Four Seats"** (visual, motion graphics, narrator: "good and professional"). The tools are reliable in that format.

## 2026-10-08: "Four Hires" (café, Leo & Nadia) rejected, "it's not entertaining or promotional"
**What we made:** 24.4 s. Two owners at a café table, made in 3 Veo steps (each continuing from the last frame), 6 lines: "I need to hire four people." / "For what?" / "SEO, design, AI automation, support." / "Or get Optinet. Your whole digital team, on demand." / "Do they need desks?" / "No desks. Just more customers." One glass caption (four job chips fold into a green Optinet pill), then the Four Seats end card. Technically clean: right words and speakers, consistent faces and voices, seamless joins, -14 LUFS. The client approved this script on paper before production.

**Client verdict:** "It's not entertaining or promotional."

**Why it failed (our diagnosis):**
1. **Nothing happens.** Two people sit and talk at a table for 19 s with a locked-off camera. There is no situation, no escalation, no surprise and no visual payoff, so there is nothing to watch or retell. The one joke ("Do they need desks?") is mild wordplay, said softly.
2. **No proof and no offer.** "More customers" is a vague claim. There is no number, no demo of a result, no price or offer in the scene, and Optinet is named once before the end card. Trivago shows the app and a concrete saving ("same hotel, $100 less") and says the brand 5 times.
3. **We over-corrected into safe.** After "The Tooth" (too silly) and "Padel Bench" (too messy) we stripped everything back to two calm people, a clear line and one caption. That is clear but bland. The target is in between: premium, but with energy and a payoff.
4. **Paper approval doesn't predict entertainment.** A script that reads clear can play flat. Clarity can be judged on paper; entertainment can't.

**Rules learned:**
1. **Every ad needs a "moment":** a surprise, an escalation or a visual payoff the viewer would retell. Talking heads at a table are not entertainment, however clean.
2. **Promotional means a concrete offer and proof, shown in the scene:** what you get, a real number (price, saving or a real result the client gives us; never invented), the product or result on screen, the brand said 3+ times, and the call to action before the end card, not only on it.
3. **Energy is part of the brief:** camera moves and cuts, a scene that changes, and ad music under the scene where it helps. A 19 s static two-shot is a no.
4. **Test the moment before the full spend:** after the script is approved, make the single funniest or most surprising beat first (one clip or an animatic) and show it to the client. Only then produce the rest.
5. **Score "entertaining" and "promotional" separately** (RUBRIC). A clean, clear ad that scores low on either is a reject.

## 2026-10-08: "Padel Bench" (acted Trivago-style version) rejected, "the purpose was not clear, the intention was not there, too messy"
**What we made:** 30 s, a doubles foursome on a bench after padel (Veo 3.1 speaking actors), 11 lines across 4 characters in 25 s, glass job-tags stacking on three heads, a services card, "Chatbot" tag drops, a "New enquiry" chip, then the Four Seats end card. Technically clean: every word right, consistent faces, no logos, -14 LUFS.

**Client verdict:** "It's bad. The purpose was not clear, the intention was not there, it's too messy."

**Rules learned:**
1. **One clear proposition, stated, not inferred.** Trivago works because one literal comparison with a concrete payoff ("same hotel, $100 less") is said out loud. Our premise (a bragging contest about exhaustion, "I slept") asked the viewer to infer the offer. The viewer must hear what Optinet does and what they get within the first lines.
2. **Fewer people, fewer lines.** Two characters, about 4–6 lines, one exchange the viewer can follow on first watch. More characters made it messier, not funnier. When a client says "it can be many people", treat it as permission, not a target, and flag the clarity cost.
3. **One graphic idea per ad.** Seven tag types, leader lines and a card competing with four faces is clutter. Use one device, used consistently.
4. **The setup must say who these people are and what they want** (business owners who want to grow), before any joke.
5. **Technically clean is not good.** Every gate passed, and the ad still failed on intention. The panel must score clarity of purpose first: "in one sentence, what is this ad telling me, and is that obvious on first watch?"

## 2026-10-08: "Padel Bench" test findings (Veo 3.1 speaking actors), internal QC, not a client verdict yet
**Context:** the client asked for an acted, entertaining Trivago-style version ("not AI slop"), with the premise "owners compare" and the script "Padel Bench" (doubles foursome). Test shot: the payoff wide, "You should've gone with Optinet."

**Measured findings (4 Veo 3.1 Standard takes + 2 silent Fast takes):**
1. **Veo adds action you didn't ask for:** 4 of 6 takes stood the speaker up and walked her into the foreground. Fix: "EVERYONE STAYS SEATED … nobody stands up, nobody leaves the bench, nobody walks", plus "standing up, walking" in the negative prompt.
2. **Veo invents real sportswear logos** when it shows more clothing (a Nike swoosh twice, a Lotto-like chest mark once), even with "no logos" in the prompt. Fix: name the brands in the negative prompt (Nike, Adidas, Lotto, Puma, swoosh) and say "completely plain and unbranded". The brand guardian checks chests and shorts in close crops on every take.
3. **Veo mispronounces the brand:** 2 of 4 speaking takes said "Optusnet". Writing "Opti-net" in the quoted line didn't fully fix it. The transcript gate catches it, so budget for about 2 takes per passing take.
4. **Veo can give one speaker both lines:** take 1 had the woman say Ben's line. Fix: identify each speaker by position and wardrobe, and add "in his own low male voice".
5. **The API format:** `predictLongRunning` needs `image: {bytesBase64Encoded, mimeType}` (inlineData is rejected) and a numeric `durationSeconds`.
6. **Price:** Veo 3.1 Standard 8 s 1080p = $3.20 per take; Fast = $0.96; Sync Lipsync 3 (Higgsfield `sync_so`) = 28.8 credits per 8 s.

## 2026-10-08: "It doesn't mix well with the first part" ("Just you?" + a bell for each chair)
**Client verdict:** ad music running from frame 0 under "Just you?" and the four seat chimes didn't mix. An upbeat track in its own rhythm was laid over an intimate opening and a chime motif.

**Rules learned:**
1. **Problem = quiet, solution = music.** The hook plays without music (room tone, the narrator's question, the seat chimes alone). The ad music drops in on a downbeat exactly when the team is complete (3.00, the 4th chair), as a lift of about 9 dB.
2. **The chimes and the music share one phrase.** Seats 1–3 play Do-Mi-Sol; the 4th chime is dropped, because the music's first downbeat (key-matched) completes the phrase.
3. **The drop must hit:** a 15 ms click-free start, not a 0.2 s fade (a fade softens the downbeat).

## 2026-10-08: "The music is too loud, it overwhelms the voice-over"
**Client verdict** (on the 6 ad-music options): "All the background music is bad and it's too loud, it overwhelms the voice-over." The client then clarified: "the video is good, the music is the problem" and "we're not focusing on the niche but our target market" (the music must suit business owners, not a niche taste).

**Cause:** the voice was set only ~4 LU above the bed. That was tolerable for sparse film scores, but dense, compressed ad music swamped the narrator. A bad balance also makes every track sound bad, so judge music only after the balance is right.

**Rules learned (mix engineer, mandatory):**
1. **Broadcast balance:** music bed ≈ 12 LU under the narrator before ducking (MUSIC_GAIN = narrator LUFS − 12 − track LUFS). Ducking is deeper and faster: sidechain threshold 0.01, ratio 10, attack 15 ms, release 400 ms.
2. **Measure the voice-over-bed ratio on every line:** render the same mix with the voice muted (ducking still keyed). Target ≥ 18 dB median and ≥ 12 dB minimum; the minimum is only allowed where an SFX or the motif deliberately doubles the line.
3. **Add a final peak limiter after loudness make-up.** A quieter bed means more make-up gain, and peaks went above 0 dBTP. Ship at -14 LUFS, ≤ -1 dBTP.

## 2026-10-08: Fourth music rejection, "it's not like an ad"
**Client verdict** (on the warm, beatless "marimba glow" score, after the cut-downs): "Still don't like the background music, it's not like an ad."

**Cause:** we overcorrected. After "beatbox" we banned beats altogether and drifted into gentle film-score calm. The first track's real fault was a muffled kick with no melody, not the fact that it had a beat. Real ad music is upbeat and catchy: melody, bright chords and a light groove of drums and claps from the first second, building to a happy lift.

**Rules learned:**
1. **The target sound is a commercial, not a film score.** Upbeat, catchy, confident, full arrangement from the first frame. A light groove is fine; what's banned is drums alone, muffled or filtered beats, and anything sad or trailer-like.
2. **After four misses, the client picks the music by ear.** The team generates the options (several commercial styles), gates only what can be measured (no vocals, tempo on the grid, key), builds each one under the finished ad, and hands the client numbered files. The panel no longer picks music on the client's behalf: our AI listener scored every option identically ("ad 9, cheesy 8").
3. **For ad music, enter on frame 0 with a downbeat on the picture grid** (take offset = first onset + 0.5 s, so downbeats land on 1.25, 3.0, 4.75…). Key-match the piano motif to each track.

## 2026-10-08: Replacement score rejected, "a sad story" + "a rocket going through"
**Client verdict:** "So far it sounds like a sad story, and the last part like a rocket going through." The client asked for a real music department.

**Cause:**
1. The panel's pick ("minimal pulse") is slow ambient music in C# minor. Laid under night scenes, calm turned into melancholy. Our AI listener scored it 9–10 for fit; it does not judge mood the way the client does.
2. The logo build was sound-designed as a launch: tonal riser 180→720 Hz + white-noise riser + three whooshes + a sub-drop impact. Together that is a rocket.

**Rules learned:**
1. **The mood is hopeful from the first note.** The night is not lonely: her team is working, so the music is warm, optimistic and quietly confident, with gentle forward motion. It is in a major key, never melancholic, never minor-led, never "sad piano", and it rises to a joyful, bright morning.
2. **No launch or trailer grammar.** Ban rising-pitch risers, noise risers, whoosh stacks and sub-drop or boom impacts for transitions. The logo moment is a warm *bloom* (swell into a resolved major chord, shimmer, a soft chime), elegant and not explosive.
3. **The AI listener rates "premium/fit" but misses mood.** Every music pick is now checked against an explicit mood question ("would a viewer call this sad, tense, epic or uplifting?"), and anything other than uplifting fails.
4. **The music department exists** (music supervisor + composer + sound designer + sonic-logo keeper + mix engineer; see ROLES.md). Music decisions go through it.

**Follow-up from the same round (measured):**
- **The Gemini audio judge cannot discriminate mood or "rocket".** On the soundtrack alone it gave identical answers ("uplifting, not wistful, rocket at 22–24, has a beat") for four different mixes. These were the old rocket mix, the "sad" mix the client rejected, and both new ones. The new score measures 0.2 sharp onsets/s, yet the judge still said "beat". With picture, it reads the story's "team of one" hook as music loneliness.
- **Use the judge only to rank options of the same kind, never as a pass/fail on mood.** Measured checks decide (onset density, HF-brightness trend across the logo build, the jump at the cut, key/chroma), and then the client's ear.
- **A swelling chord on the logo build can still read as "rising".** Ruling: the score carries the logo moment, with soft glass tones, glints and a chime under it, and no added crescendo.

## 2026-10-08: Background music rejected, "sounds like a beatbox"
**Client verdict:** "Background music needs improvement, it's like a beatbox, not suitable to the video … but overall it's very good."

**Cause:** the bed was a beat-driven electronic take (the prompt asked for a "tight modern kick" at 137 BPM). On top of that we low-passed it at 350–900 Hz for the first 8 seconds as a build, so mostly kick and bass came through. Measured density: 3.7 sharp onsets/s, against 0.8 for the replacement.

**Rules learned:**
1. **Brand-film beds are cinematic and beatless:** pads, arpeggio, sparse piano, strings, with no drum kit, hip-hop or EDM percussion. Prompt for 68.5 BPM so one bar = one 3.5s vignette.
2. **Build with the arrangement, not with filters.** No low-pass "opening" tricks on a beat track.
3. **Place the score by its shape.** Map its natural break onto the logo build, and let it enter when the story turns (the complete team at 3.25s). Start-and-stop at a random offset is not enough.
4. **Key-match the motif.** Measure the score's key (chroma), then transpose every pitched SFX and the piano motif into it (here C→E, +4 semitones). Same melody, no clash.
5. **Generate about 6 directions, panel-rank them, keep the runner-up ready.** Here "minimal pulse" won (premium 9, VO-friendly 9). Runner-up: "night to sunrise".

## 2026-10-08: Client direction, voices, the end tag and SFX variety
**Client:** "Going forward we'll choose the voice Despina or Charon … for the last part emphasise 'Digital team? Go with Optinet!' … the music effects are all piano or bell, improve and vary them a little, since we have partly reached our goal."

**Rules learned:**
1. **Narrator casting is locked to Gemini TTS Despina (female) or Charon (male).** Don't audition other voices unless the client asks. Keep one file path per voice and overwrite it.
2. **The end tag is the Trivago move and must be emphasised.** The narrator asks "Digital team?", then says "Go with Optinet!" (bold, upbeat, stress on GO and OP-tih-net). The wordmark reveals OP / TI / NET on the **spoken** syllables (measured from the take, with a small pop on each), and the piano motif doubles them. The name is spoken once, on the tag: drop any earlier "That's Optinet." so the logo build plays on music alone.
3. **SFX need variety.** Piano is only for the brand motif (the seat notes that plant it, and the end tag). Each beat gets its own sound: power-on for the seats, a message pop, a swipe and success blip, data blips, a shutter and sparkle, wood ticks and a warm chime, a tonal riser, a sub-drop impact. One shared LOCK, with no bell.

## 2026-10-08: Narrated versions, "radio interruption" after every line
**Client verdict:** "Every time after it says something it has this like radio interruption."

**Cause (measured):** every Gemini TTS clip (`gemini-3.8-flash-tts`, 132 of 132 takes) ends with about 0.17s of loud broadband static after about 0.4s of silence, and starts with a 1ms blip. A plain silence trim stops at the burst and keeps it. The same junk also made every line look 0.5s too long, which we wrongly put down to a slow read.

**Rules learned:**
1. **Never place a raw TTS clip.** Cut it to the detected speech region (drop the head blip and the tail burst, with 30ms lead-in, 120ms tail and short fades), then check that the voice track is silent between lines before mixing.
2. **A delivery note must use the director's-notes format** ("# AUDIO PROFILE … ## DIRECTOR'S NOTES … #### TRANSCRIPT"). A plain "Say warmly:" prefix gets read aloud on short lines.
3. **Transcribe every take back** and reject it unless the words match. This caught "Optinet" being read as "Optinen" or "option A". Use the phonetic spelling "Opti-net" in the TTS input.
4. **Our judges did not hear the static.** Gemini QC passed all four versions as "mix ok". Audio defects need a measured check (spectrogram, or level between lines), not only an AI listener.

## 2026-10-08: "Four Seats" 30s master, picture approved, voiceover missing
**What we made:** the step-built master (hero top-down, four night vignettes with glass cards, morning brief, table-to-logo orbit lock, end card with the piano motif). Instrumental only: music, SFX and the sonic logo, no voice anywhere.

**Client verdict:** "The video looks good and professional, not quite like Trivago but it's good. The only thing lacking is a voiceover. No voiceover, only background music."

**Rules learned:**
1. **The picture formula works. Keep it:** premium top-down light device, glass cards, clock-stamped vignettes, one story change per bar, table-to-logo morph, end card. This is the first full ad the client has called good.
2. **A Trivago-style ad needs a narrator.** Music-only reads as a mood film, not an ad. Every master gets an **off-screen narrator voiceover**: short, calm lines that sit between the graphic beats and say the offer out loud.
3. **This does not overturn the AI-acting rule.** Lip-synced characters and on-camera AI dialogue stay banned. The narrator is off-screen and never tied to a mouth.
4. **The voice is the highest-risk element.** The client has rejected AI voices twice. Never ship one voice blind: generate several narrator candidates, gate them for any robotic tell (flat prosody, odd stress, breaths or clicks), shortlist the best 2–3, and let the client choose by ear.
5. **Mix for the voice.** The music ducks under every line (sidechain), the lines never land on top of an SFX hit, and the sonic-logo notes stay clear of speech.
6. "Not quite like Trivago" means the client still wants more of the reference's *ad* energy (a voice that talks to the viewer), not a different look.

## 2026-10-07: Client strategy, build ads step by step (process rule)
**Client instruction:** "Instead of one run generating a 30 second video, why not short videos and let it proceed from where it left. Like a manual step by step, so it can generate the best of the best and combine it."

**Rules learned (production process, mandatory):**
1. **Never generate or render a whole ad in one pass.** Split it into short steps of 3–5s: one moment or shot each.
2. **Best-of-N per step.** Generate several takes, QC them (morphing, hands, AI tells, continuity, sound-off clarity), pick the best, and show the pick before moving on.
3. **Continue from the winner.** The next step starts from the chosen take's last frame (Kling start_image) and ends on the planned keyframe (end_image), or uses Seedance video_extension. This keeps motion and light continuous without drift.
4. **Combine only the winners at the end:** graphics, music edited to the cut, sonic logo.
5. **This step-builder is the Ad Studio product flow:** step cards, generate takes, pick, "continue from here", then "combine".

## 2026-10-07: Round 2 rejected ("The Tooth")
**What we made:**
- A 30s Trivago-style comedy: a dentist in a foam tooth costume, a deadpan spokesperson ("Jade from Optinet"), Kling on-camera dialogue, glass UI graphics, Lyria music, a "Page one? Optinet." catchphrase.
- Our process scored it 9/10. Gemini also rated it far above the reference ad.

**Client verdict:**
- "The music is bad, the voice is AI, the catchphrase voice sounds weird and bad, overall not the same quality as Trivago."
- After the re-voice and music round: "script is bad, voices obviously AI generated."
- The client ticked all four script faults: **wrong concept, too silly, message unclear, too much talking.**

**Rules learned:**
1. **Premium and confident, never slapstick.** No costumes, gags or "funny sketch" premises. The benchmark is a brand film (Apple, Stripe, Notion, Monday.com), not a sitcom.
2. **No AI acting.** Lip-synced AI dialogue sounds fake to this client, whether it's Kling native audio, Higgsfield voice_change or preset TTS. At most one short spoken line per ad, and prefer none. Tell the story with picture, kinetic text and music.
3. **The message must be about Optinet's offer, not a customer's trade.** The Tooth sold dentistry comedy, so the offer got lost. Say what Optinet does within 3 seconds and repeat it.
4. **Our own judges are too generous.** Gemini and our critics scored rejected work 9–10/10. A score from us is a technical pass, not approval. The client proxy judge (RUBRIC.md) must score as harshly as the client.
5. **Get concept sign-off before spending credits.** About 115 Higgsfield credits went on a concept the client would have vetoed at the script stage. Since 2026-10-07 the client has delegated the concept decision to the team's judging panel, so the panel IS the sign-off. It must apply these lessons.
6. **AI-sung jingles are high risk.** If a voice can be heard, the client hears "AI". Prefer an instrumental sonic logo unless real people record it.
7. **Music: let a human-like ear choose from options, never ship one take blind.** Lyria ignores bar-by-bar structure. Generate several styles, gate them technically, and edit the chosen one to the picture.

## 2026-10-06: Round 1 rejected (v1 café sketch)
**What we made:**
- A single wide, static café scene with three people talking.
- Plain captions, a white end card, one generic Lyria music take.

**Client verdict:** "Bad music, doesn't fit. No graphics like the reference. Overall looks bad, not like Trivago."

**Rules learned:**
1. **Graphics are mandatory.** Premium glass UI cards, kinetic type and a branded end card, synced to the story. This was the strongest part of the reference the client liked.
2. **No static wide shots with tiny faces.** Vary framing and keep the camera moving.
3. **Music must be cut to the picture**, with hits on the edit points, never a generic bed.

## What the client has liked (keep doing)
- **2026-10-07: APPROVED "Four Seats" Step 1** (the 6s hook, seats lighting, logo morph, end card). This is the first approval in three rounds, so treat it as the reference for quality.
  - It works because it's a premium top-down brand-film image, nobody talks or acts, light carries the story, and the table turns into the real logo.
  - The client picked the **felt-piano-only** sonic-logo motif over piano + bell and bell-only. Use piano timbres for Optinet's motif.
  - Workflow chosen: agents pick each step's best take, the client can veto, 2 takes per step.
- The reference ad's **glassmorphism UI cards**, kinetic headline and branded end card.
- **Word-synced graphics**: stamps, counters and cards landing on beats.
- The "Hotel? Trivago." **sonic-logo structure**: a category question, then the brand.
- Concept boards with real key frames and styled frames, so the client sees the look before production.
