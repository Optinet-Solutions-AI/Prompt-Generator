from playwright.sync_api import sync_playwright

url = "file:///c:/Users/User/Prompt-Generator/_preview_email_headers.html"
output = "c:/Users/User/Prompt-Generator/screenshots/email-headers-preview.png"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 1600})
    page.goto(url, wait_until="networkidle")
    # Give iframes time to settle
    page.wait_for_timeout(1500)
    page.screenshot(path=output, full_page=False)
    browser.close()

print(f"Saved: {output}")
