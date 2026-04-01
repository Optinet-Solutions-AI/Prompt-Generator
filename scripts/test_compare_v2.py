"""
Test the Compare: OpenAI vs Imagen feature.
The gallery with previously generated images is in the Image Library section.
"""
from playwright.sync_api import sync_playwright
import time
import os

SCREENSHOTS_DIR = "C:/Users/User/Prompt-Generator/screenshots/compare_test"
BASE_URL = "https://prompt-generator-eight-umber.vercel.app"

os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

def save(page, name):
    path = f"{SCREENSHOTS_DIR}/{name}.png"
    page.screenshot(path=path, full_page=False)
    print(f"  [screenshot saved] {path}")
    return path


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, slow_mo=200)
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080}
        )
        page = context.new_page()

        # ── Step 1: Load homepage ──────────────────────────────────────────────
        print("\n[1] Loading homepage...")
        page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
        time.sleep(3)
        save(page, "01_homepage")

        # ── Step 2: Scroll the main page to find any image gallery ─────────────
        print("\n[2] Checking page content before clicking Image Library...")

        # The page text shows: Image Library | Custom Prompt | Sports Banner
        # Let's scroll and see if there is a gallery section below the form
        page.evaluate("window.scrollTo(0, 3000)")
        time.sleep(1)
        save(page, "02_scroll_bottom")
        page.evaluate("window.scrollTo(0, 0)")
        time.sleep(1)

        # ── Step 3: Click the Image Library button to access the gallery ───────
        # Per user context: "Main gallery on the home page" is where images are
        # The Image Library button opens a gallery panel within the home page
        print("\n[3] Clicking 'Image Library' button to open the gallery...")
        img_lib_btn = page.query_selector("button:has-text('Image Library')")
        if not img_lib_btn:
            # Try the link version
            img_lib_btn = page.query_selector("a:has-text('Image Library')")
        if img_lib_btn:
            print("    Found Image Library button, clicking...")
            img_lib_btn.click()
            time.sleep(3)
            save(page, "03_image_library_opened")
        else:
            print("    Image Library button not found, taking screenshot...")
            save(page, "03_no_image_lib_btn")

        # ── Step 4: Wait for images to load and take screenshot ────────────────
        print("\n[4] Waiting for gallery images to load...")
        time.sleep(3)
        save(page, "04_gallery_loaded")

        # Check how many images are visible
        images = page.evaluate("""() => {
            const imgs = Array.from(document.querySelectorAll('img'));
            return imgs.filter(img => img.offsetWidth > 50 && img.offsetHeight > 50 && img.offsetParent !== null)
                       .map(img => ({
                           src: img.src.substring(0, 80),
                           w: img.offsetWidth,
                           h: img.offsetHeight,
                           x: Math.round(img.getBoundingClientRect().x),
                           y: Math.round(img.getBoundingClientRect().y),
                       }));
        }""")
        print(f"    Visible images (>50x50): {len(images)}")
        for img in images[:10]:
            print(f"      {img['w']}x{img['h']} at ({img['x']},{img['y']}) -> {img['src']}")

        # ── Step 5: Click first thumbnail image ────────────────────────────────
        print("\n[5] Attempting to click a thumbnail...")

        clicked = False

        # Try clicking the first large image in the gallery grid
        # Gallery images are usually in a grid with cursor-pointer
        clickable_imgs = page.query_selector_all(
            "img[src*='supabase'], img[src*='storage'], img[src*='public'], "
            "[class*='cursor-pointer'] img, [class*='group'] img, "
            "[role='button'] img, button img"
        )
        print(f"    Clickable image candidates: {len(clickable_imgs)}")

        for img_el in clickable_imgs[:5]:
            try:
                bbox = img_el.bounding_box()
                if bbox and bbox['width'] > 80 and bbox['height'] > 60:
                    src = img_el.get_attribute('src') or ''
                    print(f"    Clicking: {bbox['width']}x{bbox['height']} src={src[:60]}")
                    img_el.click(timeout=3000)
                    time.sleep(2)
                    # Check for modal
                    modal = page.query_selector(
                        "[role='dialog'], [class*='fixed'][class*='inset'], "
                        "[class*='modal'], [class*='Modal'], [class*='overlay']"
                    )
                    if modal:
                        print("    MODAL FOUND!")
                        clicked = True
                        break
                    else:
                        print("    No modal after click, trying next...")
            except Exception as e:
                print(f"    Error: {e}")

        if not clicked:
            # Try clicking parent containers
            print("    Trying parent container approach...")
            containers = page.evaluate("""() => {
                // Find all elements that are likely image cards in gallery
                const els = Array.from(document.querySelectorAll('*'));
                return els.filter(el => {
                    const style = window.getComputedStyle(el);
                    const hasCursor = style.cursor === 'pointer';
                    const hasImg = el.querySelector('img') !== null;
                    const bbox = el.getBoundingClientRect();
                    return hasCursor && hasImg && bbox.width > 80 && bbox.height > 80;
                }).slice(0, 10).map(el => ({
                    tag: el.tagName,
                    class: (el.className || '').substring(0, 80),
                    x: Math.round(el.getBoundingClientRect().x + el.getBoundingClientRect().width/2),
                    y: Math.round(el.getBoundingClientRect().y + el.getBoundingClientRect().height/2),
                    w: Math.round(el.getBoundingClientRect().width),
                    h: Math.round(el.getBoundingClientRect().height),
                }));
            }""")
            print(f"    Found {len(containers)} pointer-cursor containers with images:")
            for c in containers:
                print(f"      <{c['tag']} class='{c['class']}'> {c['w']}x{c['h']} center=({c['x']},{c['y']})")

            # Click the first suitable one
            for c in containers:
                if c['w'] > 100 and c['h'] > 100:
                    print(f"    Clicking at ({c['x']}, {c['y']})...")
                    page.mouse.click(c['x'], c['y'])
                    time.sleep(2)
                    modal = page.query_selector(
                        "[role='dialog'], [class*='fixed'][class*='inset'], "
                        "[class*='modal'], [class*='Modal']"
                    )
                    if modal:
                        print("    MODAL FOUND!")
                        clicked = True
                        break

        save(page, "05_after_click_attempt")

        # Check modal state
        modal_open = page.evaluate("""() => {
            // Check for dialog or overlay
            const dialog = document.querySelector('[role="dialog"]');
            const fixed = document.querySelector('.fixed.inset-0');
            const overlay = document.querySelector('[class*="overlay"]');
            return {
                hasDialog: !!dialog,
                hasFixed: !!fixed,
                hasOverlay: !!overlay,
                dialogClass: dialog ? (dialog.className || '').substring(0, 100) : '',
            };
        }""")
        print(f"\n    Modal state: {modal_open}")

        if not modal_open['hasDialog'] and not modal_open['hasFixed']:
            print("\n    No modal found. Let me try a different approach - look at ALL elements...")

            # Take a careful look at what's on screen
            page_structure = page.evaluate("""() => {
                function getInfo(el) {
                    const bbox = el.getBoundingClientRect();
                    return {
                        tag: el.tagName,
                        id: el.id || '',
                        class: (el.className || '').toString().substring(0, 80),
                        text: (el.innerText || '').substring(0, 40),
                        x: Math.round(bbox.x), y: Math.round(bbox.y),
                        w: Math.round(bbox.width), h: Math.round(bbox.height),
                        visible: bbox.width > 0 && bbox.height > 0,
                    };
                }
                const divs = Array.from(document.querySelectorAll('div, button, a, img'))
                    .filter(el => {
                        const bbox = el.getBoundingClientRect();
                        return bbox.width > 100 && bbox.height > 100 && bbox.y >= 0 && bbox.y < 1080;
                    });
                return divs.slice(0, 20).map(getInfo);
            }""")
            print("    Large visible elements:")
            for el in page_structure:
                print(f"      <{el['tag']} id='{el['id']}'> {el['w']}x{el['h']} class='{el['class'][:50]}' text='{el['text'][:30]}'")

        # ── Step 6: Handle modal if open ───────────────────────────────────────
        print("\n[6] Checking for open modal...")
        time.sleep(1)
        save(page, "06_modal_state")

        # Try to find any modal-like overlay that's visible
        modal_el = page.query_selector("[role='dialog']") or \
                   page.query_selector(".fixed.inset-0") or \
                   page.query_selector("[class*='fixed'][class*='z-50']")

        if modal_el:
            print("    Modal element found, taking screenshot...")
            save(page, "06b_modal_open")

            # ── Step 7: Find Variations button ────────────────────────────────
            print("\n[7] Looking for Variations button...")
            time.sleep(1)

            # The Variations button has a Shuffle icon per the code
            var_btn = page.query_selector("button:has-text('Variations')")
            if not var_btn:
                # Look for button with shuffle icon in modal
                all_btns = page.query_selector_all("button")
                print(f"    All buttons: {len(all_btns)}")
                for btn in all_btns:
                    txt = btn.inner_text()
                    if txt:
                        print(f"      Button: '{txt[:50]}'")
                    if 'variation' in txt.lower() or 'shuffle' in txt.lower():
                        var_btn = btn
                        break

            if var_btn:
                print(f"    Found Variations button: '{var_btn.inner_text()}'")
                var_btn.click()
                time.sleep(2)
                save(page, "07_variations_panel_open")

                # ── Step 8: Find Compare toggle ───────────────────────────────
                print("\n[8] Looking for Compare toggle...")

                # Per the code: compareEngines state, toggled by a button
                compare_btns = page.query_selector_all("button")
                compare_toggle = None
                for btn in compare_btns:
                    txt = btn.inner_text()
                    if 'compare' in txt.lower() or 'imagen' in txt.lower():
                        print(f"    Found compare-related button: '{txt[:80]}'")
                        compare_toggle = btn
                        break

                if compare_toggle:
                    print("    Clicking compare toggle...")
                    compare_toggle.click()
                    time.sleep(1)
                    save(page, "08_compare_toggle_on")

                    # ── Step 9: Select "Strong" ────────────────────────────────
                    print("\n[9] Selecting 'Strong' mode...")
                    strong_btn = page.query_selector("button:has-text('Strong')")
                    if strong_btn:
                        strong_btn.click()
                        time.sleep(0.5)
                        print("    Strong selected")
                    else:
                        print("    Strong button not found")

                    # ── Step 10: Type guidance text ───────────────────────────
                    print("\n[10] Typing 'sunny stadium' in guidance field...")
                    # Look for the input field
                    guidance_inputs = page.query_selector_all("input[type='text'], textarea")
                    for inp in guidance_inputs:
                        placeholder = inp.get_attribute('placeholder') or ''
                        print(f"    Input placeholder: '{placeholder}'")
                        if 'guidance' in placeholder.lower() or 'text' in placeholder.lower() or 'instruct' in placeholder.lower():
                            inp.fill("sunny stadium")
                            print(f"    Typed 'sunny stadium' in: {placeholder}")
                            break
                    else:
                        # Try filling the last visible text input
                        print("    No specific guidance field found, trying any visible text input...")
                        for inp in guidance_inputs:
                            try:
                                bbox = inp.bounding_box()
                                if bbox and bbox['width'] > 100:
                                    inp.fill("sunny stadium")
                                    print(f"    Typed in input at ({bbox['x']:.0f}, {bbox['y']:.0f})")
                                    break
                            except:
                                pass

                    time.sleep(0.5)
                    save(page, "09_before_compare_click")

                    # ── Step 11: Click Compare button ─────────────────────────
                    print("\n[11] Clicking Compare button...")
                    # The Compare button might be labeled "Compare" or "Generate"
                    compare_gen_btn = None
                    all_btns_now = page.query_selector_all("button")
                    for btn in all_btns_now:
                        txt = btn.inner_text().strip()
                        if txt.lower() in ['compare', 'generate', 'compare both', 'run']:
                            compare_gen_btn = btn
                            print(f"    Found button: '{txt}'")
                            break
                        if 'compare' in txt.lower():
                            compare_gen_btn = btn
                            print(f"    Found compare button: '{txt}'")
                            break

                    if compare_gen_btn:
                        compare_gen_btn.click()
                        time.sleep(2)
                        save(page, "10_compare_clicked")

                        # ── Step 12: Wait up to 120 seconds for results ────────
                        print("\n[12] Waiting up to 120 seconds for images to generate...")
                        max_wait = 120
                        poll_interval = 5
                        elapsed = 0

                        while elapsed < max_wait:
                            time.sleep(poll_interval)
                            elapsed += poll_interval

                            # Take screenshot every 10 seconds
                            if elapsed % 10 == 0:
                                save(page, f"11_poll_{elapsed:03d}s")

                            # Check for IMG badges (orange badges indicating Imagen results)
                            page_html = page.content()
                            has_img_badge = 'IMG' in page_html and ('orange' in page_html or 'amber' in page_html or 'badge' in page_html.lower())
                            has_error = False

                            # Look for error messages
                            error_els = page.query_selector_all("[class*='error'], [class*='Error']")
                            for err_el in error_els:
                                try:
                                    err_text = err_el.inner_text()
                                    if err_text and len(err_text) > 5:
                                        print(f"    ERROR found at {elapsed}s: {err_text[:200]}")
                                        has_error = True
                                except:
                                    pass

                            # Look for variation images (new images in the panel)
                            var_imgs = page.query_selector_all("[class*='variation'] img, [class*='Variation'] img")
                            generated_count = len(var_imgs)

                            # Check for loading spinners
                            loading = page.query_selector("[class*='animate-spin'], [class*='Loader']")

                            print(f"    t={elapsed}s: variations={generated_count}, loading={'yes' if loading else 'no'}, error={'yes' if has_error else 'no'}")

                            if has_error or (generated_count > 0 and not loading):
                                print(f"    Stopping poll: error={has_error}, generated_count={generated_count}")
                                break

                        # Final screenshot
                        save(page, "12_final_result")

                        # ── Analyze results ────────────────────────────────────
                        print("\n[ANALYSIS] Checking final state...")

                        # Check for IMG badges
                        img_badges = page.query_selector_all("[class*='IMG'], text='IMG'")
                        print(f"    IMG badges found: {len(img_badges)}")

                        # Check for any orange/amber elements with 'IMG' text
                        img_badge_check = page.evaluate("""() => {
                            const els = Array.from(document.querySelectorAll('*'));
                            const badges = els.filter(el => {
                                const text = el.innerText || el.textContent || '';
                                const style = window.getComputedStyle(el);
                                const bg = style.backgroundColor;
                                const isOrangeish = bg.includes('245') || bg.includes('251') || bg.includes('234');
                                return (text.trim() === 'IMG' || text.trim() === 'OpenAI' || text.trim() === 'Imagen') && el.children.length === 0;
                            });
                            return badges.map(el => ({
                                text: el.innerText,
                                class: (el.className || '').substring(0, 80),
                                bg: window.getComputedStyle(el).backgroundColor,
                            }));
                        }""")
                        print(f"    Badge elements found: {len(img_badge_check)}")
                        for badge in img_badge_check:
                            print(f"      Badge: '{badge['text']}' class='{badge['class']}' bg='{badge['bg']}'")

                        # Final state summary
                        final_imgs = page.evaluate("""() => {
                            const imgs = Array.from(document.querySelectorAll('img'));
                            return imgs.filter(img => img.offsetWidth > 50 && img.offsetHeight > 50)
                                       .length;
                        }""")
                        print(f"    Total visible images on page: {final_imgs}")

                        # Check for any error messages
                        error_text = page.evaluate("""() => {
                            const errorEls = Array.from(document.querySelectorAll('[class*="error"], [class*="Error"], [class*="alert"], [role="alert"]'));
                            return errorEls.map(el => el.innerText).filter(t => t && t.length > 5).join(' | ');
                        }""")
                        if error_text:
                            print(f"    Error messages: {error_text[:300]}")
                        else:
                            print("    No error messages found")

                    else:
                        print("    Compare/Generate button NOT found")
                        all_btn_texts = [b.inner_text() for b in all_btns_now if b.inner_text()]
                        print(f"    All visible button texts: {all_btn_texts}")
                        save(page, "11_no_compare_btn")
                else:
                    print("    Compare toggle NOT found")
                    save(page, "08_no_compare_toggle")
            else:
                print("    Variations button NOT found")
                save(page, "07_no_variations_btn")
        else:
            print("    Modal NOT open - gallery images may not have loaded")
            print("    Taking diagnostic screenshots...")
            save(page, "06_no_modal_diagnostic")

            # One more attempt: scroll within the library and try clicking
            print("\n    Scrolling within library to find images...")
            page.evaluate("window.scrollTo(0, 500)")
            time.sleep(1)
            save(page, "06b_scrolled_library")

            # Get all images one more time
            all_imgs_final = page.evaluate("""() => {
                const imgs = Array.from(document.querySelectorAll('img'));
                return imgs.filter(img => img.naturalWidth > 0 && img.offsetWidth > 50).map(img => ({
                    src: img.src.substring(0, 100),
                    w: img.offsetWidth,
                    h: img.offsetHeight,
                    naturalW: img.naturalWidth,
                    naturalH: img.naturalHeight,
                }));
            }""")
            print(f"    Images with natural dimensions: {len(all_imgs_final)}")
            for img in all_imgs_final[:10]:
                print(f"      {img['w']}x{img['h']} (natural: {img['naturalW']}x{img['naturalH']}) {img['src']}")

        print(f"\n[DONE] All screenshots saved to: {SCREENSHOTS_DIR}")
        browser.close()


if __name__ == "__main__":
    run()
