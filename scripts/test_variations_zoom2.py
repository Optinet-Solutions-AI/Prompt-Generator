from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a narrower viewport to make the right panel content larger
        page = browser.new_page(viewport={'width': 1280, 'height': 900})

        # Navigate
        page.goto('http://localhost:5173', wait_until='networkidle', timeout=30000)
        time.sleep(2)

        # Click Image Library
        page.locator('text=Library').first.click()
        time.sleep(3)

        # Click first visible image
        images = page.locator('img').all()
        for i, img in enumerate(images[:10]):
            try:
                if img.is_visible(timeout=1000):
                    img.click()
                    time.sleep(3)
                    break
            except:
                pass

        # Find and click Variations button/section
        try:
            var_btn = page.locator('button:has-text("Variations")').first
            if var_btn.is_visible(timeout=3000):
                var_btn.click()
                time.sleep(2)
                print("Clicked Variations button")
        except Exception as e:
            print(f"Variations button: {e}")

        # Take full screenshot
        page.screenshot(path='C:/Users/User/Prompt-Generator/screenshots/var_1280.png', full_page=False)
        print("Screenshot saved: var_1280.png")

        # Clip bottom half of right panel where variations section is
        page.screenshot(
            path='C:/Users/User/Prompt-Generator/screenshots/var_right_panel.png',
            clip={'x': 920, 'y': 400, 'width': 360, 'height': 500},
            full_page=False
        )
        print("Right panel clip saved: var_right_panel.png")

        # Also clip the full right panel
        page.screenshot(
            path='C:/Users/User/Prompt-Generator/screenshots/var_right_full.png',
            clip={'x': 920, 'y': 0, 'width': 360, 'height': 900},
            full_page=False
        )
        print("Right panel full clip saved: var_right_full.png")

        # Get text content of relevant elements
        print("\n--- Getting visible text ---")
        try:
            # Try to find the variations section
            selectors_to_try = [
                'text=VARIATIONS',
                'text=Variations',
                '[class*="VARIATION"]',
                'button:has-text("Generate")',
            ]
            for sel in selectors_to_try:
                try:
                    el = page.locator(sel).first
                    if el.is_visible(timeout=2000):
                        box = el.bounding_box()
                        print(f"Found '{sel}' at: {box}")
                        # Get parent text
                        parent_text = el.evaluate('el => el.closest("[class]")?.innerText || el.parentElement?.innerText || el.innerText')
                        print(f"Parent text: {parent_text[:500]}")
                        print("---")
                except Exception as e:
                    print(f"Error with {sel}: {e}")
        except Exception as e:
            print(f"Error: {e}")

        browser.close()
        print("\nDone!")

run()
