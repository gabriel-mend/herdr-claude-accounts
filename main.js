import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, theme, appHome, checking, run, props } from "herdr";

export default class ClaudeAccounts extends View {
  init(_props, cx) {
    this.accounts = [];
    this.active = "default";
    this.confirmOut = null;
    this.error = null;
    if (checking()) return;
    this.refresh(cx);
    cx.timer.every(4000, (cx) => this.refresh(cx));
  }

  refresh(cx) {
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", [appHome() + "/mods/claude-accounts/acct.py", "list"], { timeout: 15000 });
        const j = JSON.parse(r.stdout);
        this.accounts = j.accounts;
        this.active = j.active;
        this.error = r.code === 0 ? null : r.stderr.slice(0, 200);
      } catch (e) {
        this.error = String(e).slice(0, 200);
      }
      cx.notify();
    });
  }

  acct(args, cx, then) {
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", [appHome() + "/mods/claude-accounts/acct.py", ...args], { timeout: 15000 });
        if (r.code !== 0) throw new Error(r.stderr || r.stdout);
        if (then) then(JSON.parse(r.stdout));
      } catch (e) {
        this.error = "account: " + String(e).slice(0, 160);
      }
      this.refresh(cx);
    });
  }

  // Open a new Claude agent logged into that account's profile folder.
  // With login=true, run `claude auth login` first so the browser sign-in starts right away.
  launch(a, login) {
    const cmd = login ? "claude auth login && exec claude" : "exec claude";
    run("tab.new", { name: a.name, argv: ["env", `CLAUDE_CONFIG_DIR=${a.dir}`, "sh", "-lc", cmd] });
  }

  // Colored circle with the account's initial.
  avatar(a, size) {
    const PALETTE = ["#6366f1", "#14b8a6", "#f59e0b", "#ec4899", "#22c55e", "#0ea5e9", "#a855f7", "#ef4444"];
    const label = (a.display || a.email || a.name || "?").trim();
    let h = 0;
    for (const ch of a.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h_flex().w(size).h(size).flex_none().rounded(size / 2).bg(PALETTE[h % PALETTE.length]).items_center().justify_center()
      .child(div().text_size(size < 22 ? 10 : 12).font_semibold().text_color("#ffffff").child(label[0].toUpperCase()));
  }

  // Compact "active account" indicator, for the top bar (block props: { "badge": true }).
  badgeView(t) {
    const a = this.accounts.find((x) => x.id === this.active);
    return h_flex().size_full().px(12).gap(6).items_center().justify_end().bg(t.chrome).border_b(1).border_color(t.border)
      .when(!!a, (el) => el.child(this.avatar(a, 18))
        .child(div().min_w(0).truncate().text_size(12).text_color(t.muted).child(a.email || `${a.name} · not signed in`)));
  }

  accountsView(t, cx) {
    const btn = (id, label, color, onClick) =>
      div().id(id).text_size(11).px(6).py(1).rounded(4).border(1).border_color(t.border)
        .text_color(color).cursor_pointer().hover((st) => st.bg(t.hover)).on_click(onClick).child(label);
    const row = (a) => {
      const on = a.id === this.active;
      const signed = !!a.email;
      const c = this.confirmOut;
      const sure = c && c.id === a.id && c.kind !== "rm" && Date.now() - c.at < 4000;
      const sureRm = c && c.id === a.id && c.kind === "rm" && Date.now() - c.at < 4000;
      return h_flex().gap(8).items_center().px(12).py(4)
        .child(div().id(`a-${a.id}`).cursor_pointer().flex_1().min_w(0)
          .on_click((_e, cx) => { this.active = a.id; cx.notify(); this.acct(["set-active", a.id], cx); })
          .child(h_flex().gap(8).items_center()
            .child(this.avatar(a, 26))
            .child(v_flex().min_w(0)
              .child(h_flex().gap(5).items_center()
                .child(div().text_color(on ? t.foreground : t.muted).truncate().child(a.name))
                .when(on, (el) => el.child(div().w(6).h(6).rounded(3).bg(t.done))))
              .child(div().text_size(11).text_color(t.dim).truncate().child(a.email || "not signed in")))))
        .child(btn(`n-${a.id}`, signed ? "new agent" : "sign in", t.muted, () => this.launch(a, !signed)))
        .when(signed, (el) => el.child(btn(`o-${a.id}`, sure ? "confirm?" : "sign out", sure ? t.working : t.dim, (_e, cx) => {
          if (sure) {
            this.confirmOut = null;
            this.acct(["logout", a.id], cx);
          } else {
            this.confirmOut = { id: a.id, at: Date.now() };
            cx.notify();
            cx.spawn(async (cx) => { await new Promise((r) => setTimeout(r, 4000)); cx.notify(); });
          }
        })))
        .when(a.id !== "default", (el) => el.child(btn(`r-${a.id}`, sureRm ? "confirm?" : "remove", sureRm ? t.working : t.dim, (_e, cx) => {
          if (sureRm) {
            this.confirmOut = null;
            this.acct(["remove", a.id], cx);
          } else {
            this.confirmOut = { id: a.id, at: Date.now(), kind: "rm" };
            cx.notify();
            cx.spawn(async (cx) => { await new Promise((r) => setTimeout(r, 4000)); cx.notify(); });
          }
        })));
    };
    return v_flex().gap(2).py(8)
      .child(div().text_size(11).text_color(t.dim).px(12).pb(2).child("Account"))
      .children(this.accounts.map(row))
      .child(div().id("a-add").cursor_pointer().text_size(11).text_color(t.dim).px(12).py(3)
        .hover((st) => st.text_color(t.foreground))
        .on_click((_e, cx) => this.acct(["add"], cx, (a) => this.launch(a, true)))
        .child("+ add account"));
  }

  render(cx) {
    const t = theme();
    if (props()?.badge) return this.badgeView(t);
    return v_flex().size_full().text_size(13).child(this.accountsView(t, cx))
      .when(this.error, (el) => el.child(div().text_size(11).text_color(t.working).px(12).child(this.error)));
  }
}
