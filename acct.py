#!/usr/bin/env python3
"""acct.py list | set-active <id> | add | remove <id> | logout <id> — manage Claude account profiles."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common

d = common.load()
cmd = sys.argv[1] if len(sys.argv) > 1 else ""
if cmd == "list":
    out = [{"id": x["id"], "name": x["name"], "dir": x["dir"], "email": common.email_of(x), "display": common.display_of(x)}
           for x in d["accounts"]]
    print(json.dumps({"accounts": out, "active": d["active"]}))
elif cmd == "set-active" and len(sys.argv) > 2:
    if sys.argv[2] in [a["id"] for a in d["accounts"]]:
        d["active"] = sys.argv[2]
        common.save(d)
    print(json.dumps({"ok": True}))
elif cmd == "add":
    n = 2
    while any(a["id"] == f"acct{n}" for a in d["accounts"]):
        n += 1
    a = {"id": f"acct{n}", "name": f"Account {n}", "dir": f"{common.HOME}/.claude-acct{n}"}
    os.makedirs(a["dir"], exist_ok=True)
    sp = f"{a['dir']}/settings.json"
    if not os.path.exists(sp):  # report plan usage to the Herdr mod, like the main profile
        json.dump({"statusLine": {"type": "command", "command": f"python3 {common.HOOK}"}}, open(sp, "w"), indent=2)
    d["accounts"].append(a)
    d["active"] = a["id"]
    common.save(d)
    print(json.dumps(a))
elif cmd == "remove" and len(sys.argv) > 2 and sys.argv[2] != "default":
    import subprocess, shutil
    acct = next((x for x in d["accounts"] if x["id"] == sys.argv[2]), None)
    if acct:
        env = dict(os.environ); env["CLAUDE_CONFIG_DIR"] = acct["dir"]
        exe = shutil.which("claude") or f"{common.HOME}/.local/bin/claude"
        try: subprocess.run([exe, "auth", "logout"], env=env, capture_output=True, timeout=30)
        except Exception: pass
        d["accounts"] = [x for x in d["accounts"] if x["id"] != acct["id"]]
        if d["active"] == acct["id"]: d["active"] = "default"
        common.save(d)  # the profile folder is kept on disk
    print(json.dumps({"ok": True}))
elif cmd == "logout" and len(sys.argv) > 2:
    import shutil, subprocess
    acct = next((x for x in d["accounts"] if x["id"] == sys.argv[2]), None)
    if not acct:
        print(json.dumps({"ok": False})); sys.exit(1)
    env = dict(os.environ)
    if acct["id"] == "default":
        env.pop("CLAUDE_CONFIG_DIR", None)  # the main profile is the default location
    else:
        env["CLAUDE_CONFIG_DIR"] = acct["dir"]
    exe = shutil.which("claude") or f"{common.HOME}/.local/bin/claude"
    r = subprocess.run([exe, "auth", "logout"], env=env, capture_output=True, text=True, timeout=30)
    print(json.dumps({"ok": r.returncode == 0, "out": (r.stdout + r.stderr).strip()[:200]}))
    sys.exit(r.returncode)
else:
    print(json.dumps({"ok": False}))
    sys.exit(1)
