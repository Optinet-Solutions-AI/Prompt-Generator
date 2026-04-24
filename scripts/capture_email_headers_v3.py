"""Capture cropped screenshots of just the first 3 email headers."""
from playwright.sync_api import sync_playwright
from pathlib import Path

URL = "file:///c:/Users/User/Prompt-Generator/_preview_email_headers.html"
OUT = Path(r"c:/Users/User/Prompt-Generator/screenshots/email-headers-v3.png")
OUT.parent.mkdir(parents=True, exist_ok=True)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 700, "height": 1600})
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(1500)

        sections = page.locator("section").all()
        print(f"Found {len(sections)} sections")

        for i, sec in enumerate(sections[:3]):
            iframe = sec.locator("iframe").first
            h2 = sec.locator("h2").first
            # Scroll the section's header+iframe into view so we can clip safely.
            sec.scroll_into_view_if_needed()
            page.wait_for_timeout(200)
            h2_box = h2.bounding_box()
            if_box = iframe.bounding_box()
            if not if_box or not h2_box:
                print(f"Section {i}: missing box")
                continue
            top = max(0, h2_box["y"] - 4)
            left = max(0, min(h2_box["x"], if_box["x"]) - 4)
            width = max(h2_box["width"], if_box["width"]) + 8
            height = (if_box["y"] + 320) - top
            clip = {"x": left, "y": top, "width": width, "height": height}
            per_path = OUT.with_name(f"email-headers-v3-{i+1}.png")
            page.screenshot(path=str(per_path), clip=clip)
            print(f"Saved {per_path}")

        # Combined: full page screenshot, then we won't clip here since sections
        # are vertically distant. Save a single tall image containing all 3 headers
        # by screenshotting full_page and clipping in PIL.
        full_path = OUT.with_name("email-headers-v3-full.png")
        page.screenshot(path=str(full_path), full_page=True)
        print(f"Saved full page {full_path}")

        browser.close()

    # Stitch the 3 per-section images vertically into the main OUT file.
    try:
        from PIL import Image
        imgs = [Image.open(OUT.with_name(f"email-headers-v3-{i+1}.png")) for i in range(3)]
        w = max(im.width for im in imgs)
        h = sum(im.height for im in imgs)
        canvas = Image.new("RGB", (w, h), (238, 238, 238))
        y = 0
        for im in imgs:
            canvas.paste(im, (0, y))
            y += im.height
        canvas.save(OUT)
        print(f"Stitched -> {OUT}  ({w}x{h})")
    except Exception as e:
        print(f"PIL stitch skipped: {e}")


if __name__ == "__main__":
    main()
