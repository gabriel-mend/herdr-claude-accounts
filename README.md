# herdr-claude-accounts

A [Herdr.app](https://herdr.app) sidebar mod to **switch between Claude accounts**. Each account is a separate profile folder (`CLAUDE_CONFIG_DIR`).

- Initial avatar, name and email per account; the active one has a green dot.
- **new agent** opens a Claude agent in that account; **sign in** / **+ add account** start `claude auth login` first.
- **sign out** and **remove** (both ask to confirm). Remove signs the profile out and forgets it; the folder stays on disk. The main profile can't be removed.

## Install

```sh
git clone https://github.com/gabriel-mend/herdr-claude-accounts ~/.config/herdr-app/mods/claude-accounts
herdr-app check ~/.config/herdr-app/mods/claude-accounts
```

Add it as a block in a personal layout:

```json
{ "id": "claude-accounts", "type": "block", "size": { "px": 150 }, "min": 60, "content": { "mod": "claude-accounts" } }
```

## Notes

- Profiles are stored in `~/.claude/state/herdr-accounts.json`; [herdr-claude-context](https://github.com/gabriel-mend/herdr-claude-context) and [herdr-claude-plan-usage](https://github.com/gabriel-mend/herdr-claude-plan-usage) read it.
- New profiles start empty (no history, `CLAUDE.md`, MCP servers or skills of the main profile) and get the plan-usage `statusLine` automatically.
- Agents started in a plain terminal use the main profile. Signing out of the main account breaks its already-open agents.
