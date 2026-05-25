#!/usr/bin/env python3
"""Refresh Minimax model usage data via Playwright.

Uses stored keychain credentials for auto-login if needed.
Caches results to ~/.openclaw/dashboard/backend/data/model_usage.json
"""
import asyncio
import json
import os
import re
import shutil
import subprocess
import tempfile
import time

CACHE_FILE = os.path.expanduser("~/.openclaw/dashboard/backend/data/model_usage.json")
CHROME_PROFILE = os.path.expanduser("~/Library/Application Support/Google/Chrome/Default")


def _keychain(account: str) -> str:
    """Read a value from macOS keychain."""
    try:
        result = subprocess.run(
            ["security", "find-generic-password", "-s", "minimax-platform",
             "-a", account, "-w"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return ""


async def _auto_login(page) -> bool:
    """Auto-fill and submit the Minimax login form. Returns True if successful."""
    username = _keychain("username")
    password = _keychain("password")
    if not username or not password:
        print("No credentials in keychain")
        return False

    try:
        # Click "密码登录" tab if not already active
        try:
            tabs = page.locator("text=密码登录")
            if await tabs.count() > 0:
                await tabs.first.click()
                await page.wait_for_timeout(500)
        except Exception:
            pass

        # Fill phone/email
        mail_input = page.locator("#register_mail")
        await mail_input.click()
        await mail_input.fill("")
        await mail_input.type(username, delay=50)

        # Fill password
        pwd_input = page.locator("#register_password")
        await pwd_input.click()
        await pwd_input.type(password, delay=50)

        # Check agreement
        try:
            checkbox = page.locator("#register_protocol")
            is_checked = await checkbox.is_checked()
            if not is_checked:
                # Click the parent label since checkbox may be hidden
                await page.locator(".ant-checkbox-wrapper").first.click()
                await page.wait_for_timeout(300)
        except Exception:
            pass

        # Click login button
        login_btn = page.locator("button:has-text('立即登录')")
        await login_btn.click()

        # Wait for login to complete (up to 15 seconds)
        for _ in range(30):
            await page.wait_for_timeout(1000)
            try:
                text = await page.inner_text("body")
                # Check if we're past the login page
                if "登录" not in text[:100] and "密码" not in text[:100]:
                    return True
                # Check for error messages
                if "错误" in text or "验证" in text[:500]:
                    err_text = text[:500]
                    print(f"Login error: {err_text[:200]}")
                    return False
            except Exception:
                pass

        return False
    except Exception as e:
        print(f"Auto-login error: {e}")
        return False


async def main():
    from playwright.async_api import async_playwright

    tmp_profile = tempfile.mkdtemp(prefix="chrome_mm_")

    usage_data = {
        "minimax": {
            "plan": "Unknown",
            "quota_calls": 0,
            "quota_hours": 0,
            "used_percent": 0,
            "updated_at": time.time(),
            "error": None,
        }
    }

    try:
        # Copy Chrome profile (cookies, login data) so the persistent context
        # is already authed. Guarded — CHROME_PROFILE may not exist on every
        # host and shouldn't crash the whole refresh.
        try:
            profile_entries = os.listdir(CHROME_PROFILE)
        except OSError:
            profile_entries = []
        for f in profile_entries:
            if any(f.startswith(p) for p in ["Cookies", "Login Data", "Preferences"]):
                src = os.path.join(CHROME_PROFILE, f)
                dst = os.path.join(tmp_profile, f)
                try:
                    if os.path.isdir(src):
                        shutil.copytree(src, dst)
                    else:
                        shutil.copy2(src, dst)
                except Exception:
                    pass

        async with async_playwright() as p:
            try:
                context = await p.chromium.launch_persistent_context(
                    user_data_dir=tmp_profile,
                    channel="chrome",
                    headless=False,
                    args=["--no-sandbox"],
                )
            except Exception as e:
                usage_data["minimax"]["error"] = f"browser: {e}"
                _save(usage_data)
                return

            page = context.pages[0] if context.pages else await context.new_page()

            api_data = {}

            async def capture(response):
                if "combo/products" in response.url:
                    try:
                        api_data["products"] = await response.json()
                    except Exception:
                        pass

            page.on("response", capture)

            try:
                await page.goto(
                    "https://platform.minimaxi.com/user-center/payment/token-plan",
                    timeout=30000,
                )
                await page.wait_for_timeout(5000)
            except Exception as e:
                usage_data["minimax"]["error"] = f"load: {e}"
                _save(usage_data)
                try:
                    await context.close()
                except Exception:
                    pass
                return

            # Check if login is needed
            try:
                text = await page.inner_text("body")
            except Exception:
                text = ""

            if "登录" in text[:200] and "密码" in text[:200]:
                print("Login required. Attempting auto-login...")
                ok = await _auto_login(page)
                if ok:
                    print("Auto-login successful!")
                    await page.goto(
                        "https://platform.minimaxi.com/user-center/payment/token-plan",
                        timeout=30000,
                    )
                    await page.wait_for_timeout(8000)
                else:
                    print("Auto-login failed. Waiting for manual login...")
                    for _ in range(60):
                        try:
                            await page.wait_for_timeout(3000)
                            text = await page.inner_text("body")
                            if "登录" not in text[:100]:
                                print("Manual login detected!")
                                await page.goto(
                                    "https://platform.minimaxi.com/user-center/payment/token-plan",
                                    timeout=30000,
                                )
                                await page.wait_for_timeout(8000)
                                break
                        except Exception:
                            break
                    else:
                        usage_data["minimax"]["error"] = "login timeout"

            # Parse API data
            if api_data.get("products"):
                data = api_data["products"]
                sub = data.get("current_subscribe", {})
                credit = data.get("credit_info", {})
                combo = data.get("current_combo_card", {})

                plan_title = combo.get("title") or sub.get("current_subscribe_title") or ""
                plan_benefit = combo.get("credit_benefit")

                if not plan_title and not plan_benefit:
                    for pkg in data.get("cycle_resource_packages", []):
                        cb = pkg.get("credit_benefit", [])
                        if cb:
                            bt = cb[0] if isinstance(cb, list) else str(cb)
                            if "600次" in bt:
                                plan_title = pkg.get("title", "Starter")
                                plan_benefit = cb
                                break

                usage_data["minimax"]["plan"] = plan_title or "Free/Starter"

                if isinstance(plan_benefit, list) and plan_benefit:
                    benefit_text = plan_benefit[0]
                elif isinstance(plan_benefit, str):
                    benefit_text = plan_benefit
                else:
                    benefit_text = ""

                if benefit_text:
                    cm = re.search(r"(\d+)次", benefit_text)
                    hm = re.search(r"(\d+)\s*小时", benefit_text)
                    if cm:
                        usage_data["minimax"]["quota_calls"] = int(cm.group(1))
                    if hm:
                        usage_data["minimax"]["quota_hours"] = int(hm.group(1))

                tc = credit.get("total_credit", "0")
                try:
                    usage_data["minimax"]["total_credit"] = float(tc)
                except (ValueError, TypeError):
                    pass

                try:
                    text = await page.inner_text("body")
                    percents = re.findall(r"(\d+(?:\.\d+)?)%", text)
                    if percents:
                        usage_data["minimax"]["page_percents_found"] = [float(p) for p in percents]
                        non_zero = [p for p in percents if float(p) > 0]
                        usage_data["minimax"]["used_percent"] = float(non_zero[0]) if non_zero else float(percents[0])
                except Exception:
                    pass

                voice = data.get("voice_slot_info", {})
                vu = voice.get("voice_slot_used", 0)
                vt = voice.get("voice_slot_total", 0)
                if vt > 0:
                    usage_data["minimax"]["voice_used_percent"] = round(vu / vt * 100, 1)

            elif not usage_data["minimax"]["error"]:
                usage_data["minimax"]["error"] = "no API data"

            usage_data["minimax"]["updated_at"] = time.time()

            # Save cookies for next time
            try:
                await context.storage_state(
                    path=os.path.expanduser("~/.openclaw/dashboard/backend/data/minimax_state.json")
                )
            except Exception:
                pass

            try:
                await context.close()
            except Exception:
                pass
    except Exception as e:
        usage_data["minimax"]["error"] = f"unexpected: {e}"
    finally:
        # Always wipe the temp Chrome profile — it contains a copy of the
        # user's cookies / login data and lingering in /tmp is leaky.
        shutil.rmtree(tmp_profile, ignore_errors=True)

    _save(usage_data)


def _save(data: dict):
    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(json.dumps(data, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
