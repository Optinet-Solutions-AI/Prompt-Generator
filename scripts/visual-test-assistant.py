#!/usr/bin/env python3
"""Visual smoke test of the redesigned AI Concept Assistant page.

Captures screenshots of the cinematic redesign at three stages:
  1. Empty form (initial load)
  2. After typing into the brief
  3. After clicking "Draft 3 concepts" (with concept cards rendered)
"""

from playwright.sync_api import sync_playwright
from pathlib import Path

URL = "http://localhost:5173/assistant/optinet-rocketspin-test-2026-mvbq-x9k2"
OUT = Path("c:/Users/User/Prompt-Generator/.tmp/screenshots")
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})

    page.goto(URL)
    page.wait_for_load_state("networkidle")

    # Stage 1 — empty page
    page.screenshot(path=str(OUT / "ax-1-empty.png"), full_page=True)
    print("OK Saved", OUT / "ax-1-empty.png")

    # Stage 2 — type a brief
    page.fill('#ax-task', "new year banner")
    page.fill('#ax-desc', "make it warm and fun, mood of celebration")
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / "ax-2-filled.png"), full_page=True)
    print("OK Saved", OUT / "ax-2-filled.png")

    # Stage 3 — submit, wait for concepts to render
    page.click('button:has-text("Draft 3 concepts")')
    try:
        page.wait_for_selector('.ax-concept-card', timeout=20_000)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(800)  # let the fade-up animation settle
    except Exception as e:
        print(f"WARN Concepts didn't render: {e}")
    page.screenshot(path=str(OUT / "ax-3-concepts.png"), full_page=True)
    print("OK Saved", OUT / "ax-3-concepts.png")

    # Stage 4 — open the cost tracker drawer
    page.click('button:has-text("Cost")')
    page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / "ax-4-cost.png"), full_page=True)
    print("OK Saved", OUT / "ax-4-cost.png")

    browser.close()
    print("\nAll stages captured.")
