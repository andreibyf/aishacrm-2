#!/usr/bin/env python3
"""Unit tests for bootstrap-stg_stg.py — stubs Doppler API, no network."""
from __future__ import annotations

import base64
import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
# Bypass any cached .pyc by reading the source directly and exec'ing into a
# fresh module. Necessary in environments where __pycache__ is on a read-only
# mount and stale bytecode can't be cleared.
_SRC = (HERE / "bootstrap-stg_stg.py").read_text(encoding="utf-8")
mod = types.ModuleType("bootstrap_stg_stg")
mod.__file__ = str(HERE / "bootstrap-stg_stg.py")
sys.modules["bootstrap_stg_stg"] = mod
exec(compile(_SRC, mod.__file__, "exec"), mod.__dict__)


class TestStep1VerifyAuth(unittest.TestCase):
    def test_personal_token_succeeds(self):
        with patch.object(mod, "_request") as r:
            r.side_effect = [
                {"type": "personal", "workplace": {"name": "4V-Data"}, "success": True},
                {"config": {"name": "prd_prd"}},
            ]
            mod.step1_verify_auth("dp.pt.fake")
            self.assertEqual(r.call_count, 2)
            self.assertEqual(r.call_args_list[0].args[1], "/me")
            self.assertIn("config=prd_prd", r.call_args_list[1].args[1])

    def test_service_token_rejected(self):
        with patch.object(mod, "_request") as r:
            r.return_value = {"type": "service_token", "success": True}
            with self.assertRaises(SystemExit):
                mod.step1_verify_auth("dp.st.fake")


class TestStep3Clone(unittest.TestCase):
    def test_meta_keys_excluded(self):
        with patch.object(mod, "_request") as r:
            r.side_effect = [
                {"secrets": {
                    "DOPPLER_PROJECT": {"raw": "aishacrm"},
                    "DOPPLER_CONFIG": {"raw": "prd_prd"},
                    "DOPPLER_ENVIRONMENT": {"raw": "prd"},
                    "ANTHROPIC_API_KEY": {"raw": "sk-ant-fake"},
                    "ALLOWED_ORIGINS": {"raw": "https://app.aishacrm.com"},
                }},
                {"secrets": {"ANTHROPIC_API_KEY": {}, "ALLOWED_ORIGINS": {}}},
            ]
            cloned = mod.step3_clone("dp.pt.fake")
            self.assertEqual(cloned, 2)
            body = r.call_args_list[1].kwargs["body"]
            self.assertEqual(set(body["secrets"].keys()),
                             {"ANTHROPIC_API_KEY", "ALLOWED_ORIGINS"})

    def test_uses_raw_values(self):
        with patch.object(mod, "_request") as r:
            r.side_effect = [
                {"secrets": {"FOO": {"raw": "bar", "computed": "ignored"}}},
                {"secrets": {"FOO": {}}},
            ]
            mod.step3_clone("dp.pt.fake")
            body = r.call_args_list[1].kwargs["body"]
            # Doppler bulk-set wants flat strings: {"FOO": "bar"} not {"FOO": {"value": "bar"}}
            self.assertEqual(body["secrets"]["FOO"], "bar")


class TestStep4Overrides(unittest.TestCase):
    def test_all_eight_overrides_pushed(self):
        with patch.object(mod, "_request") as r:
            r.return_value = {"secrets": {k: {} for k in mod.OVERRIDES}}
            mod.step4_overrides("dp.pt.fake")
            body = r.call_args_list[0].kwargs["body"]
            self.assertEqual(set(body["secrets"].keys()), set(mod.OVERRIDES.keys()))
            self.assertEqual(
                body["secrets"]["VITE_AISHACRM_BACKEND_URL"],
                "https://staging-api.aishacrm.com",
            )
            self.assertEqual(body["secrets"]["TELEMETRY_ENABLED"], "false")

    def test_override_count_is_eight(self):
        self.assertEqual(len(mod.OVERRIDES), 8)


class TestStep5RotateCalcom(unittest.TestCase):
    def test_three_calcom_secrets_set(self):
        with patch.object(mod, "_request") as r:
            r.return_value = {"secrets": {
                "CALCOM_DB_PASSWORD": {},
                "CALCOM_NEXTAUTH_SECRET": {},
                "CALCOM_ENCRYPTION_KEY": {},
            }}
            mod.step5_rotate_calcom("dp.pt.fake")
            body = r.call_args_list[0].kwargs["body"]
            self.assertEqual(
                set(body["secrets"].keys()),
                {"CALCOM_DB_PASSWORD", "CALCOM_NEXTAUTH_SECRET", "CALCOM_ENCRYPTION_KEY"},
            )
            self.assertEqual(len(body["secrets"]["CALCOM_DB_PASSWORD"]), 40)
            self.assertEqual(len(body["secrets"]["CALCOM_NEXTAUTH_SECRET"]), 64)
            self.assertEqual(len(body["secrets"]["CALCOM_ENCRYPTION_KEY"]), 32)

    def test_rotation_uses_csprng(self):
        with patch.object(mod, "_request") as r:
            keys = ["CALCOM_DB_PASSWORD", "CALCOM_NEXTAUTH_SECRET", "CALCOM_ENCRYPTION_KEY"]
            r.return_value = {"secrets": {k: {} for k in keys}}
            mod.step5_rotate_calcom("dp.pt.fake")
            first = r.call_args_list[0].kwargs["body"]["secrets"]
            r.reset_mock()
            r.return_value = {"secrets": {k: {} for k in keys}}
            mod.step5_rotate_calcom("dp.pt.fake")
            second = r.call_args_list[0].kwargs["body"]["secrets"]
            for k in keys:
                self.assertNotEqual(first[k], second[k])


class TestStep6MintToken(unittest.TestCase):
    def test_revokes_existing_same_name(self):
        with patch("bootstrap_stg_stg.dt") as mock_dt:
            mock_dt.date.today.return_value.strftime.return_value = "20260425"
            with patch.object(mod, "_request") as r:
                r.side_effect = [
                    {"tokens": [{"name": "coolify-staging-20260425", "slug": "abc"}]},
                    {"slug": "abc"},
                    {"token": {"key": "dp.st.stg_stg.NEW", "slug": "xyz"}, "success": True},
                ]
                t = mod.step6_mint_token("dp.pt.fake")
                self.assertEqual(t, "dp.st.stg_stg.NEW")
                self.assertEqual(r.call_args_list[1].args[0], "DELETE")
                self.assertEqual(r.call_args_list[2].args[0], "POST")

    def test_creates_when_no_existing(self):
        with patch.object(mod, "_request") as r:
            r.side_effect = [
                {"tokens": []},
                # Test the legacy top-level `key` shape — accepted as fallback
                {"key": "dp.st.stg_stg.FRESH"},
            ]
            t = mod.step6_mint_token("dp.pt.fake")
            self.assertEqual(t, "dp.st.stg_stg.FRESH")
            self.assertEqual(len(r.call_args_list), 2)

    def test_accepts_nested_token_response(self):
        # Real 2026 API returns {"token": {"key": ...}}, not flat {"key": ...}
        with patch.object(mod, "_request") as r:
            r.side_effect = [
                {"tokens": []},
                {"token": {"key": "dp.st.stg_stg.NESTED"}, "success": True},
            ]
            t = mod.step6_mint_token("dp.pt.fake")
            self.assertEqual(t, "dp.st.stg_stg.NESTED")


class TestRequestAuthHeader(unittest.TestCase):
    def test_basic_auth_header(self):
        captured = {}

        class FakeResp:
            def __enter__(self): return self
            def __exit__(self, *a): pass
            def read(self): return b'{"success": true}'

        def fake_urlopen(req, timeout):
            captured["headers"] = dict(req.header_items())
            captured["url"] = req.full_url
            captured["method"] = req.get_method()
            return FakeResp()

        with patch.object(mod.urllib.request, "urlopen", fake_urlopen):
            mod._request("GET", "/me", "dp.pt.test")

        expected = base64.b64encode(b"dp.pt.test:").decode()
        self.assertEqual(captured["headers"]["Authorization"], f"Basic {expected}")
        self.assertEqual(captured["url"], f"{mod.API}/me")
        self.assertEqual(captured["method"], "GET")


if __name__ == "__main__":
    unittest.main(verbosity=2)
