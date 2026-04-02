from playwright.sync_api import sync_playwright
import time
import sys

def capture(url, output_path, viewport_width=1920, viewport_height=1080, click_selector=None, wait_after_click=8):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': viewport_width, 'height': viewport_height})
        page.goto(url, wait_until='networkidle')
        time.sleep(3)

        if click_selector:
            try:
                page.click(click_selector)
                print(f"Clicked: {click_selector}")
                time.sleep(wait_after_click)
            except Exception as e:
                print(f"Could not click selector '{click_selector}': {e}")
                # Try text-based click as fallback
                try:
                    page.get_by_text(click_selector).first.click()
                    print(f"Clicked by text: {click_selector}")
                    time.sleep(wait_after_click)
                except Exception as e2:
                    print(f"Text click also failed: {e2}")

        page.screenshot(path=output_path, full_page=False)
        print(f"Screenshot saved to {output_path}")
        browser.close()

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
    output = sys.argv[2] if len(sys.argv) > 2 else "screenshot.png"
    width = int(sys.argv[3]) if len(sys.argv) > 3 else 1920
    height = int(sys.argv[4]) if len(sys.argv) > 4 else 1080
    click = sys.argv[5] if len(sys.argv) > 5 else None
    wait = int(sys.argv[6]) if len(sys.argv) > 6 else 8

    capture(url, output, width, height, click, wait)
