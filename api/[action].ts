import type { VercelRequest, VercelResponse } from '@vercel/node';

// Inline OpenAI helper to avoid cross-file import issues on Vercel
async function chatCompletion(opts: {
  systemPrompt: string; userPrompt: string; temperature?: number;
  model?: string; maxTokens?: number; imageUrl?: string;
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  const messages: any[] = [{ role: 'system', content: opts.systemPrompt }];
  if (opts.imageUrl) {
    messages.push({ role: 'user', content: [
      { type: 'text', text: opts.userPrompt },
      { type: 'image_url', image_url: { url: opts.imageUrl } },
    ]});
  } else {
    messages.push({ role: 'user', content: opts.userPrompt });
  }
  const body: any = { model: opts.model || 'gpt-4o-mini', messages, temperature: opts.temperature ?? 1.0 };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`OpenAI API failed (${res.status}): ${err}`); }
  const data = await res.json();
  return data.choices[0].message.content;
}

const SUPABASE_URL             = process.env.SUPABASE_URL             || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function sbHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'apikey':        SUPABASE_SERVICE_ROLE_KEY,
    ...extra,
  };
}

async function sbGet(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`Supabase GET failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function sbPost(path: string, body: object, extra?: Record<string, string>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: sbHeaders(extra),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase POST failed (${res.status}): ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

async function sbPatch(path: string, body: object) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: sbHeaders({ 'Prefer': 'return=representation' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase PATCH failed (${res.status}): ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

async function sbDelete(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'DELETE',
    headers: sbHeaders(),
  });
  if (!res.ok) throw new Error(`Supabase DELETE failed (${res.status}): ${await res.text()}`);
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;

  try {
    // ── REGENERATE REFERENCE — direct OpenAI (was n8n) ─────────────────────
    if (action === 'regenerate-reference') {
      const { field, brand, temperature, instruction, globalInstruction, brandColors,
              format_layout, primary_object, subject, lighting, mood, background, positive_prompt } = req.body;

      const t = typeof temperature === 'number' ? temperature : 1.0;
      const brandColorRule = brandColors ? `\nBRAND COLOR RULE: ${brandColors}` : '';

      let systemPrompt = '';
      let userPrompt = '';

      if (field === 'subject') {
        systemPrompt = `You are a costume designer for casino brand imagery.

Your job is to give the existing character a COMPLETELY NEW LOOK that fits the theme —
but the character must still be instantly recognizable as a ${brand} branded image.

LOCKED — never change these:
- The character's face, build, and body proportions
- The species (rooster stays rooster)
- The number of characters (1 stays 1, 2 stays 2 — never add or remove)
- The framing/composition (close-up stays close-up)
- Core brand identity — the character must still feel like it belongs to ${brand}

MUST CHANGE — make these dramatically different:
- Full outfit/costume (not just adding one small item — replace the whole look)
- Multiple accessories (hat, glasses, jewelry, props — go all in)
- Color palette of the clothing
- Props they are holding or interacting with
- Decorative elements around them

Think: same face, same build, completely different outfit.

Preserve ALL stylistic and rendering descriptors: if the original says "anthropomorphic", "3D rendered", "stylized", "ultra-detailed" — these MUST appear in your output.

If an OVERALL CREATIVE DIRECTION is provided, apply it as the full costume theme while keeping brand identity.
If a field-level INSTRUCTION is provided, it overrides everything else.

IMPORTANT: Return ONLY the restyled subject description as plain text. No labels, no prefixes.
${brandColorRule}`;

        if (instruction) {
          userPrompt = `Brand: ${brand}\n\nINSTRUCTION (follow this precisely): ${instruction}\nRestyle the subject's clothing based on this instruction. Keep everything else identical.\n\nOriginal Subject:\n${subject}`;
        } else if (globalInstruction) {
          userPrompt = `Brand: ${brand}\n\nTHEME TO APPLY TO OUTFIT ONLY: ${globalInstruction}\n\nOriginal Subject — change ONLY outfit/costume elements to match the theme, keep everything else word-for-word:\n${subject}`;
        } else {
          userPrompt = `Brand: ${brand}\n\nReturn this subject description exactly as written, no changes:\n${subject}`;
        }

      } else if (field === 'background') {
        systemPrompt = `You are a visionary AI image prompt specialist for premium sports and betting brands.
Your ONLY job is to write a single-paragraph "Background" description based on the user's instructions.

CRITICAL RULES:
1. EMBRACE SURREALISM & IMAGINATION: You are NOT bound by real-world physics or logic.
2. NO REALITY CONSTRAINTS: It is 100% acceptable for subjects to be in impossible environments.
3. BRAND VIBE: Even if the environment is wild or fantasy-based, it must feel high-budget, epic, and aligned with the ${brand} identity.
4. ATMOSPHERE & LIGHTING: Describe the specific atmospheric effects of this imaginative world.
5. NO TEXT: Zero readable text, signs, logos, or words in the background description.

OUTPUT: Write ONLY the background description. No labels, no chat, no intro.
${brandColorRule}`;

        let bgInstruction = '';
        if (instruction) {
          bgInstruction = `SPECIFIC INSTRUCTION — follow this precisely:\n${instruction}\nBuild the background around this instruction while staying consistent with the scene above.`;
        } else if (globalInstruction) {
          bgInstruction = `Generate a background that CLEARLY reflects this theme: ${globalInstruction}\nThe theme must be the dominant visual concept of the background — not a subtle hint.`;
        } else {
          bgInstruction = `Generate a dramatically different background that fits naturally behind this subject.\nPick ONE clear environment. Make it specific and detailed — not generic.`;
        }

        userPrompt = `${globalInstruction ? `OVERALL CREATIVE DIRECTION: ${globalInstruction}\n\n` : ''}Brand: ${brand}\n\nCurrent scene — background MUST be consistent with all of these:\n- Format Layout: ${format_layout}\n- Primary Object: ${primary_object}\n- Subject: ${subject}\n\n${bgInstruction}\n\nWrite ONLY the new background description.`;

      } else if (field === 'lighting') {
        systemPrompt = `You are a cinematographer for casino brand imagery.

Your job is to create a DRAMATICALLY DIFFERENT lighting setup that transforms the scene.

LOCKED — never change:
- Physical consistency with the subject (character must still be lit, not obscured)
- Brand energy (${brand} = dramatic, high-contrast, premium)

MUST CHANGE — make these dramatically different:
- Primary light source color, direction, and intensity
- Accent and rim lighting (completely different color palette)
- Atmospheric glow and effects
- Shadow depth and contrast style
- Overall color temperature

Create a different lighting setup but ALWAYS stay within the brand's color palette.
Different direction, different intensity, different shadow style — but on-brand colors only.

If an OVERALL CREATIVE DIRECTION is provided, apply it as the lighting theme while keeping brand identity.
If a field-level INSTRUCTION is provided, it overrides everything else.

IMPORTANT: Return ONLY the lighting description as plain text. No labels, no prefixes.
${brandColorRule}`;

        if (instruction) {
          userPrompt = `Brand: ${brand}\n\n${globalInstruction ? `OVERALL CREATIVE DIRECTION (apply to the lighting): ${globalInstruction}\n\n` : ''}INSTRUCTION (follow this precisely): ${instruction}\nGenerate the lighting description based on that instruction.`;
        } else {
          userPrompt = `Brand: ${brand}\n\n${globalInstruction ? `OVERALL CREATIVE DIRECTION (apply to the lighting): ${globalInstruction}\n\n` : ''}Current Lighting:\n${lighting}\nCreate a dramatically different lighting setup. Different color palette, different direction, different atmosphere.`;
        }

      } else if (field === 'mood') {
        systemPrompt = `You are a creative director for casino brand imagery.

Your job is to create a COMPLETELY DIFFERENT emotional atmosphere — but it must still feel like a ${brand} image.

LOCKED — never change:
- Brand identity (Roosterbet = bold/confident, SpinJo = energetic/playful, FortunePlay = lucky/vibrant, LuckyVibe = positive/electric, SpinsUp = upbeat/dynamic)
- Premium casino/betting energy — never go cheap, flat, or generic

MUST CHANGE — make these dramatically different:
- Primary emotion (confident → mysterious, opulent → edgy, luxurious → electric)
- Atmospheric feeling (noir → neon-vibrant, luxury → gritty-premium)
- Color emotion and energy level

If an OVERALL CREATIVE DIRECTION is provided, apply it as the emotional theme while keeping brand identity.
If a field-level INSTRUCTION is provided, it overrides everything else.

IMPORTANT: Return ONLY the mood description as plain text. No labels, no prefixes.
${brandColorRule}`;

        if (instruction) {
          userPrompt = `Brand: ${brand}\n\n${globalInstruction ? `OVERALL CREATIVE DIRECTION (apply to the mood): ${globalInstruction}\n\n` : ''}INSTRUCTION (follow this precisely): ${instruction}\nGenerate the mood description based on that instruction.`;
        } else {
          userPrompt = `Brand: ${brand}\n\n${globalInstruction ? `OVERALL CREATIVE DIRECTION (apply to the mood): ${globalInstruction}\n\n` : ''}Current Mood:\n${mood}\nCreate a completely different emotional atmosphere. Different primary emotion, different energy, different feel.`;
        }

      } else if (field === 'positive_prompt') {
        // Positive prompt uses FIXED temperature 0.3 (not dynamic) — matches n8n workflow
        const brandColorBlock = brandColors
          ? `\n${brandColors}\nEvery color in the output MUST comply with this palette. Replace any off-brand colors from lighting/mood/background with on-brand alternatives.`
          : `\nPreserve the same color palette as the STYLE REFERENCE. Do NOT introduce colors not present in the original.`;

        systemPrompt = `You are a precise AI image prompt ASSEMBLER for premium casino/betting brand imagery.

Your ONLY output is a single complete image generation prompt as one flowing paragraph.

ABSOLUTE RULES — VIOLATING ANY OF THESE IS A FAILURE:
1. NEVER add, remove, or change characters. If the subject describes 4 athletes with specific sports, the output must have EXACTLY 4 athletes with those same sports, poses, and equipment.
2. NEVER reinterpret the subject — preserve every detail: character count, species, clothing, poses, props, body type.
3. NEVER reinterpret the background — include it as described.
4. Weave lighting and mood naturally into the scene.
5. Preserve the exact rendering style from the STYLE REFERENCE (3D render, photorealistic, cinematic, anthropomorphic).
6. The output must feel like a ${brand} branded image — premium, high-energy.
7. NEVER include readable text, signs, words, or logos.
8. If the instruction says a specific field was changed, give EXTRA attention to preserving ALL OTHER fields exactly.

COLOR CONSISTENCY RULE (CRITICAL):
When a THEME / CREATIVE DIRECTION is provided, it sets the dominant color palette for the ENTIRE scene.
- Adapt ALL color references (including those in lighting and mood) to match the theme.
- Keep the lighting SETUP (direction, intensity, shadow style) but REPLACE its colors to match the theme.
- Keep the mood ENERGY (intense, playful, mysterious) but REPLACE its atmosphere colors to match the theme.
- Example: if theme is "golden New Year" and lighting says "neon purple rim light" → output "warm golden rim light" instead. Same setup, theme-appropriate color.
- If no theme is provided, keep all original colors from the fields.

BRAND COLOR ENFORCEMENT (ALWAYS APPLIES):
${brandColorBlock}

You are an ASSEMBLER — stitch the components together faithfully. When a theme specifies colors, every color in the output must match that theme.`;

        userPrompt = `${globalInstruction ? `THEME / CREATIVE DIRECTION — this sets the color palette for the ENTIRE scene. Adapt ALL lighting and mood colors to match this:\n${globalInstruction}\n\n` : ''}${instruction ? `${instruction}\n\n` : ''}Assemble these components into ONE image prompt paragraph.
CRITICAL: Preserve EVERY detail from each component — especially the subject (exact character count, their poses, equipment, clothing).
${globalInstruction ? `COLOR OVERRIDE: Adapt ALL colors in lighting and mood to match the theme above. Keep the lighting direction/setup and mood energy, but replace their colors to fit the theme.\n` : ''}
1. BACKGROUND: ${background}
2. SUBJECT (PRESERVE EXACTLY — same characters, count, poses, equipment): ${subject}
3. STYLE & COLOR REFERENCE (copy the rendering technique AND the color palette — same warmth, same tones, same brand feel): ${positive_prompt}`;

        const ppValue = await chatCompletion({ systemPrompt, userPrompt, temperature: 0.3, model: 'gpt-4o-mini' });
        return res.status(200).json({ field, value: ppValue });

      } else {
        return res.status(400).json({ error: `Unknown regenerable field: ${field}` });
      }

      const value = await chatCompletion({ systemPrompt, userPrompt, temperature: t, model: 'gpt-4o-mini' });
      return res.status(200).json({ field, value });
    }

    // ── CONVERT TO HTML — direct OpenAI with vision (was n8n) ──────────────
    if (action === 'convert-to-html') {
      const data = req.body;
      let imageUrl = data.imageUrl || '';

      // Convert Google Drive "view" links to image CDN
      if (imageUrl.includes('drive.google.com/file/d/')) {
        const match = imageUrl.match(/\/d\/([^/]+)/);
        if (match?.[1]) imageUrl = `https://lh3.googleusercontent.com/d/${match[1]}`;
      }
      if (!imageUrl || !/^https:\/\//i.test(imageUrl)) {
        imageUrl = 'https://lh3.googleusercontent.com/d/1huOiLrd1hyUyWALZ1OkhTNr3WPE4Y0gE';
      }

      const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const welcomeBonus    = esc(data.welcomeBonus    || '20 free spins');
      const amountToUnlock  = esc(data.amountToUnlock  || '30');
      const bonusPercentage = esc(data.bonusPercentage || '500');
      const extraSpins      = esc(data.extraSpins      || '100');
      const bonusCode       = esc(data.bonusCode       || 'WIN500');

      const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<meta name="x-apple-disable-message-reformatting">
<title>Bonus Offer</title>
</head>
<body style="margin:0; padding:0; background:#f2f2f2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f2f2;">
<tr>
<td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
         style="background:#ffffff; border-radius:18px; overflow:hidden; max-width:600px;">
    <tr>
      <td align="center" style="padding:0;">
        <img src="${imageUrl}" alt="Promo"
             width="600"
             style="display:block; width:100%; max-width:600px; border-radius:18px 18px 0 0; margin:0; padding:0; line-height:0; font-size:0;">
      </td>
    </tr>
    <tr>
      <td style="padding:22px 26px; font-family:Arial, Helvetica, sans-serif; color:#111; font-size:14px; line-height:20px;">
        <div style="margin-bottom:10px;">Hey there,</div>
        <div style="margin-bottom:14px;">
          Ready for your next mission? Start with ${welcomeBonus} on us — no deposit needed.
        </div>
        <div style="margin-bottom:8px;">
          Deposit ${amountToUnlock} or more to unlock:
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
          <tr><td width="22" style="padding:0 8px 8px 0;">&#128301;</td><td style="padding:0 0 8px 0;">A special ${bonusPercentage}% boost</td></tr>
          <tr><td width="22" style="padding:0 8px 8px 0;">&#127756;</td><td style="padding:0 0 8px 0;"> +${extraSpins} extra spins</td></tr>
          <tr><td width="22" style="padding:0 8px 0 0;">&#10145;&#65039;</td><td style="padding:0;">Use bonus code: <span style="color:#1a4dff; font-weight:700;">${bonusCode}</span></td></tr>
        </table>
        <div style="margin-bottom:18px;">
          New worlds, new wins. Begin your journey now &#128640;
        </div>
        <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td bgcolor="#1a4dff" style="border-radius:999px;">
              <a href="#"
                 style="display:inline-block; padding:14px 40px; color:#ffffff; text-decoration:none; font-weight:700; font-size:14px;">
                JOIN NOW
              </a>
            </td>
          </tr>
        </table>
        <div style="text-align:center; font-size:10px; color:#8a8a8a; margin-top:22px;">
          Casino accepts players only over 18 years of age.
        </div>
      </td>
    </tr>
  </table>
</td>
</tr>
</table>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    }

    // ── Supabase routes ────────────────────────────────────────────────────
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured' });
    }

    // LIST PROMPTS — used by the reference dropdown
    if (action === 'list-prompts') {
      const data = await sbGet(
        'web_image_analysis?select=id,prompt_name,brand_name,prompt_category&order=prompt_name.asc'
      );
      return res.status(200).json(Array.isArray(data) ? data : []);
    }

    // SAVE AS REFERENCE — save a blended/generated prompt as a new reference
    // Also handles 'save-prompt' (same operation — insert a new record)
    if (action === 'save-as-reference' || action === 'save-prompt') {
      const {
        title, brand_name, prompt_category,
        format_layout, primary_object, subject,
        lighting, mood, background,
        positive_prompt, negative_prompt,
        prompt_name,   // some callers send prompt_name directly
        image_name,
      } = req.body;

      const row = {
        prompt_name:     prompt_name || title || '',
        brand_name:      brand_name  || '',
        prompt_category: prompt_category || null,
        image_name:      image_name      || null,
        format_layout:   format_layout   || null,
        primary_object:  primary_object  || null,
        subject:         subject         || null,
        lighting:        lighting        || null,
        mood:            mood            || null,
        background:      background      || null,
        positive_prompt: positive_prompt || null,
        negative_prompt: negative_prompt || null,
      };

      const data = await sbPost(
        'web_image_analysis',
        row,
        { 'Prefer': 'return=representation' }
      );
      const result = Array.isArray(data) ? data[0] : data;
      return res.status(200).json(result);
    }

    // REMOVE REFERENCE — delete a prompt by its Supabase UUID
    if (action === 'remove-reference') {
      const { recordId } = req.body;
      if (!recordId) return res.status(400).json({ error: 'recordId is required' });
      await sbDelete(`web_image_analysis?id=eq.${recordId}`);
      return res.status(200).json({ success: true });
    }

    // RENAME REFERENCE — update the prompt_name
    if (action === 'rename-reference') {
      const { recordId, newName } = req.body;
      if (!recordId || !newName) return res.status(400).json({ error: 'recordId and newName are required' });
      const data = await sbPatch(
        `web_image_analysis?id=eq.${recordId}`,
        { prompt_name: newName }
      );
      const result = Array.isArray(data) ? data[0] : data;
      return res.status(200).json(result || { success: true });
    }

    // DELETE GENERATED IMAGE — remove from generated_images table AND storage file
    if (action === 'delete-generated-image') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id is required' });

      // 1. Fetch the record first to get storage_path
      const rows = await sbGet(`generated_images?id=eq.${id}&select=storage_path,public_url`);
      const row = Array.isArray(rows) ? rows[0] : rows;

      // 2. Delete the actual file from Supabase Storage (if storage_path exists)
      if (row?.storage_path) {
        try {
          const storagePath = row.storage_path;
          // Supabase Storage API: DELETE /storage/v1/object/{bucket}/{path}
          // storage_path format is typically "bucket-name/folder/file.png"
          const storageRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${storagePath}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'apikey':        SUPABASE_SERVICE_ROLE_KEY,
            },
          });
          if (!storageRes.ok) {
            console.warn(`Storage delete failed (${storageRes.status}) for ${storagePath} — continuing with DB delete`);
          }
        } catch (e) {
          console.warn('Storage file delete failed, continuing with DB delete:', e);
        }
      }

      // 3. Delete the database row
      await sbDelete(`generated_images?id=eq.${id}`);
      return res.status(200).json({ success: true });
    }

    return res.status(404).json({ error: `Unknown API route: ${action}` });

  } catch (error) {
    console.error(`Error in API route "${action}":`, error);
    return res.status(500).json({
      error: `Failed to call ${action}`,
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
