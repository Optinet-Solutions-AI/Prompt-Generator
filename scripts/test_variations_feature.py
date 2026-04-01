from playwright.sync_api import sync_playwright
import time
import os

SCREENSHOTS_DIR = "C:/Users/User/Prompt-Generator/screenshots"
BASE_URL = "https://prompt-generator-eight-umber.vercel.app"

def save(page, name):
    path = f"{SCREENSHOTS_DIR}/{name}.png"
    page.screenshot(path=path, full_page=False)
    print(f"[screenshot] {path}")
    return path

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1920, "height": 1080})

        # ── 1. Homepage ──────────────────────────────────────────────────────
        print("[step 1] Loading homepage…")
        page.goto(BASE_URL, wait_until="networkidle", timeout=60000)
        time.sleep(2)
        save(page, "01_homepage")

        # ── 2. Find an image thumbnail and click it ──────────────────────────
        print("[step 2] Looking for image thumbnails…")

        # Try common selectors for gallery cards/thumbnails
        thumbnail_selectors = [
            "img[src*='webp']",
            "img[src*='png']",
            "img[src*='jpg']",
            ".gallery img",
            ".card img",
            "[class*='gallery'] img",
            "[class*='card'] img",
            "[class*='image'] img",
            "[class*='thumbnail']",
            "[class*='thumb']",
            "figure img",
            "li img",
        ]

        clicked = False
        for sel in thumbnail_selectors:
            els = page.query_selector_all(sel)
            if els:
                print(f"  Found {len(els)} elements with selector: {sel}")
                # Click the first visible one
                for el in els[:5]:
                    try:
                        box = el.bounding_box()
                        if box and box["width"] > 20 and box["height"] > 20:
                            el.scroll_into_view_if_needed()
                            el.click()
                            print(f"  Clicked element with selector: {sel}")
                            clicked = True
                            break
                    except Exception as e:
                        print(f"  Could not click: {e}")
                if clicked:
                    break

        if not clicked:
            print("  No thumbnail found via img selectors — dumping visible elements")
            html = page.content()
            print(html[:3000])
            save(page, "02_no_thumbnail_found")
            browser.close()
            return

        time.sleep(3)
        save(page, "02_modal_open")
        print("[step 2] Modal screenshot taken.")

        # ── 3. Look for Variations button ────────────────────────────────────
        print("[step 3] Looking for Variations button…")
        variations_selectors = [
            "button:has-text('Variations')",
            "button:has-text('variations')",
            "[class*='variation'] button",
            "button[aria-label*='variation' i]",
        ]
        var_btn = None
        for sel in variations_selectors:
            try:
                var_btn = page.wait_for_selector(sel, timeout=5000)
                if var_btn:
                    print(f"  Found Variations button: {sel}")
                    break
            except:
                pass

        if not var_btn:
            print("  Variations button not found — listing all buttons:")
            btns = page.query_selector_all("button")
            for b in btns:
                try:
                    txt = b.inner_text().strip()
                    if txt:
                        print(f"    button: '{txt}'")
                except:
                    pass
            save(page, "03_no_variations_btn")
            browser.close()
            return

        var_btn.scroll_into_view_if_needed()
        var_btn.click()
        time.sleep(2)
        save(page, "03_variations_panel")
        print("[step 3] Variations panel screenshot taken.")

        # ── 4. Toggle Compare: OpenAI vs Imagen ──────────────────────────────
        print("[step 4] Looking for Compare toggle…")
        compare_selectors = [
            "button:has-text('Compare')",
            "label:has-text('Compare')",
            "input[type='checkbox'] + label:has-text('Compare')",
            "[class*='compare'] input",
            "[class*='toggle']:has-text('Compare')",
            "span:has-text('Compare: OpenAI vs Imagen')",
            "text=Compare: OpenAI vs Imagen",
        ]
        compare_toggle = None
        for sel in compare_selectors:
            try:
                compare_toggle = page.wait_for_selector(sel, timeout=4000)
                if compare_toggle:
                    print(f"  Found Compare toggle: {sel}")
                    break
            except:
                pass

        if not compare_toggle:
            print("  Compare toggle not found — listing all interactive elements:")
            all_btns = page.query_selector_all("button, label, input[type='checkbox']")
            for el in all_btns:
                try:
                    txt = el.inner_text().strip() or el.get_attribute("aria-label") or ""
                    if txt:
                        print(f"    element: '{txt}'")
                except:
                    pass
            save(page, "04_no_compare_toggle")
        else:
            compare_toggle.scroll_into_view_if_needed()
            compare_toggle.click()
            time.sleep(1)
            save(page, "04_compare_toggled_on")
            print("[step 4] Compare toggled on.")

        # ── 5. Select Strong mode ─────────────────────────────────────────────
        print("[step 5] Looking for Strong mode button…")
        strong_selectors = [
            "button:has-text('Strong')",
            "[class*='mode']:has-text('Strong')",
            "label:has-text('Strong')",
        ]
        strong_btn = None
        for sel in strong_selectors:
            try:
                strong_btn = page.wait_for_selector(sel, timeout=4000)
                if strong_btn:
                    print(f"  Found Strong button: {sel}")
                    break
            except:
                pass

        if strong_btn:
            strong_btn.scroll_into_view_if_needed()
            strong_btn.click()
            time.sleep(1)
            save(page, "05_strong_selected")
            print("[step 5] Strong mode selected.")
        else:
            print("  Strong mode button not found.")
            save(page, "05_no_strong_button")

        # ── 6. Click the Compare / Generate button ───────────────────────────
        print("[step 6] Clicking Compare/Generate button…")
        gen_selectors = [
            "button:has-text('Compare')",
            "button:has-text('Generate')",
            "button:has-text('generate')",
            "button[type='submit']",
        ]
        gen_btn = None
        for sel in gen_selectors:
            try:
                candidates = page.query_selector_all(sel)
                for c in candidates:
                    txt = c.inner_text().strip()
                    # Avoid the toggle label; prefer action buttons
                    if txt.lower() in ("compare", "generate", "generate both", "compare & generate"):
                        gen_btn = c
                        print(f"  Found generate button: '{txt}'")
                        break
                if gen_btn:
                    break
            except:
                pass

        if not gen_btn:
            # fallback: first button containing "compare" or "generate"
            for sel in gen_selectors:
                try:
                    gen_btn = page.wait_for_selector(sel, timeout=3000)
                    if gen_btn:
                        break
                except:
                    pass

        if gen_btn:
            gen_btn.scroll_into_view_if_needed()
            gen_btn.click()
            save(page, "06_after_click_compare")
            print("[step 6] Clicked Compare button, waiting up to 90 seconds…")
        else:
            print("  Compare/Generate button not found.")
            save(page, "06_no_generate_btn")

        # ── 7. Wait up to 90 seconds for results ─────────────────────────────
        print("[step 7] Waiting for results…")
        result_appeared = False
        for i in range(18):  # 18 × 5s = 90s
            time.sleep(5)
            elapsed = (i + 1) * 5
            save(page, f"07_waiting_{elapsed:03d}s")
            print(f"  {elapsed}s elapsed…")

            # Check for result images or error messages
            page_text = page.inner_text("body").lower()

            # Success indicators
            has_oai = "oai" in page_text
            has_img_badge = "img" in page_text
            error_keywords = ["error", "failed", "timeout", "unauthorized", "500", "400"]
            has_error = any(kw in page_text for kw in error_keywords)

            # Check for result image elements
            result_imgs = page.query_selector_all("[class*='result'] img, [class*='generated'] img, [class*='output'] img")

            if has_error:
                print(f"  ERROR detected in page text at {elapsed}s")
                result_appeared = True
                break

            if result_imgs or (has_oai and has_img_badge):
                print(f"  Results appear to be loaded at {elapsed}s")
                result_appeared = True
                break

        save(page, "08_final_result")
        print("[step 7+8] Final screenshot taken.")

        # ── 8. Inspect badges ────────────────────────────────────────────────
        print("[step 8] Inspecting page for badges and results…")
        body_text = page.inner_text("body")
        print("\n=== PAGE TEXT SUMMARY ===")
        # Print relevant chunks
        lines = body_text.split("\n")
        for line in lines:
            line = line.strip()
            if line and len(line) > 1:
                print(f"  {line}")

        # Look for OAI / IMG badges
        oai_badges = page.query_selector_all("[class*='oai'], [class*='OAI'], [aria-label*='OAI' i]")
        img_badges = page.query_selector_all("[class*='img-badge'], [class*='IMG'], [aria-label*='IMG' i]")
        print(f"\n  OAI badge elements found: {len(oai_badges)}")
        print(f"  IMG badge elements found: {len(img_badges)}")

        # Check for error messages
        error_els = page.query_selector_all("[class*='error'], [role='alert'], [class*='alert']")
        print(f"  Error/alert elements found: {len(error_els)}")
        for el in error_els:
            try:
                txt = el.inner_text().strip()
                if txt:
                    print(f"    Error text: '{txt}'")
            except:
                pass

        browser.close()
        print("\n[done] Test complete. Check screenshots directory.")

if __name__ == "__main__":
    run()
