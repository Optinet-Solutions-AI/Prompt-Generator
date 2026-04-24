from playwright.sync_api import sync_playwright
import sys

def capture():
    url = "file:///c:/Users/User/Prompt-Generator/_preview_email_headers.html"
    out = "c:/Users/User/Prompt-Generator/screenshots/email-headers-preview-v2.png"
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1280, "height": 2000})
        page = ctx.new_page()
        page.goto(url, wait_until="networkidle")
        # Clip top ~3000px
        page.set_viewport_size({"width": 1280, "height": 3000})
        page.wait_for_timeout(500)
        page.screenshot(path=out, clip={"x": 0, "y": 0, "width": 1280, "height": 3000})
        browser.close()
    print("saved:", out)

if __name__ == "__main__":
    capture()
