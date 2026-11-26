import json, os, stat, subprocess, sys, tempfile, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class AccountsTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.home = tmp.name
        # A fake `claude` records how it was called, so no real account is ever touched.
        os.makedirs(f"{self.home}/bin")
        self.log = f"{self.home}/claude.log"
        fake = f"{self.home}/bin/claude"
        with open(fake, "w") as f:
            f.write(f'#!/bin/sh\necho "$* ${{CLAUDE_CONFIG_DIR:-unset}}" >> "{self.log}"\n')
        os.chmod(fake, os.stat(fake).st_mode | stat.S_IEXEC)

    def acct(self, *args):
        env = {**os.environ, "HOME": self.home, "PATH": f"{self.home}/bin:/usr/bin:/bin",
               "CLAUDE_CONFIG_DIR": "/somewhere/else"}
        r = subprocess.run([sys.executable, f"{ROOT}/acct.py", *args], env=env, capture_output=True, text=True)
        return r.returncode, json.loads(r.stdout)

    def listing(self):
        return self.acct("list")[1]

    def calls(self):
        with open(self.log) as f:
            return f.read().splitlines()

    def test_starts_with_only_the_main_account(self):
        out = self.listing()
        self.assertEqual((out["active"], [a["id"] for a in out["accounts"]]), ("default", ["default"]))

    def test_reads_the_email_of_a_signed_in_profile(self):
        with open(f"{self.home}/.claude.json", "w") as f:
            json.dump({"oauthAccount": {"emailAddress": "me@example.com", "displayName": "Me"}}, f)
        main = self.listing()["accounts"][0]
        self.assertEqual((main["email"], main["display"]), ("me@example.com", "Me"))

    def test_add_creates_an_active_profile_with_the_usage_hook(self):
        _, added = self.acct("add")
        self.assertEqual((added["id"], self.listing()["active"]), ("acct2", "acct2"))
        with open(f"{added['dir']}/settings.json") as f:
            self.assertIn("herdr-usage-statusline.py", json.load(f)["statusLine"]["command"])
        self.assertEqual(self.acct("add")[1]["id"], "acct3")

    def test_set_active_ignores_unknown_ids(self):
        self.acct("set-active", "nope")
        self.assertEqual(self.listing()["active"], "default")

    def test_logout_targets_only_that_profile(self):
        _, added = self.acct("add")
        self.acct("logout", "acct2")
        self.acct("logout", "default")
        self.assertEqual(self.calls(), [f"auth logout {added['dir']}", "auth logout unset"])

    def test_logout_of_unknown_account_fails(self):
        self.assertEqual(self.acct("logout", "nope")[0], 1)

    def test_remove_forgets_the_account_but_keeps_its_folder(self):
        _, added = self.acct("add")
        self.acct("remove", "acct2")
        out = self.listing()
        self.assertEqual((out["active"], len(out["accounts"])), ("default", 1))
        self.assertTrue(os.path.isdir(added["dir"]))
        self.assertEqual(self.calls(), [f"auth logout {added['dir']}"])

    def test_main_account_cannot_be_removed(self):
        self.assertEqual(self.acct("remove", "default")[0], 1)
        self.assertEqual(len(self.listing()["accounts"]), 1)


if __name__ == "__main__":
    unittest.main()
