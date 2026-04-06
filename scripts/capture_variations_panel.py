from playwright.sync_api import sync_playwright
import time

def capture_variations_panel():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a narrower viewport to make the right panel more prominent
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})

        print("Navigating to app...")
        page.goto("http://localhost:5174", wait_until='networkidle')
        time.sleep(3)

        # Click Library
        print("Clicking Library...")
        page.locator("text=Library").first.click()
        time.sleep(4)

        # Click first image
        print("Clicking first image...")
        page.locator("img[alt]").first.click()
        time.sleep(3)

        # Click the Variations button (button index 89, 90, or 91 - the icon buttons without text)
        # First let's find the one near "Variations" label
        print("Clicking Variations button...")
        try:
            page.locator("button:has-text('Variations')").first.click()
            time.sleep(3)
        except Exception as e:
            print(f"Could not click: {e}")

        # Wait for the panel to expand
        time.sleep(2)

        # Try to find the variations section and clip the screenshot to it
        try:
            # Look for the VARIATIONS heading element
            variations_heading = page.locator("text=VARIATIONS").first
            if variations_heading.count() > 0:
                box = variations_heading.bounding_box()
                print(f"Variations heading bounding box: {box}")
        except Exception as e:
            print(f"Could not find VARIATIONS heading: {e}")

        # Capture the right panel specifically using clip
        try:
            # The right panel appears to start around x=1600 based on previous screenshots
            page.screenshot(
                path="C:/Users/User/Prompt-Generator/test-after-library.png",
                clip={"x": 1580, "y": 0, "width": 340, "height": 1080},
                full_page=False
            )
            print("Clipped screenshot of right panel saved.")
        except Exception as e:
            print(f"Clip failed: {e}")
            page.screenshot(path="C:/Users/User/Prompt-Generator/test-after-library.png", full_page=False)

        browser.close()

if __name__ == "__main__":
    capture_variations_panel()
