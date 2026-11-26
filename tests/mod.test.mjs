import test from "node:test";
import assert from "node:assert/strict";
import { fake, reset, mount, find, text } from "./harness.mjs";

const accounts = [
  { id: "default", name: "Main", dir: "/h/.claude", email: "main@example.com" },
  { id: "acct2", name: "Account 2", dir: "/h/.claude-acct2", email: "two@example.com" },
  { id: "acct3", name: "Account 3", dir: "/h/.claude-acct3", email: null },
];

async function setup(hovered = null) {
  reset();
  const m = await mount();
  m.view.accounts = accounts;
  m.view.hovered = hovered;
  return m;
}
const click = (m, id) => find(m.view.render(m.cx), id).click({}, m.cx);
// acct() runs inside cx.spawn: run the queued tasks and return the acct.py arguments.
async function acctCalls(m) {
  const first = m.spawned.shift();
  await first(m.cx);
  return fake.calls.filter((c) => c[0] === "exec").map((c) => c[2].slice(1));
}

test("actions are hidden until the row is hovered", async () => {
  const m = await setup();
  assert.equal(find(m.view.render(m.cx), "n-acct2"), null);
  m.view.hovered = "acct2";
  assert.ok(find(m.view.render(m.cx), "n-acct2"));
});

test("the main account cannot be removed", async () => {
  const m = await setup("default");
  assert.equal(find(m.view.render(m.cx), "r-default"), null);
});

test("new agent opens claude in that profile", async () => {
  const m = await setup("acct2");
  click(m, "n-acct2");
  const [, command, args] = fake.calls[0];
  assert.equal(command, "tab.new");
  assert.deepEqual(args.argv, ["env", "CLAUDE_CONFIG_DIR=/h/.claude-acct2", "sh", "-lc", "exec claude"]);
});

test("sign in runs the login first", async () => {
  const m = await setup();
  click(m, "i-acct3");
  assert.equal(fake.calls[0][2].argv.at(-1), "claude auth login && exec claude");
});

for (const [button, command] of [["o-acct2", "logout"], ["r-acct2", "remove"]]) {
  test(`${command} needs a second click`, async () => {
    const m = await setup("acct2");
    click(m, button);
    assert.deepEqual(fake.calls, []);
    assert.match(text(m.view.render(m.cx)), /confirm\?/);
    m.spawned.length = 0; // drop the 4s expiry timer
    click(m, button);
    assert.deepEqual(await acctCalls(m), [[command, "acct2"]]);
  });
}

test("clicking a row makes it the active account", async () => {
  const m = await setup();
  click(m, "a-acct2");
  assert.equal(m.view.active, "acct2");
  assert.deepEqual(await acctCalls(m), [["set-active", "acct2"]]);
});

test("the top bar badge shows the active account", async () => {
  const m = await setup();
  fake.props = { badge: true };
  m.view.active = "acct2";
  const out = text(m.view.render(m.cx));
  assert.match(out, /two@example\.com/);
  assert.doesNotMatch(out, /main@example\.com/);
});

const block = (size) => ({ children: [{ id: "my-block", size, content: { mod: "claude-accounts" } }] });

test("minimize shrinks the block and expand restores its size", async () => {
  reset({ layout: block({ px: 200 }) });
  const { view, cx } = await mount();
  find(view.render(cx), "minimize").click({}, cx);
  assert.deepEqual(fake.calls, [["run", "layout.resize", { id: "my-block", px: 42 }]]);
  fake.calls.length = 0;
  fake.layout = block({ px: 42 });
  find(view.render(cx), "minimize").click({}, cx);
  assert.deepEqual(fake.calls, [["run", "layout.resize", { id: "my-block", px: 200 }]]);
});

test("expand falls back to the default size when none was saved", async () => {
  reset({ layout: block({ px: 42 }) });
  const { view, cx } = await mount();
  find(view.render(cx), "minimize").click({}, cx);
  assert.deepEqual(fake.calls, [["run", "layout.resize", { id: "my-block", ...{ px: 150 } }]]);
});

test("there is no minimize button outside a layout block", async () => {
  reset();
  const { view, cx } = await mount();
  assert.equal(find(view.render(cx), "minimize"), null);
});
