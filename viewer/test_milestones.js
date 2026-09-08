// Self-check for the milestone maths. Run: node test_milestones.js
const assert = require("assert");
const fs = require("fs");
const MILE = require("./milestones.js");

const noon = k => Math.floor(new Date(k + "T12:00:00").getTime() / 1000);

// first reading is a baseline; only later moves are steps
MILE.setRows([
  {t: noon("2026-09-01"), kind: "building", id: 0, v: 69},
  {t: noon("2026-09-02"), kind: "building", id: 0, v: 69},   // unchanged, not a step
  {t: noon("2026-09-03"), kind: "building", id: 0, v: 70},   // the upgrade
  {t: noon("2026-09-01"), kind: "ship_hull", id: 5, v: 900}, // mapping row, never a step
]);
let s = MILE.steps();
assert.strictEqual(s.length, 1, "one step");
assert.deepStrictEqual({kind: s[0].kind, from: s[0].from, to: s[0].to}, {kind: "building", from: 69, to: 70});

// a level that arrives only once is a baseline and nothing else
MILE.setRows([{t: noon("2026-09-01"), kind: "research", id: 7, v: 3}]);
assert.strictEqual(MILE.steps().length, 0, "baseline alone is not a step");

// an upgrade finished while the game was shut still counts, and newest comes first
MILE.setRows([
  {t: noon("2026-09-01"), kind: "research", id: 7, v: 3},
  {t: noon("2026-09-04"), kind: "research", id: 7, v: 5},    // offline jump
  {t: noon("2026-09-05"), kind: "research", id: 7, v: 6},
]);
s = MILE.steps();
assert.strictEqual(s.length, 2);
assert.ok(s[0].t > s[1].t, "newest first");
assert.deepStrictEqual([s[1].from, s[1].to], [3, 5], "offline jump kept whole");

// smoke run over the real log, if there is one
const REAL = "C:\\Games\\Star Trek Fleet Command\\Star Trek Fleet Command\\default\\game\\community_patch_milestones.jsonl";
if (fs.existsSync(REAL)) {
  const rows = fs.readFileSync(REAL, "utf8").split("\n").filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  MILE.setRows(rows);
  const real = MILE.steps();
  const byKind = {};
  for (const r of real) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
  console.log(`real log: ${rows.length} rows -> ${real.length} steps`, byKind);
}

// --- module upgrades and their measured cost --------------------------------
MILE.setRows([
  {t: 1000, kind: "ship_components", id: 5, v: [10, 11, 12]},   // baseline
  {t: 2000, kind: "ship_components", id: 5, v: [10, 99, 12]},   // 11 swapped for 99
]);
let mods = MILE.moduleChanges();
assert.strictEqual(mods.length, 1, "one module change");
assert.deepStrictEqual({ship: mods[0].ship, component: mods[0].component}, {ship: 5, component: 99});

MILE.setRows([{t: 1000, kind: "ship_components", id: 5, v: [1, 2]}]);
assert.strictEqual(MILE.moduleChanges().length, 0, "first fitted list is a baseline");

// fitted-module lines are never timeline steps
MILE.setRows([
  {t: 1000, kind: "ship_components", id: 5, v: [10, 11]},
  {t: 2000, kind: "ship_components", id: 5, v: [10, 99]},
  {t: 2000, kind: "ship_hull", id: 5, v: 900},
  {t: 3000, kind: "building", id: 0, v: 1},
  {t: 4000, kind: "building", id: 0, v: 2},
]);
assert.deepStrictEqual(MILE.steps().map(s => s.kind), ["building"], "only real levels reach the timeline");

// cost = what drained near the upgrade, and only near it
MILE.setLoot([
  {t: 1990, id: 700, v: 1000},        // baseline for this resource
  {t: 1995, id: 700, v: 400},         // -600 inside the window
  {t: 5000, id: 700, v: 100},         // -300 far away, must not count
  {t: 1996, id: 800, v: 50},          // baseline only, no change to price in
]);
const cost = MILE.costOf(2000);
assert.deepStrictEqual(cost, [[700, 600]], "only the spend inside the window counts");
assert.deepStrictEqual(MILE.costOf(100000), [], "nothing near an unrelated time");

console.log("milestone maths OK");
