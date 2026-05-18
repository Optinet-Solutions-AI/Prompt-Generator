#!/usr/bin/env python3
"""Verify the cinematic redesign actually rendered on the live Vercel deploy."""

from playwright.sync_api import sync_playwright
from pathlib import Path

URL = "https://prompt-generator-virid-delta.vercel.app/assistant/optinet-rocketspin-test-2026-mvbq-x9k2"
OUT = Path("c:/Users/User/Prompt-Generator/.tmp/screenshots")
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto(URL)
    page.wait_for_load_state("networkidle")
    try:
        page.wait_for_selector('#ax-task', timeout=15_000)
    except Exception as e:
        print(f"WARN form not found: {e}")
    page.wait_for_timeout(800)

    page.screenshot(path=str(OUT / "live-1-empty.png"), full_page=True)
    print("OK Saved live-1-empty.png")

    page.fill('#ax-task', "new year banner")
    page.fill('#ax-desc', "make it warm and fun, mood of celebration")
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / "live-2-filled.png"), full_page=True)
    print("OK Saved live-2-filled.png")

    browser.close()
