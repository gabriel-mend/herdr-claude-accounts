import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, theme, appHome, checking, run, props, layout, shared, setShared } from "herdr";

// Minimizing shrinks this mod's own layout block down to its header.
const MOD = "claude-accounts";
const MINIMIZED = 42; // header height plus the top border
function ownBlock(node) {
  if (node?.content?.mod === MOD && !node.content.props?.badge) return node;
  for (const child of node?.children ?? []) {
    const found = ownBlock(child);
    if (found) return found;
  }
  return null;
}
const isMinimized = (block) => block?.size?.px != null && block.size.px <= MINIMIZED;

export default class ClaudeAccounts extends View {
  init(_props, cx) {
    this.accounts = [];
    this.active = "default";
    this.confirmOut = null;
    this.hovered = null;
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

  // Square initial, like the Spaces list: same size, radius and colors.
  avatar(a) {
    const MARK = ["#22a99a", "#e3814f", "#5b8def", "#8b7cf6", "#3fae6a", "#d9649a"];
    const label = (a.display || a.email || a.name || "?").trim();
    let h = 0;
    for (const ch of a.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h_flex().size(18).flex_none().rounded(5).bg(MARK[h % MARK.length]).items_center().justify_center()
      .child(div().text_size(10.5).font_bold().text_color("#ffffff").child(label[0].toUpperCase()));
  }

  // Compact "active account" indicator, for the top bar (block props: { "badge": true }).
  badgeView(t) {
    const a = this.accounts.find((x) => x.id === this.active);
    return h_flex().size_full().px(12).gap(7).items_center().justify_end().bg(t.chrome).border_b(1).border_color(t.border)
      .when(!!a, (el) => el.child(this.avatar(a))
        .child(div().min_w(0).truncate().text_size(12).text_color(t.muted).child(a.email || `${a.name} · not signed in`)));
  }

  // Buttons that destroy something ask for a second click within 4s.
  confirm(a, kind, args, cx) {
    const c = this.confirmOut;
    if (c && c.id === a.id && c.kind === kind && Date.now() - c.at < 4000) {
      this.confirmOut = null;
      this.acct(args, cx);
      return;
    }
    this.confirmOut = { id: a.id, kind, at: Date.now() };
    cx.notify();
    cx.spawn(async (cx) => { await new Promise((r) => setTimeout(r, 4000)); cx.notify(); });
  }

  accountsView(t, cx) {
    // A row action; its click never also selects the row.
    const action = (id, label, color, onClick) =>
      h_flex().id(id).flex_none().h(18).px(6).rounded(5).items_center().bg(t.raised)
        .text_size(10.5).font_semibold().text_color(color).cursor_pointer()
        .hover((st) => st.bg(t.hover).text_color(t.foreground))
        .on_click((e, cx) => { cx.stop_propagation(); onClick(e, cx); })
        .child(label);
    const row = (a) => {
      const on = a.id === this.active;
      const signed = !!a.email;
      const c = this.confirmOut;
      const sure = (kind) => !!c && c.id === a.id && c.kind === kind && Date.now() - c.at < 4000;
      // Like the agent list's pin, actions show on hover (and while confirming).
      const open = this.hovered === a.id || sure("out") || sure("rm");
      return h_flex().id(`a-${a.id}`).flex_none().h(30).px(8).gap(9).rounded(8).items_center().cursor_pointer()
        .when(on, (el) => el.bg(t.selected))
        .hover((st) => st.bg(t.hover))
        .on_hover((over, cx) => {
          if (over) this.hovered = a.id;
          else if (this.hovered === a.id) this.hovered = null;
          cx.notify();
        })
        .on_click((_e, cx) => { this.active = a.id; cx.notify(); this.acct(["set-active", a.id], cx); })
        .tooltip(a.email || "Not signed in")
        .child(this.avatar(a))
        .child(div().flex_1().min_w(0).truncate().text_color(on ? t.foreground : t.muted)
          .child(open ? a.name : a.email || a.name))
        .when(!signed, (el) => el.child(action(`i-${a.id}`, "sign in", t.muted, () => this.launch(a, true))))
        .when(open && signed, (el) => el
          .child(action(`n-${a.id}`, "new agent", t.muted, () => this.launch(a, false)))
          .child(action(`o-${a.id}`, sure("out") ? "confirm?" : "sign out", sure("out") ? t.working : t.muted,
            (_e, cx) => this.confirm(a, "out", ["logout", a.id], cx))))
        .when(open && a.id !== "default", (el) => el
          .child(action(`r-${a.id}`, sure("rm") ? "confirm?" : "remove", sure("rm") ? t.working : t.muted,
            (_e, cx) => this.confirm(a, "rm", ["remove", a.id], cx))));
    };
    return v_flex().size_full().min_h(0)
      .child(h_flex().px(16).pr(10).h(41).pt(14).pb(5).flex_none().items_center().justify_between()
        .child(div().text_size(11.5).font_medium().text_color(t.dim).child("Accounts"))
        .child(h_flex().items_center()
        .child(div().id("a-add").size(26).flex_none().flex().items_center().justify_center().rounded(6)
            .text_color(t.dim).cursor_pointer().hover((st) => st.bg(t.hover).text_color(t.foreground))
            .tooltip("Add account")
            .on_click((_e, cx) => this.acct(["add"], cx, (a) => this.launch(a, true)))
            .child(svg("mods/workspace-chrome/plus.svg").size(14)))
          .child(this.minimizeButton(t))))
      .when(!isMinimized(ownBlock(layout())), (el) => el.child(v_flex().id("a-list").flex_1().min_h(0).px(8).gap(2).overflow_y_scrollbar().children(this.accounts.map(row))));
  }

  toggleMinimized(cx) {
    const block = ownBlock(layout());
    if (!block) return;
    if (isMinimized(block)) {
      run("layout.resize", { id: block.id, ...(shared(MOD + ".size") ?? { px: 150 }) });
    } else {
      setShared(MOD + ".size", block.size);
      run("layout.resize", { id: block.id, px: MINIMIZED });
    }
    cx.notify();
  }

  // Chevron in the header; absent when the mod isn't a layout block (e.g. opened as an overlay).
  minimizeButton(t) {
    const block = ownBlock(layout());
    const min = isMinimized(block);
    return div().when(!!block, (el) => el.child(div().id("minimize").size(26).flex_none().flex().items_center().justify_center().rounded(6)
      .text_color(t.dim).cursor_pointer().hover((st) => st.bg(t.hover).text_color(t.foreground))
      .tooltip(min ? "Expand" : "Minimize")
      .on_click((_e, cx) => this.toggleMinimized(cx))
      .child(svg(`mods/workspace-chrome/chevron-${min ? "right" : "down"}.svg`).size(14))));
  }

  render(cx) {
    const t = theme();
    if (props()?.badge) return this.badgeView(t);
    return v_flex().size_full().min_h(0).bg(t.chrome).border_t(1).border_color(t.border).text_size(13)
      .child(div().flex_1().min_h(0).child(this.accountsView(t, cx)))
      .when(this.error && !isMinimized(ownBlock(layout())), (el) => el.child(div().px(16).py(4).text_size(11).text_color(t.working).child(this.error)));
  }
}
