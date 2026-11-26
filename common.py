"""Shared helpers: Claude account profiles (each one is a CLAUDE_CONFIG_DIR)."""
import json, os

HOME = os.path.expanduser("~")
STATE = f"{HOME}/.claude/state"
FILE = f"{STATE}/herdr-accounts.json"
HOOK = f"{HOME}/.claude/hooks/herdr-usage-statusline.py"


def load():
    try:
        d = json.load(open(FILE))
    except Exception:
        d = {}
    accts = d.get("accounts") or []
    if not any(a.get("id") == "default" for a in accts):
        accts.insert(0, {"id": "default", "name": "Main", "dir": f"{HOME}/.claude"})
    active = d.get("active")
    if active not in [a["id"] for a in accts]:
        active = "default"
    return {"active": active, "accounts": accts}


def save(d):
    os.makedirs(STATE, exist_ok=True)
    tmp = FILE + ".tmp"
    json.dump(d, open(tmp, "w"), indent=2)
    os.replace(tmp, FILE)


def email_of(a):
    path = f"{HOME}/.claude.json" if a["id"] == "default" else f"{a['dir']}/.claude.json"
    try:
        o = json.load(open(path)).get("oauthAccount") or {}
        return o.get("emailAddress")
    except Exception:
        return None


def display_of(a):
    path = f"{HOME}/.claude.json" if a["id"] == "default" else f"{a['dir']}/.claude.json"
    try:
        o = json.load(open(path)).get("oauthAccount") or {}
        return o.get("displayName") or o.get("fullName")
    except Exception:
        return None
