from playwright.sync_api import sync_playwright
import time
import json

SCREENSHOTS_DIR = "C:/Users/User/Prompt-Generator/screenshots"

def capture(page, name):
    path = f"{SCREENSHOTS_DIR}/{name}.png"
    page.screenshot(path=path, full_page=False)
    print(f"Saved: {path}")
    return path

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        # Step 1: Go to http://localhost:3001
        print("Step 1: Navigating to http://localhost:3001 ...")
        page.goto("http://localhost:3001", wait_until='networkidle')
        capture(page, "step1_initial_page")
        print("Step 1 done.")

        # Step 2: Inject 10 real test images via localStorage
        print("Step 2: Injecting test images into localStorage ...")
        inject_result = page.evaluate("""
            () => {
                const images = Array.from({length:10}, (_, i) => ({
                    id: `img-test-${i}-${Date.now()}`,
                    created_at: new Date(Date.now() - i * 60000).toISOString(),
                    filename: `chatgpt-image-${i}.png`,
                    provider: i % 3 === 0 ? 'gemini' : i % 3 === 1 ? 'chatgpt' : 'edit',
                    aspect_ratio: '16:9',
                    resolution: '1K',
                    storage_path: '',
                    public_url: `https://picsum.photos/seed/${i+50}/800/450`
                }));
                localStorage.setItem('pg_generated_images', JSON.stringify(images));
                const stored = JSON.parse(localStorage.getItem('pg_generated_images'));
                console.log('Stored images:', stored.length);
                return { count: stored.length, images: stored };
            }
        """)
        print(f"Injected {inject_result['count']} images into localStorage.")
        print("Image IDs:", [img['id'] for img in inject_result['images']])

        # Step 3: Screenshot console output confirmation
        capture(page, "step3_after_injection")
        print("Step 3: Screenshot after injection taken.")

        # Step 4: Click the "Image Library" button WITHOUT refreshing
        print("Step 4: Looking for 'Image Library' button ...")
        # Try various selectors for the Image Library button
        lib_button = None
        selectors = [
            "text=Image Library",
            "[aria-label='Image Library']",
            "button:has-text('Image Library')",
            "a:has-text('Image Library')",
            "[data-testid='image-library']",
        ]
        for sel in selectors:
            try:
                el = page.locator(sel).first
                if el.is_visible(timeout=2000):
                    lib_button = el
                    print(f"  Found button with selector: {sel}")
                    break
            except Exception:
                continue

        if lib_button is None:
            print("  Could not find 'Image Library' button with standard selectors. Capturing page HTML for inspection.")
            html_snippet = page.evaluate("() => document.body.innerHTML.substring(0, 3000)")
            print("HTML snippet:", html_snippet[:1000])
            capture(page, "step4_no_button_found")
        else:
            lib_button.click()
            print("Step 4: Clicked 'Image Library' button.")

            # Step 5: Screenshot IMMEDIATELY (< 0.3s) — check for skeleton boxes
            time.sleep(0.2)
            capture(page, "step5_immediate_after_click")
            print("Step 5: Immediate screenshot taken (check for skeleton boxes).")

            # Step 6: Wait 4 seconds, take another screenshot — did images load?
            time.sleep(4)
            capture(page, "step6_after_4_seconds")
            print("Step 6: Screenshot after 4 seconds taken (check if images loaded).")

            # Step 7: Click the "Back" button to return to main page
            print("Step 7: Looking for 'Back' button ...")
            back_button = None
            back_selectors = [
                "text=Back",
                "button:has-text('Back')",
                "[aria-label='Back']",
                "[aria-label='back']",
                "a:has-text('Back')",
            ]
            for sel in back_selectors:
                try:
                    el = page.locator(sel).first
                    if el.is_visible(timeout=2000):
                        back_button = el
                        print(f"  Found Back button with selector: {sel}")
                        break
                except Exception:
                    continue

            if back_button is None:
                print("  Could not find 'Back' button. Capturing page for inspection.")
                capture(page, "step7_no_back_button")
            else:
                back_button.click()
                time.sleep(1)
                capture(page, "step7_after_back")
                print("Step 7: Clicked Back, screenshot taken.")

                # Step 8: Click "Image Library" again (second visit)
                print("Step 8: Clicking 'Image Library' again ...")
                lib_button2 = None
                for sel in selectors:
                    try:
                        el = page.locator(sel).first
                        if el.is_visible(timeout=2000):
                            lib_button2 = el
                            print(f"  Found button with selector: {sel}")
                            break
                    except Exception:
                        continue

                if lib_button2 is None:
                    print("  Could not find 'Image Library' button on second visit.")
                    capture(page, "step8_no_button")
                else:
                    lib_button2.click()
                    print("Step 8: Clicked 'Image Library' (second visit).")

                    # Step 9: Screenshot IMMEDIATELY — do images appear WITHOUT skeletons?
                    time.sleep(0.2)
                    capture(page, "step9_second_visit_immediate")
                    print("Step 9: Immediate screenshot on second visit taken.")

                    # Also wait a moment and take a final screenshot
                    time.sleep(3)
                    capture(page, "step9b_second_visit_after_3s")
                    print("Step 9b: Second visit screenshot after 3s taken.")

        browser.close()
        print("\nAll steps complete.")

if __name__ == "__main__":
    run()
