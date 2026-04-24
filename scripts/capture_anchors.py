from playwright.sync_api import sync_playwright

def capture(url, anchor, output_path, viewport_width=1400, viewport_height=1400):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': viewport_width, 'height': viewport_height})
        page.goto(url, wait_until='networkidle')
        page.evaluate(f"document.getElementById('{anchor}').scrollIntoView()")
        page.wait_for_timeout(500)
        page.screenshot(path=output_path, full_page=False)
        browser.close()

url = "file:///C:/Users/User/Prompt-Generator/email-samples.html"

capture(url, "spinsup", r"C:\Users\User\Prompt-Generator\clean-spinsup.png")
capture(url, "rollero", r"C:\Users\User\Prompt-Generator\clean-rollero.png")
capture(url, "novadreams", r"C:\Users\User\Prompt-Generator\clean-novadreams.png")
