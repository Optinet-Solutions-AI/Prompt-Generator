"""
Take zoomed screenshots of the final result state to show the variations strip clearly.
"""
from playwright.sync_api import sync_playwright
import time, os

SCREENSHOTS_DIR = "C:/Users/User/Prompt-Generator/screenshots/compare_test"
BASE_URL = "https://prompt-generator-eight-umber.vercel.app"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

def log(msg):
    print(msg.encode('ascii', errors='replace').decode('ascii'), flush=True)

def save(page, name):
    path = f"{SCREENSHOTS_DIR}/{name}.png"
    page.screenshot(path=path, full_page=False)
    log(f"  [screenshot] {path}")
    return path


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = ctx.new_page()

        # Repeat the full flow quickly to get to the result state
        log("Loading and running full flow to final result...")
        page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
        time.sleep(3)

        selects = page.query_selector_all("select")
        selects[0].select_option(value="SpinJo")
        time.sleep(2)
        selects = page.query_selector_all("select")
        opts = selects[1].evaluate("el => Array.from(el.options).map(o => o.value).filter(v => v)")
        selects[1].select_option(value=opts[0])
        time.sleep(2)

        page.click("button:has-text('Generate Prompt')")
        for _ in range(12):
            time.sleep(5)
            if page.query_selector("button:has-text('ChatGPT')"):
                break

        page.click("button:has-text('ChatGPT')")
        for i in range(15):
            time.sleep(5)
            if not page.query_selector("[class*='animate-spin']"):
                google_imgs = page.evaluate("() => document.querySelectorAll('img[src*=\"googleusercontent\"]').length")
                if google_imgs > 0:
                    break

        # Open modal
        container = page.query_selector("[class*='cursor-pointer'][class*='aspect-square']")
        if container:
            container.click()
            time.sleep(3)

        # Variations button
        page.click("button:has-text('Variations')")
        time.sleep(1)

        # Enable Compare toggle
        compare_info = page.evaluate("""() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const found = btns.find(b => b.textContent.includes('Compare') && b.textContent.includes('Imagen'));
            if (found) {
                const bbox = found.getBoundingClientRect();
                return { cx: bbox.x + bbox.width/2, cy: bbox.y + bbox.height/2 };
            }
            return null;
        }""")
        if compare_info:
            page.mouse.click(compare_info['cx'], compare_info['cy'])
            time.sleep(0.5)

        # Select Strong
        page.click("button:has-text('Strong')")
        time.sleep(0.5)

        # Type guidance
        inputs = page.query_selector_all("input[type='text']")
        for inp in inputs:
            bbox = inp.bounding_box()
            if bbox and bbox['width'] > 100:
                inp.fill("sunny stadium")
                break

        save(page, "Z01_before_compare")

        # Click Compare
        compare_btn_info = page.evaluate("""() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const found = btns.find(b => {
                const t = (b.textContent || '').replace(/[^\\x20-\\x7E]/g, '').trim();
                return t === 'Compare';
            });
            if (found) {
                const bbox = found.getBoundingClientRect();
                return { cx: bbox.x + bbox.width/2, cy: bbox.y + bbox.height/2 };
            }
            return null;
        }""")

        if compare_btn_info:
            page.mouse.click(compare_btn_info['cx'], compare_btn_info['cy'])
            log("Compare clicked, waiting...")
        else:
            log("Compare button not found!")
            browser.close()
            return

        # Wait for results
        for i in range(25):
            time.sleep(5)
            spinner = page.query_selector("[class*='animate-spin']")
            imgs = page.evaluate("() => document.querySelectorAll('img[src*=\"googleusercontent\"], img[src*=\"lh3\"]').length")
            log(f"  t={(i+1)*5}s: spinner={'yes' if spinner else 'no'}, imgs={imgs}")
            if imgs >= 5 and not spinner:
                break

        save(page, "Z02_results_full")

        # Take a clip at the right panel (thumbnail strip)
        # The right strip is at ~x=1440-1920
        strip_info = page.evaluate("""() => {
            const rightDiv = document.querySelector('[class*="strip"], [class*="gallery"]');
            if (rightDiv) {
                const bbox = rightDiv.getBoundingClientRect();
                return { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height };
            }
            // Try to find images in the right side
            const imgs = Array.from(document.querySelectorAll('img')).filter(img => {
                const bbox = img.getBoundingClientRect();
                return bbox.x > 1200 && bbox.width > 50;
            });
            if (imgs.length > 0) {
                const first = imgs[0].getBoundingClientRect();
                return { x: first.x - 20, y: first.y - 20, count: imgs.length };
            }
            return null;
        }""")
        log(f"Strip info: {strip_info}")

        # Get the badge details
        badges = page.evaluate("""() => {
            const all = Array.from(document.querySelectorAll('*'));
            return all.filter(el => {
                if (!el.offsetWidth) return false;
                const t = (el.textContent || '').trim();
                return (t === 'IMG' || t === 'Imagen' || t === 'OpenAI') && el.children.length <= 1;
            }).map(el => {
                const bbox = el.getBoundingClientRect();
                return {
                    text: t = el.textContent.trim(),
                    bg: window.getComputedStyle(el).backgroundColor,
                    x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height,
                };
            });
        }""")
        log(f"Badges: {badges}")

        # Also check what images are visible on the right side
        right_imgs = page.evaluate("""() => {
            return Array.from(document.querySelectorAll('img')).map(img => {
                const bbox = img.getBoundingClientRect();
                return { x: Math.round(bbox.x), y: Math.round(bbox.y), w: Math.round(bbox.width), h: Math.round(bbox.height), src: img.src.substring(0, 80) };
            }).filter(img => img.w > 30 && img.h > 30 && img.y > 0 && img.y < 1080);
        }""")
        log("All visible images:")
        for img in right_imgs:
            log(f"  {img['w']}x{img['h']} at ({img['x']},{img['y']}) - {img['src']}")

        save(page, "Z03_final_analysis")

        browser.close()
        log(f"\nDone. Screenshots in: {SCREENSHOTS_DIR}")


if __name__ == "__main__":
    run()
