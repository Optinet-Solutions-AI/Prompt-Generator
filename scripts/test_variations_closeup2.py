from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})

        # Navigate to main page
        page.goto('http://localhost:5173', wait_until='networkidle', timeout=30000)
        time.sleep(2)

        # Click Image Library
        page.locator('text=Library').first.click()
        time.sleep(3)

        # Click first visible image
        images = page.locator('img').all()
        print(f"Found {len(images)} images")
        for i, img in enumerate(images[:10]):
            try:
                if img.is_visible(timeout=1000):
                    print(f"Clicking image {i+1}...")
                    img.click()
                    time.sleep(3)
                    break
            except:
                pass

        # Find and click Variations button
        try:
            var_btn = page.locator('button:has-text("Variations")').first
            if var_btn.is_visible(timeout=3000):
                print("Clicking Variations button...")
                var_btn.click()
                time.sleep(2)
        except Exception as e:
            print(f"Variations button: {e}")

        # Take full screenshot
        page.screenshot(path='C:/Users/User/Prompt-Generator/screenshots/variations_full.png', full_page=False)
        print("Full screenshot saved")

        # Clip the right panel only (approximately right 400px)
        page.screenshot(
            path='C:/Users/User/Prompt-Generator/screenshots/variations_panel_right.png',
            clip={'x': 1500, 'y': 0, 'width': 420, 'height': 1080},
            full_page=False
        )
        print("Right panel screenshot saved")

        # Check text content in panel
        print("\n--- Text checks ---")
        checks = [
            "Generate 4 Variations",
            "Generate 2 Variations",
            "Generates 4 variations",
            "Generates 2 variations",
            "4 total",
            "2 total",
            "Both",
            "different level of change",
        ]
        for text in checks:
            try:
                el = page.locator(f'text={text}').first
                visible = el.is_visible(timeout=1000)
                print(f"{'FOUND' if visible else 'NOT VISIBLE'}: '{text}'")
            except:
                print(f"NOT FOUND: '{text}'")

        # Try to get text from VARIATIONS section
        print("\n--- Variations section HTML ---")
        try:
            var_section = page.locator('[class*="variation"]').first
            print(var_section.inner_text())
        except Exception as e:
            print(f"Could not get variation section: {e}")

        browser.close()
        print("\nDone!")

run()
