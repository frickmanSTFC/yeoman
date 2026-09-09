// Self-check for the events state rules. Run: node test_events.js
const assert = require("assert");
const E = require("./events.js");

// a tier ready to collect beats everything: that is a claim waiting
assert.strictEqual(E.stateOf({IsCurrentlyActive: true, tiers: [{state: 3}, {state: 2}]}), "claim");
assert.strictEqual(E.stateOf({IsClaimable: true, IsClosed: true}), "claim");
// closed or archived is ended, even if it says complete
assert.strictEqual(E.stateOf({IsClosed: true, IsComplete: true}), "ended");
assert.strictEqual(E.stateOf({IsComplete: true, IsCurrentlyActive: true}), "done");
assert.strictEqual(E.stateOf({IsCurrentlyActive: true}), "running");
assert.strictEqual(E.stateOf({}), "ended");

// a goal is done when its counter reaches the target; with no target, only when it is claimable
assert.strictEqual(E.goalDone({cur: 3, target: 3}), true);
assert.strictEqual(E.goalDone({cur: 2, target: 3}), false);
assert.strictEqual(E.goalDone({cur: 0, target: 0, claimable: true}), true);
assert.strictEqual(E.goalDone({cur: 5, target: 0, claimable: false}), false);

console.log("events rules OK");
