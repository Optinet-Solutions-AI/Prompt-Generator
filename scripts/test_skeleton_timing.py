"""
Test skeleton loading state visibility in Image Library.
Injects 8 test images via localStorage, opens Image Library,
and captures screenshots at two points:
  1. Immediately after clicking (skeleton state)
  2. After 3 seconds (loaded state)
"""

from playwright.sync_api import sync_playwright
import time
import os

OUTPUT_DIR = "C:/Users/User/Prompt-Generator/screenshots"
os.makedirs(OUTPUT_DIR, exist_ok=True)

SKELETON_PATH = f"{OUTPUT_DIR}/skeleton_loading_state.png"
LOADED_PATH   = f"{OUTPUT_DIR}/skeleton_loaded_state.png"

JS_INJECT = """
const images = Array.from({length:8}, (_, i) => ({
  id: `img-${i}`,
  created_at: new Date().toISOString(),
  filename: `test-${i}.png`,
  provider: i%2===0 ? 'chatgpt' : 'gemini',
  aspect_ratio: '16:9',
  resolution: '1K',
  storage_path: '',
  public_url: `https://picsum.photos/seed/${i+200}/800/600?nocache=${Date.now()}`
}));
localStorage.setItem('pg_generated_images', JSON.stringify(images));
"""

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1920, "height": 1080})

        # Load the app
        print("Loading app...")
        page.goto("http://localhost:3000", wait_until="networkidle")

        # Inject test images into localStorage
        print("Injecting test images into localStorage...")
        page.evaluate(JS_INJECT)

        # Find and click the Image Library button
        print("Clicking Image Library button...")
        lib_button = page.locator("button", has_text="Image Library").first
        lib_button.click()

        # Screenshot immediately (within ~0.1s) to catch skeleton state
        time.sleep(0.1)
        page.screenshot(path=SKELETON_PATH, full_page=False)
        print(f"Skeleton screenshot saved: {SKELETON_PATH}")

        # Wait 3 seconds for images to fully load
        print("Waiting 3 seconds for images to load...")
        time.sleep(3)
        page.screenshot(path=LOADED_PATH, full_page=False)
        print(f"Loaded screenshot saved: {LOADED_PATH}")

        browser.close()
        print("Done.")

if __name__ == "__main__":
    run()
