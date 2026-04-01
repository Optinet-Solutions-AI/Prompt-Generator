"""
Test Compare: OpenAI vs Imagen feature - focused on the modal interaction.
"""
from playwright.sync_api import sync_playwright
import time
import os
import sys

# Force UTF-8 output to avoid encoding errors on Windows
if sys.stdout.encoding != 'utf-8':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SCREENSHOTS_DIR = "C:/Users/User/Prompt-Generator/screenshots/compare_test"
BASE_URL = "https://prompt-generator-eight-umber.vercel.app"

os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

def log(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode('ascii', 'replace').decode('ascii'))

def save(page, name):
    path = f"{SCREENSHOTS_DIR}/{name}.png"
    page.screenshot(path=path, full_page=False)
    log(f"  [screenshot] {path}")
    return path


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        # ── Step 1: Load homepage ──────────────────────────────────────────────
        log("\n[1] Loading homepage...")
        page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
        time.sleep(3)
        save(page, "S01_homepage")

        # ── Step 2: Click Image Library ────────────────────────────────────────
        log("\n[2] Opening Image Library gallery...")
        img_lib_btn = page.query_selector("button:has-text('Image Library')")
        if img_lib_btn:
            img_lib_btn.click()
            time.sleep(4)
            save(page, "S02_library_opened")
            log("    Image Library opened")
        else:
            log("    ERROR: Image Library button not found!")
            save(page, "S02_ERROR_no_lib_btn")
            return

        # ── Step 3: Click first thumbnail ─────────────────────────────────────
        log("\n[3] Clicking first image thumbnail...")
        # Images are from lh3.googleusercontent.com (Google Drive)
        all_imgs = page.query_selector_all("img")
        clicked = False
        for img_el in all_imgs:
            try:
                bbox = img_el.bounding_box()
                src = img_el.get_attribute('src') or ''
                if bbox and bbox['width'] > 100 and bbox['height'] > 100:
                    if 'googleusercontent' in src or 'supabase' in src or 'storage' in src:
                        log(f"    Clicking image: {int(bbox['width'])}x{int(bbox['height'])} {src[:60]}")
                        img_el.click()
                        time.sleep(3)
                        clicked = True
                        break
            except:
                pass

        save(page, "S03_after_thumbnail_click")

        # Verify modal is open
        modal = page.query_selector(".fixed.inset-0") or page.query_selector("[class*='fixed'][class*='z-50']")
        if not modal:
            log("    Modal not found after clicking thumbnail. Trying direct click on image...")
            # Try clicking any large image
            for img_el in all_imgs:
                try:
                    bbox = img_el.bounding_box()
                    if bbox and bbox['width'] > 80 and bbox['height'] > 60 and 0 <= bbox['y'] <= 900:
                        src = img_el.get_attribute('src') or ''
                        if 'googleusercontent' in src:
                            img_el.click()
                            time.sleep(3)
                            break
                except:
                    pass
            save(page, "S03b_retry_click")

        # ── Step 4: Screenshot the modal ──────────────────────────────────────
        log("\n[4] Modal screenshot...")
        save(page, "S04_modal")

        # ── Step 5: Find and click Variations button ───────────────────────────
        log("\n[5] Looking for Variations button...")

        # List all visible buttons
        all_buttons = page.query_selector_all("button")
        log(f"    Total buttons found: {len(all_buttons)}")

        var_btn = None
        for btn in all_buttons:
            try:
                txt = btn.inner_text().strip()
                bbox = btn.bounding_box()
                if bbox and bbox['width'] > 0:
                    safe_txt = txt.encode('ascii', 'replace').decode('ascii')
                    log(f"      Button: '{safe_txt}' at ({int(bbox['x'])},{int(bbox['y'])})")
                    if 'variation' in txt.lower():
                        var_btn = btn
            except:
                pass

        if not var_btn:
            log("    'Variations' text not found, looking for Shuffle icon button...")
            # Look for VARIATIONS section - it might be a clickable div or link not a button
            var_section = page.query_selector("text=VARIATIONS") or \
                          page.query_selector("text=Variations") or \
                          page.query_selector("[class*='variation']")
            if var_section:
                log("    Found Variations section element")
                var_btn = var_section

        if var_btn:
            log("    Clicking Variations button...")
            var_btn.click()
            time.sleep(2)
            save(page, "S05_variations_panel")
        else:
            log("    Variations button not found - taking diagnostic screenshot")
            save(page, "S05_no_variations")

            # Check what's in the right panel of the modal
            right_panel = page.evaluate("""() => {
                const els = Array.from(document.querySelectorAll('*'));
                const rightSide = els.filter(el => {
                    const bbox = el.getBoundingClientRect();
                    return bbox.x > 900 && bbox.width > 50 && bbox.height > 20 && bbox.width < 400;
                });
                return rightSide.slice(0, 30).map(el => ({
                    tag: el.tagName,
                    text: (el.innerText || '').substring(0, 60).replace(/[^\x20-\x7E]/g, '?'),
                    class: (el.className || '').toString().substring(0, 60),
                }));
            }""")
            log("    Right panel elements:")
            for el in right_panel:
                if el['text']:
                    log(f"      <{el['tag']}> '{el['text']}' class='{el['class']}'")

        # ── Step 6: Look for Compare toggle ────────────────────────────────────
        log("\n[6] Looking for Compare toggle...")
        save(page, "S06_current_state")

        # Find the compare toggle - the code uses compareEngines state
        # It's likely a button/toggle with "Compare" or "OpenAI vs Imagen" text
        compare_toggle = None
        all_buttons_now = page.query_selector_all("button")
        for btn in all_buttons_now:
            try:
                txt = btn.inner_text().strip()
                safe_txt = txt.encode('ascii', 'replace').decode('ascii')
                if 'compare' in txt.lower() or 'imagen' in txt.lower() or 'openai' in txt.lower():
                    log(f"    Found compare-related button: '{safe_txt}'")
                    compare_toggle = btn
            except:
                pass

        # Also check for toggle switches / checkboxes
        toggles = page.query_selector_all("input[type='checkbox'], [role='switch'], [role='checkbox']")
        log(f"    Found {len(toggles)} toggle/checkbox elements")

        if not compare_toggle:
            log("    Compare toggle not found by button text. Checking all text elements...")
            compare_elements = page.evaluate("""() => {
                const all = Array.from(document.querySelectorAll('*'));
                return all.filter(el => {
                    const txt = (el.innerText || el.textContent || '').toLowerCase();
                    return (txt.includes('compare') || txt.includes('imagen') || txt.includes('openai vs'))
                           && el.children.length <= 2;
                }).map(el => ({
                    tag: el.tagName,
                    text: (el.innerText || '').substring(0, 80).replace(/[^\x20-\x7E]/g, '?'),
                    class: (el.className || '').toString().substring(0, 80),
                    x: Math.round(el.getBoundingClientRect().x),
                    y: Math.round(el.getBoundingClientRect().y),
                    visible: el.getBoundingClientRect().width > 0,
                })).filter(el => el.visible);
            }""")
            log(f"    Elements with compare/imagen text: {len(compare_elements)}")
            for el in compare_elements:
                log(f"      <{el['tag']}> '{el['text']}' at ({el['x']},{el['y']}) class='{el['class']}'")

        # ── Step 7: Let's zoom into the variations panel area ─────────────────
        log("\n[7] Zooming into right panel area for better view...")
        # Take a cropped screenshot of the right side
        save(page, "S07_right_panel_view")

        # Scroll within the modal to see more of the variations panel
        page.evaluate("""() => {
            const modal = document.querySelector('.fixed.inset-0') || document.querySelector('[class*="z-50"]');
            if (modal) {
                const panels = modal.querySelectorAll('[class*="overflow"], [class*="scroll"]');
                panels.forEach(p => p.scrollTop += 200);
            }
        }""")
        time.sleep(1)
        save(page, "S07b_scrolled_panel")

        # ── Step 8: Try clicking the "Show" button next to VARIATIONS ──────────
        log("\n[8] Looking for 'Show' button in Variations section...")
        show_btn = page.query_selector("button:has-text('Show')")
        if show_btn:
            log("    Found 'Show' button, clicking...")
            show_btn.click()
            time.sleep(2)
            save(page, "S08_show_clicked")
        else:
            log("    No 'Show' button found")

        # Final state
        save(page, "S09_final_state")

        # Print all visible text on page for debugging
        visible_text = page.evaluate("""() => {
            const body = document.body;
            const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
            const texts = [];
            let node;
            while (node = walker.nextNode()) {
                const txt = node.textContent.trim().replace(/[^\x20-\x7E]/g, '?');
                if (txt.length > 2 && txt.length < 200) {
                    const el = node.parentElement;
                    const bbox = el ? el.getBoundingClientRect() : null;
                    if (bbox && bbox.width > 0 && bbox.height > 0 && bbox.x > 900) {
                        texts.push(txt);
                    }
                }
            }
            return [...new Set(texts)].slice(0, 40);
        }""")
        log("\n    Visible text in right panel area:")
        for txt in visible_text:
            log(f"      '{txt}'")

        log(f"\n[DONE] Screenshots saved to: {SCREENSHOTS_DIR}")
        browser.close()


if __name__ == "__main__":
    run()
