"""
Two-part visual test:
TEST 1 — Skeleton appearance in Image Library (capture immediately after click)
TEST 2 — Console state flow check (localStorage keys)
"""

from playwright.sync_api import sync_playwright
import time
import json

SCREENSHOTS_DIR = "C:/Users/User/Prompt-Generator/screenshots"
BASE_URL = "http://localhost:3000"

def run_tests():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)  # visible so we can see exactly what happens
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        # ----------------------------------------------------------------
        # TEST 1 — Skeleton appearance in Image Library
        # ----------------------------------------------------------------
        print("=== TEST 1: Skeleton appearance ===")
        page.goto(BASE_URL, wait_until="networkidle")
        time.sleep(1)

        # Inject 8 test images into localStorage
        inject_js = """
        const images = Array.from({length:8}, (_, i) => ({
          id: `img-slow-${i}`,
          created_at: new Date().toISOString(),
          filename: `test-${i}.png`,
          provider: i % 2 === 0 ? 'chatgpt' : 'gemini',
          aspect_ratio: '16:9', resolution: '1K', storage_path: '',
          public_url: `https://picsum.photos/seed/${i+100}/400/300?t=${Date.now()}`
        }));
        localStorage.setItem('pg_generated_images', JSON.stringify(images));
        console.log('Injected images:', images.length);
        return images.length;
        """
        result = page.evaluate(inject_js)
        print(f"Injected {result} images into localStorage")

        # Take a screenshot of the main page before clicking Image Library
        page.screenshot(path=f"{SCREENSHOTS_DIR}/test1_before_click.png", full_page=False)
        print("Screenshot: test1_before_click.png")

        # Find and click the Image Library button
        # Try multiple selectors
        library_button = None
        selectors = [
            "button:has-text('Image Library')",
            "a:has-text('Image Library')",
            "[data-testid='image-library']",
            "button:has-text('Library')",
            "text=Image Library",
        ]

        for sel in selectors:
            try:
                btn = page.locator(sel).first
                if btn.count() > 0:
                    library_button = btn
                    print(f"Found Image Library button with selector: {sel}")
                    break
            except Exception as e:
                print(f"Selector {sel} failed: {e}")

        if library_button is None:
            print("ERROR: Could not find Image Library button, taking screenshot of current state")
            page.screenshot(path=f"{SCREENSHOTS_DIR}/test1_no_button_found.png", full_page=False)
        else:
            # Click the button and IMMEDIATELY take a screenshot (< 200ms)
            library_button.click()
            # Take screenshot as fast as possible — before images load
            page.screenshot(path=f"{SCREENSHOTS_DIR}/test1_skeleton_immediate.png", full_page=False)
            print("Screenshot: test1_skeleton_immediate.png (immediate, skeleton state)")

            # Wait a tiny bit more and take another
            time.sleep(0.15)
            page.screenshot(path=f"{SCREENSHOTS_DIR}/test1_skeleton_150ms.png", full_page=False)
            print("Screenshot: test1_skeleton_150ms.png (150ms after click)")

            # Wait for images to start loading
            time.sleep(1.5)
            page.screenshot(path=f"{SCREENSHOTS_DIR}/test1_after_load.png", full_page=False)
            print("Screenshot: test1_after_load.png (1.5s after click, images may be loaded)")

        # ----------------------------------------------------------------
        # TEST 2 — Console state flow check
        # ----------------------------------------------------------------
        print("\n=== TEST 2: Console state flow ===")

        # Navigate back to main page
        back_selectors = [
            "button:has-text('Back')",
            "a:has-text('Back')",
            "[aria-label='back']",
            "text=Back",
        ]

        went_back = False
        for sel in back_selectors:
            try:
                btn = page.locator(sel).first
                if btn.count() > 0:
                    btn.click()
                    time.sleep(0.5)
                    went_back = True
                    print(f"Clicked back with selector: {sel}")
                    break
            except Exception:
                pass

        if not went_back:
            # Just navigate back to root
            page.goto(BASE_URL, wait_until="networkidle")
            print("Navigated back to root URL")

        time.sleep(0.5)

        # Capture console messages
        console_messages = []
        def handle_console(msg):
            console_messages.append(f"[{msg.type}] {msg.text}")

        page.on("console", handle_console)

        # Run the localStorage check JS
        check_js = """
        const variationsKey = localStorage.getItem('pg_current_variations');
        const imagesKey = localStorage.getItem('pg_generated_images');
        const imagesLen = (imagesKey || '').length;
        console.log('variations key:', variationsKey);
        console.log('images key length:', imagesLen);
        return {
            variations: variationsKey,
            imagesLength: imagesLen
        };
        """
        ls_result = page.evaluate(check_js)
        print(f"localStorage result: {json.dumps(ls_result, indent=2)}")

        # Small wait to let console messages propagate
        time.sleep(0.5)

        # Take screenshot of current page state with console visible isn't possible in headless
        # but we take a page screenshot
        page.screenshot(path=f"{SCREENSHOTS_DIR}/test2_main_page_state.png", full_page=False)
        print("Screenshot: test2_main_page_state.png")

        # Now open DevTools console overlay isn't possible, but we can inject a visible
        # overlay showing the console output
        overlay_js = f"""
        // Create a visible console overlay on the page
        const existing = document.getElementById('__test_overlay');
        if (existing) existing.remove();

        const div = document.createElement('div');
        div.id = '__test_overlay';
        div.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(0,0,0,0.92);
            color: #00ff00;
            font-family: monospace;
            font-size: 13px;
            padding: 16px;
            z-index: 99999;
            max-height: 300px;
            overflow-y: auto;
            border-top: 2px solid #00ff00;
        `;

        const variationsVal = localStorage.getItem('pg_current_variations');
        const imagesVal = localStorage.getItem('pg_generated_images');
        const imagesLen = (imagesVal || '').length;
        const imagesCount = imagesVal ? JSON.parse(imagesVal).length : 0;

        div.innerHTML = `
            <div style="color: #ffff00; font-weight: bold; margin-bottom: 8px;">
                TEST 2 — Console State Flow Check
            </div>
            <div>&gt; localStorage.getItem('pg_current_variations')</div>
            <div style="color: #ffffff; margin-left: 16px; margin-bottom: 8px;">
                ${{variationsVal === null ? 'null' : '"' + variationsVal.substring(0, 100) + (variationsVal.length > 100 ? '..." (truncated)' : '"')}}
            </div>
            <div>&gt; localStorage.getItem('pg_generated_images') length</div>
            <div style="color: #ffffff; margin-left: 16px; margin-bottom: 8px;">
                ${{imagesLen}} chars / ${{imagesCount}} images
            </div>
            <div style="color: #888; margin-top: 8px; font-size: 11px;">
                Keys in localStorage: ${{Object.keys(localStorage).join(', ')}}
            </div>
        `;
        document.body.appendChild(div);
        console.log('TEST2 overlay injected');
        """
        page.evaluate(overlay_js)
        time.sleep(0.3)

        page.screenshot(path=f"{SCREENSHOTS_DIR}/test2_console_overlay.png", full_page=False)
        print("Screenshot: test2_console_overlay.png")

        # Print all captured console messages
        print("\nCaptured console messages:")
        for msg in console_messages:
            print(f"  {msg}")

        browser.close()
        print("\nAll tests complete.")

if __name__ == "__main__":
    run_tests()
