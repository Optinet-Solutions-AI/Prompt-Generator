from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()

    # 1) Full-page scroll capture of composites
    page1 = browser.new_page(viewport={'width': 1400, 'height': 1080})
    page1.goto('file:///c:/Users/User/Prompt-Generator/email-header-composites.html', wait_until='networkidle')
    page1.screenshot(path=r'C:\Users\User\Prompt-Generator\preview-composites-v4.png', full_page=True)

    # 2) Samples: viewport-sized capture at 1400x1500, not full page
    page2 = browser.new_page(viewport={'width': 1400, 'height': 1500})
    page2.goto('file:///c:/Users/User/Prompt-Generator/email-samples.html', wait_until='networkidle')
    page2.screenshot(path=r'C:\Users\User\Prompt-Generator\preview-samples-v4.png', full_page=False)

    browser.close()

print("done")
