from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()

    # 1. Full-page scroll capture of email-header-composites.html at 1400 wide
    ctx1 = browser.new_context(viewport={"width": 1400, "height": 900})
    page1 = ctx1.new_page()
    page1.goto("file:///c:/Users/User/Prompt-Generator/email-header-composites.html", wait_until="networkidle")
    page1.screenshot(
        path=r"C:\Users\User\Prompt-Generator\preview-composites-v3.png",
        full_page=True,
    )
    ctx1.close()

    # 2. FortunePlay section only at tall viewport
    ctx2 = browser.new_context(viewport={"width": 1400, "height": 1400})
    page2 = ctx2.new_page()
    page2.goto("file:///c:/Users/User/Prompt-Generator/email-samples.html", wait_until="networkidle")

    # Try to find the FortunePlay section; fall back to first section/brand block
    target = None
    for selector in [
        "#fortuneplay",
        "[data-brand='fortuneplay']",
        "[data-brand='FortunePlay']",
        "section:has-text('FortunePlay')",
        ".brand-section:has-text('FortunePlay')",
        "section",
        ".brand-section",
    ]:
        try:
            loc = page2.locator(selector).first
            if loc.count() > 0:
                target = loc
                break
        except Exception:
            continue

    if target is not None:
        target.screenshot(path=r"C:\Users\User\Prompt-Generator\preview-samples-v3.png")
    else:
        page2.screenshot(
            path=r"C:\Users\User\Prompt-Generator\preview-samples-v3.png",
            full_page=False,
        )

    ctx2.close()
    browser.close()
    print("done")
