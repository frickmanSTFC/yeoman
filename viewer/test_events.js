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

console.log("events rules OK");
