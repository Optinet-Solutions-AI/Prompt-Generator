"""
Final zoomed screenshot of the variations panel to read badge labels.
"""
import sys
import time
from playwright.sync_api import sync_playwright

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SCREENSHOTS_DIR = "C:/Users/User/Prompt-Generator/screenshots"
BASE_URL = "https://prompt-generator-eight-umber.vercel.app"

def save(page, name):
    path = f"{SCREENSHOTS_DIR}/{name}.png"
    page.screenshot(path=path, full_page=False)
    print(f"[screenshot] {path}")

def save_crop(page, name, clip):
    path = f"{SCREENSHOTS_DIR}/{name}.png"
    page.screenshot(path=path, clip=clip, full_page=False)
    print(f"[cropped] {path}")

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a narrower viewport so the right panel fills more of the screen
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        page.set_default_timeout(15000)

        print("[setup] Loading and navigating...")
        page.goto(BASE_URL, wait_until="networkidle", timeout=60000)
        page.wait_for_selector("button", timeout=15000)
        time.sleep(2)

        page.click("button:has-text('Image Library')")
        time.sleep(3)

        imgs = page.query_selector_all("[class*='grid'] img")
        visible = [i for i in imgs if (b := i.bounding_box()) and b["width"] > 30]
        visible[0].scroll_into_view_if_needed()
        visible[0].click()
        time.sleep(2)

        page.click("button:has-text('Variations')")
        time.sleep(1)
        page.click("button:has-text('Strong')")
        time.sleep(1)

        # Introspect what text is near the toggle area before generate
        print("\n[DOM] All text in right panel before generate:")
        panel_text = page.evaluate("""() => {
            // Find any panel-like container on the right side
            const candidates = document.querySelectorAll(
                '[class*="panel"], [class*="sidebar"], [class*="right"], [class*="detail"]'
            );
            for (const el of candidates) {
                const rect = el.getBoundingClientRect();
                if (rect.left > 1000 && rect.width > 100) {
                    return el.innerText;
                }
            }
            // Fallback: get all text on right half
            const all = document.querySelectorAll('*');
            const texts = [];
            for (const el of all) {
                const rect = el.getBoundingClientRect();
                if (rect.left > 1400 && rect.width > 0 && rect.height > 0 && el.children.length === 0) {
                    const txt = el.textContent.trim();
                    if (txt) texts.push(txt);
                }
            }
            return texts.join(' | ');
        }""")
        print(f"  {panel_text[:500]}")

        # Also check for the compare toggle specifically
        compare_check = page.evaluate("""() => {
            const all = document.querySelectorAll('*');
            const found = [];
            for (const el of all) {
                const txt = el.textContent.trim();
                if (txt.toLowerCase().includes('compare') || txt.toLowerCase().includes('imagen') || txt.toLowerCase().includes('vs openai')) {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0 && el.children.length < 3) {
                        found.push({
                            tag: el.tagName,
                            text: txt.substring(0, 100),
                            class: (el.className || '').substring(0, 60),
                            rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
                        });
                    }
                }
            }
            return found;
        }""")
        print(f"\n[compare toggle search] Found {len(compare_check)} elements:")
        for c in compare_check:
            print(f"  {c}")

        save(page, "zoom_01_before_generate")

        # Click Generate
        page.click("button:has-text('Generate 2 Variations')")
        print("\nWaiting 90 seconds for results...")

        for i in range(18):
            time.sleep(5)
            elapsed = (i + 1) * 5

            # Count variation result images
            v_imgs = page.query_selector_all("[class*='variation'] img, [class*='result'] img, [class*='generated'] img")

            # Specifically look for thumbnail strip images in the panel
            panel_imgs = page.evaluate("""() => {
                const imgs = document.querySelectorAll('img');
                const panel_imgs = [];
                for (const img of imgs) {
                    const rect = img.getBoundingClientRect();
                    // Panel images are on the right side
                    if (rect.left > 1400 && rect.width > 20 && rect.height > 20) {
                        panel_imgs.push({
                            src: img.src.substring(0, 80),
                            x: Math.round(rect.x), y: Math.round(rect.y),
                            w: Math.round(rect.width), h: Math.round(rect.height),
                            alt: img.alt
                        });
                    }
                }
                return panel_imgs;
            }""")

            # Look for badge/label elements near those images
            badge_els = page.evaluate("""() => {
                const small_texts = document.querySelectorAll('span, small, label, div');
                const badges = [];
                for (const el of small_texts) {
                    const rect = el.getBoundingClientRect();
                    const txt = el.textContent.trim();
                    if (rect.left > 1400 && txt.length > 0 && txt.length < 15 && rect.width > 0 && rect.height > 0) {
                        if (el.children.length === 0) {
                            badges.push({ text: txt, class: (el.className || '').substring(0, 50) });
                        }
                    }
                }
                return badges;
            }""")

            print(f"  t={elapsed}s | panel_imgs={len(panel_imgs)} | badge_els_on_right={len(badge_els)}")
            if panel_imgs:
                for pi in panel_imgs:
                    print(f"    panel_img: {pi}")
            if badge_els:
                print(f"    badges: {badge_els}")

            # Detect errors
            errors = page.evaluate("""() => {
                const els = document.querySelectorAll('[class*="error"], [role="alert"], [data-sonner-toast]');
                return Array.from(els).map(e => e.textContent.trim()).filter(t => t);
            }""")
            if errors:
                print(f"  ERRORS: {errors}")
                save(page, f"zoom_error_{elapsed:03d}s")
                break

            if len(panel_imgs) >= 2:
                print(f"  Results ready at {elapsed}s!")
                break

        save(page, "zoom_02_final")

        # Take multiple crops of the right panel
        # Full right sidebar
        save_crop(page, "zoom_03_sidebar_full", {"x": 1550, "y": 0, "width": 370, "height": 1080})
        # Just the thumbnail strip area (approx lower portion of sidebar)
        save_crop(page, "zoom_04_thumb_strip", {"x": 1550, "y": 500, "width": 370, "height": 400})
        # Even more zoomed on thumbnails
        save_crop(page, "zoom_05_thumbs_close", {"x": 1555, "y": 520, "width": 350, "height": 200})

        # Extract all text visible in the sidebar
        sidebar_all_text = page.evaluate("""() => {
            const all = document.querySelectorAll('*');
            const items = [];
            for (const el of all) {
                const rect = el.getBoundingClientRect();
                const txt = el.textContent.trim();
                if (rect.left > 1500 && rect.width > 0 && rect.height > 0 && el.children.length === 0 && txt) {
                    items.push({ text: txt.substring(0, 80), y: Math.round(rect.y), tag: el.tagName, class: (el.className||'').substring(0,40) });
                }
            }
            items.sort((a, b) => a.y - b.y);
            return items;
        }""")
        print("\n[sidebar text, sorted by y-position]:")
        for item in sidebar_all_text:
            print(f"  y={item['y']} {item['tag']} '{item['text']}' class='{item['class']}'")

        browser.close()
        print("\n[done]")

if __name__ == "__main__":
    run()
