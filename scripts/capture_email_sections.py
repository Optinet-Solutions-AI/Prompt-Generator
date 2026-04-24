from playwright.sync_api import sync_playwright

URL = "file:///c:/Users/User/Prompt-Generator/email-samples.html"

sections = [
    ("fortuneplay", r"C:\Users\User\Prompt-Generator\final-fortuneplay.png"),
    ("rollero", r"C:\Users\User\Prompt-Generator\final-rollero.png"),
    ("novadreams", r"C:\Users\User\Prompt-Generator\final-novadreams.png"),
]

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 1400})
    page.goto(URL, wait_until="networkidle")

    for anchor, out_path in sections:
        page.evaluate(
            """(id) => {
                const el = document.getElementById(id);
                if (el) { el.scrollIntoView({block: 'start'}); }
            }""",
            anchor,
        )
        page.wait_for_timeout(500)
        page.screenshot(path=out_path, full_page=False)
        print(f"Saved {out_path}")

    browser.close()
