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
        # Give iframes time to render their srcdoc content
        page.wait_for_timeout(1500)

        # Find the first 3 sections containing iframes and get their bounding boxes.
        sections = page.locator("section").all()
        print(f"Found {len(sections)} sections")

        # Collect individual screenshots and also a combined tight-crop.
        per_section_paths = []
        combined_clip_boxes = []
        for i, sec in enumerate(sections[:3]):
            iframe = sec.locator("iframe").first
            h2 = sec.locator("h2").first
            h2_box = h2.bounding_box()
            if_box = iframe.bounding_box()
            if not if_box or not h2_box:
                print(f"Section {i}: missing box")
                continue
            # Header area: h2 label + top ~320px of iframe
            top = h2_box["y"] - 4
            left = min(h2_box["x"], if_box["x"]) - 4
            width = max(h2_box["width"], if_box["width"]) + 8
            height = (if_box["y"] + 320) - top
            clip = {
                "x": max(0, left),
                "y": max(0, top),
                "width": width,
                "height": height,
            }
            combined_clip_boxes.append(clip)
            per_path = OUT.with_name(f"email-headers-v3-{i+1}.png")
            page.screenshot(path=str(per_path), clip=clip)
            per_section_paths.append(str(per_path))
            print(f"Saved {per_path}")

        # Combined screenshot covering all 3 header areas in one image.
        if combined_clip_boxes:
            top = min(b["y"] for b in combined_clip_boxes)
            bottom = max(b["y"] + b["height"] for b in combined_clip_boxes)
            left = min(b["x"] for b in combined_clip_boxes)
            right = max(b["x"] + b["width"] for b in combined_clip_boxes)
            combined_clip = {
                "x": left,
                "y": top,
                "width": right - left,
                "height": bottom - top,
            }
            page.screenshot(
                path=str(OUT),
                clip=combined_clip,
                full_page=True,
            )
            print(f"Saved combined {OUT}")

        browser.close()


if __name__ == "__main__":
    main()
