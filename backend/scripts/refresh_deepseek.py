#!/usr/bin/env python3
"""Refresh DeepSeek usage data.

Opens a browser window. If already logged in (session reused),
extracts balance automatically. Otherwise, log in manually and
press Enter when done. Session is saved for future runs.
"""
import asyncio
import json
import os
import re
import time

CACHE_FILE = os.path.expanduser("~/.openclaw/dashboard/backend/data/model_usage.json")
STATE_FILE = os.path.expanduser("~/.openclaw/dashboard/backend/data/deepseek_state.json")


async def main():
    from playwright.async_api import async_playwright

    existing = {}
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE) as f:
                existing = json.load(f)
        except Exception:
            pass

    result = {"deepseek": {"balance": None, "updated_at": time.time(), "error": None}}

    async with async_playwright() as p:
        storage_state = None
        if os.path.exists(STATE_FILE):
            try:
                with open(STATE_FILE) as f:
                    storage_state = json.load(f)
                print("Loaded saved session")
            except Exception:
                pass

        browser = await p.chromium.launch(
            channel="chrome", headless=False, args=["--no-sandbox"]
        )
        context = await browser.new_context(
            storage_state=storage_state, viewport={"width": 1280, "height": 800}
        )
        page = await context.new_page()

        api_data = {}

        async def capture(response):
            if "/api/" in response.url and response.status == 200:
                try:
                    body = await response.json()
                    key = response.url.split("platform.deepseek.com")[-1][:100]
                    api_data[key] = body
                except Exception:
                    pass

        page.on("response", capture)

        print("Opening https://platform.deepseek.com/usage ...")
        await page.goto("https://platform.deepseek.com/usage", timeout=30000)
        await page.wait_for_timeout(5000)

        text = await page.inner_text("body")
        is_login = any(
            kw in text[:500]
            for kw in [
                "忘记密码", "立即注册", "请输入手机号", "发送验证码",
                "开放平台协议", "微信扫码登录",
            ]
        )

        if is_login:
            print("\n" + "=" * 60)
            print("Please log in to DeepSeek in the opened Chrome window")
            print("Press Enter when done...")
            print("=" * 60)
            input()
            await page.wait_for_timeout(3000)
            if "usage" not in page.url:
                await page.goto("https://platform.deepseek.com/usage", timeout=30000)
                await page.wait_for_timeout(5000)
            try:
                os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
                await context.storage_state(path=STATE_FILE)
                print("Session saved!")
            except Exception as e:
                print(f"Could not save session: {e}")
        else:
            print("Already logged in!")

        text = await page.inner_text("body")
        print(f"\nPage URL: {page.url}")
        print(f"Page title: {await page.title()}")

        balance = None

        # Search API responses
        for key, body in api_data.items():
            def search(obj, path=""):
                nonlocal balance
                if balance is not None:
                    return
                if isinstance(obj, dict):
                    for fld in [
                        "balance", "total_balance", "available_balance",
                        "credit", "amount", "total_amount", "total_used"
                    ]:
                        if fld in obj:
                            try:
                                balance = float(obj[fld])
                                print(f"Found balance at {path}.{fld}: {balance}")
                                return
                            except (ValueError, TypeError):
                                pass
                    for k, v in obj.items():
                        search(v, f"{path}.{k}")
                elif isinstance(obj, list):
                    for i, item in enumerate(obj):
                        search(item, f"{path}[{i}]")
            search(body, key[:40])

        # Search page text
        if balance is None:
            print("\nScanning page text...")
            for line in text.split("\n"):
                l = line.strip()
                if l and any(
                    kw in l
                    for kw in ["余额", "充值", "¥", "￥", "消费", "剩余", "可用", "total"]
                ):
                    print(f"  {l}")

            for pat in [
                r'[¥￥]\s*([\d,]+\.?\d+)',
                r'余额[：:\s]*[¥￥]?\s*([\d,]+\.?\d+)',
                r'充值余额[：:\s]*[¥￥]?\s*([\d,]+\.?\d+)',
                r'剩余额度[：:\s]*[¥￥]?\s*([\d,]+\.?\d+)',
                r'消费[：:\s]*[¥￥]?\s*([\d,]+\.?\d+)',
                r'(\d+\.?\d{1,2})\s*元',
            ]:
                matches = re.findall(pat, text)
                if matches:
                    raw = matches[0].replace(",", "")
                    try:
                        balance = float(raw)
                        print(f"Extracted from text: {balance}")
                        break
                    except ValueError:
                        continue

        if balance is not None:
            result["deepseek"]["balance"] = balance
            result["deepseek"]["error"] = None
            print(f"\nFinal balance: {balance:.2f}")
        else:
            result["deepseek"]["error"] = "could not parse balance"
            print(f"\nCould not extract. Page text:\n{text[:2000]}")

        result["deepseek"]["updated_at"] = time.time()

        try:
            os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
            await context.storage_state(path=STATE_FILE)
        except Exception:
            pass

        await context.close()
        await browser.close()

    merged = {**existing, **result}
    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(merged, f, indent=2, ensure_ascii=False)
    print(f"Saved to {CACHE_FILE}")


if __name__ == "__main__":
    asyncio.run(main())
