"""
capture_email_body_review.py
Screenshot 3 representative brand sections from email-samples.html so we can
analyse the email body styling (everything below the brand header).
"""
from playwright.sync_api import sync_playwright

URL = "file:///c:/Users/User/Prompt-Generator/email-samples.html"
OUT = r"c:/Users/User/Prompt-Generator/.tmp/screenshots"

# Pick 3 different brand "moods" so we cover the visual range:
# FortunePlay  = warm gold/black
# Roosterbet   = bold red/black
# NovaDreams   = cool cyan
sections = [
    ("fortuneplay", f"{OUT}/email-body-fortuneplay.png"),
    ("roosterbet",  f"{OUT}/email-body-roosterbet.png"),
    ("novadreams",  f"{OUT}/email-body-novadreams.png"),
]

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 2000, "height": 1300})
    page.goto(URL, wait_until="networkidle")

    for anchor, out_path in sections:
        page.evaluate(
            """(id) => {
                const el = document.getElementById(id);
                if (el) { el.scrollIntoView({block: 'start'}); }
            }""",
            anchor,
        )
        page.wait_for_timeout(600)
        page.screenshot(path=out_path, full_page=False)
        print(f"Saved {out_path}")

    browser.close()
