// Self-check for the events state rules. Run: node test_events.js
const assert = require("assert");
const E = require("./events.js");

// claimable beats everything; closed is ended even if complete; complete is done; on the clock is running
assert.strictEqual(E.stateOf({IsClaimable: true, IsClosed: true}), "claim");
assert.strictEqual(E.stateOf({IsClosed: true, IsComplete: true}), "ended");
assert.strictEqual(E.stateOf({IsComplete: true, remaining_s: 500}), "done");
assert.strictEqual(E.stateOf({remaining_s: 500}), "running");
assert.strictEqual(E.stateOf({remaining_s: 0}), "ended");
assert.strictEqual(E.stateOf({}), "ended");

// a goal is done when its counter reaches the target; with no target, only when it is claimable
assert.strictEqual(E.goalDone({cur: 3, target: 3}), true);
assert.strictEqual(E.goalDone({cur: 2, target: 3}), false);
assert.strictEqual(E.goalDone({cur: 0, target: 0, claimable: true}), true);
assert.strictEqual(E.goalDone({cur: 5, target: 0, claimable: false}), false);

// the type tag at the end of the game's name is the kind; the shown name loses it
assert.strictEqual(E.kindOf({name: "Sector Strike - SMS"}), "SMS");
assert.strictEqual(E.kindOf({name: "Interstellar Dominance Meta - SLB"}), "SLB");
assert.strictEqual(E.kindOf({name: "Daily Goal"}), "");
assert.strictEqual(E.name({name: "Sector Strike - SMS"}), "Sector Strike");
assert.strictEqual(E.pts({points: -2100000000, next: {cur: 2200000000, max: 0}}), 2200000000, "wrapped counter falls back to progress");
assert.strictEqual(E.pts({points: 540, next: {cur: 540, max: 0}}), 540);
// smoke run: render the real file through a fake page, so a broken template dies here, not in the tab
const fs = require("fs");
const real = "C:/Games/Star Trek Fleet Command/Star Trek Fleet Command/default/game/yeoman/community_patch_events.json";
if (fs.existsSync(real)) {
  const el = () => ({innerHTML: "", textContent: "", hidden: true});
  global.document = {getElementById: el, querySelectorAll: () => []};
  E.setData(JSON.parse(fs.readFileSync(real, "utf8")));
  E.render();
}
console.log("events rules OK");
