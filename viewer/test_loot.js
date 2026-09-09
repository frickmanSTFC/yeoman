// Self-check for the loot maths. Run: node test_loot.js
// Uses hand-made rows (the assertions) and then the real log if it is there (a smoke run).
const assert = require("assert");
const fs = require("fs");
const LOOT = require("./loot.js");

const DAY = 86400;
const noon = k => Math.floor(new Date(k + "T12:00:00").getTime() / 1000);

// two days, one resource: first sighting is a baseline, then +500, then -200, then +100 next day
LOOT.setRows([
  {t: noon("2026-09-01"), src: "base", id: 7, v: 1000},
  {t: noon("2026-09-01"), src: "full", id: 7, v: 1500},
  {t: noon("2026-09-01"), src: "full", id: 7, v: 1300},
  {t: noon("2026-09-02"), src: "base", id: 7, v: 1400},
]);
let days = LOOT.aggregate();
assert.strictEqual(days.size, 2, "two days");
assert.deepStrictEqual(days.get("2026-09-01").get(7), {g: 500, s: 200}, "day 1 gain/spend split");
assert.deepStrictEqual(days.get("2026-09-02").get(7), {g: 100, s: 0}, "offline gain across a re-login");

// a resource seen only once contributes nothing at all
LOOT.setRows([{t: noon("2026-09-01"), src: "base", id: 9, v: 42}]);
assert.strictEqual(LOOT.aggregate().size, 0, "baseline alone is not loot");

// dayList fills the gaps between recorded days
LOOT.setRows([
  {t: noon("2026-09-01"), id: 1, v: 0},
  {t: noon("2026-09-01"), id: 1, v: 5},
  {t: noon("2026-09-03"), id: 1, v: 9},
]);
const keys = LOOT.dayList(LOOT.aggregate(), "all");
assert.ok(keys.includes("2026-09-02"), "empty day still gets a column");
assert.deepStrictEqual([...keys].sort(), keys, "days come out in order");

// peak held per day is the largest reading that day, not the last one
LOOT.setRows([
  {t: noon("2026-09-01"), id: 3, v: 100},
  {t: noon("2026-09-01") + 60, id: 3, v: 900},
  {t: noon("2026-09-01") + 120, id: 3, v: 400},
  {t: noon("2026-09-02"), id: 3, v: 50},
]);
let peaks = LOOT.peakByDay();
assert.strictEqual(peaks.get("2026-09-01").get(3), 900, "the day's high, not its close");
assert.strictEqual(peaks.get("2026-09-02").get(3), 50);

assert.strictEqual(LOOT.compact(1234), "1,234");
assert.strictEqual(LOOT.compact(12345), "12k");
assert.strictEqual(LOOT.compact(2500000), "2.5M");
assert.strictEqual(LOOT.compact(-3e9), "-3B");

// Reputation tab: only the game's "Faction points" type (subtype 7), biggest standing first,
// and a faction that never moved is still listed as long as it holds points
LOOT.setSpecs({1: {subtype: 7, pretty: "Klingon Points"}, 2: {subtype: 7, pretty: "Gorn Points"},
               3: {subtype: 3, pretty: "Ore"}, 4: {subtype: 7, pretty: "Vulcan Points"}});
LOOT.setRows([
  {t: noon("2026-09-01"), id: 1, v: 100}, {t: noon("2026-09-02"), id: 1, v: 150},
  {t: noon("2026-09-01"), id: 2, v: 900},
  {t: noon("2026-09-01"), id: 3, v: 5000}, {t: noon("2026-09-02"), id: 3, v: 6000},
  {t: noon("2026-09-01"), id: 4, v: 0},
]);
assert.deepStrictEqual(LOOT.repIds(LOOT.stock()), [2, 1], "factions only, by standing, zero standing left out");
LOOT.setSpecs({});

// smoke run over the real log, if the game has written one
const REAL = "C:\\Games\\Star Trek Fleet Command\\Star Trek Fleet Command\\default\\game\\community_patch_loot.jsonl";
if (fs.existsSync(REAL)) {
  const rows = fs.readFileSync(REAL, "utf8").split("\n").filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  LOOT.setRows(rows);
  days = LOOT.aggregate();
  let g = 0, s = 0, n = 0;
  for (const m of days.values()) for (const e of m.values()) { g += e.g; s += e.s; n++; }
  console.log(`real log: ${rows.length} rows, ${days.size} day(s), ${n} resource-days, ` +
              `${g.toLocaleString()} gained, ${s.toLocaleString()} spent`);
  assert.ok(days.size > 0, "real log produced no days");
}

// --- grouping ---------------------------------------------------------------
// grade and family come out of the internal name; higher grade sorts first, Epic before Common
LOOT.setSpecs({
  1: {name: "Resource_G4_Ore_R2",       grade: 4, rarity: 2, subtype: 4},
  2: {name: "Resource_G7_Ore_R4",       grade: 7, rarity: 4, subtype: 4},
  3: {name: "Resource_G7_Ore_R1",       grade: 7, rarity: 1, subtype: 4},
  4: {name: "Resource_G7_Hydrocarbon_Raw", grade: 7, rarity: 1, subtype: 3},
  5: {name: "Parsteel",                 grade: 0, rarity: 1, subtype: 1},
  6: {name: "Resource_G7_Ore_Raw",      grade: 7, rarity: 1, subtype: 3},
});
assert.strictEqual(LOOT.groupOf(1), "Ore");
assert.strictEqual(LOOT.groupOf(4), "Gas", "raw shares the material's heading, and gas is called gas");
assert.strictEqual(LOOT.groupOf(6), "Ore", "raw ore is not its own section");
assert.strictEqual(LOOT.groupOf(5), "Currency", "ungraded falls back to the game's category");

const order = LOOT.orderForTest([1, 2, 3, 4, 5, 6]);
assert.deepStrictEqual(order.map(LOOT.groupOf),
  ["Gas", "Ore", "Ore", "Ore", "Ore", "Currency"],
  "one heading per material, ungraded last");
assert.deepStrictEqual([order[1], order[2], order[3], order[4]], [2, 3, 1, 6],
  "inside a material: 7★ before 4★, Epic before Common, and raw under the lot");

// --- speed ups --------------------------------------------------------------
// The Sigma marker and the kind both come from the name the game itself shows.
LOOT.setSpecs({
  10: {name: "Resource_SpeedUp3d_T2",        pretty: "3 Day \u03a3-Speed Up",           subtype: 8},
  11: {name: "Resource_SpeedUp1m_T2",        pretty: "1 Minute \u03a3-Speed Up",        subtype: 8},
  12: {name: "Resource_SpeedUp1d_Repair_T2", pretty: "1 Day \u03a3-Repair Speed Up",    subtype: 8},
  13: {name: "Resource_Resource_SpeedUp_2d", pretty: "2 Day Speed Up",                  subtype: 8},
  14: {name: "Resource_Resource_Repair_5h",  pretty: "5 Hour Repair Speed Up",          subtype: 8},
  15: {name: "ASB 1 Day Speedup",            pretty: "1 Day Alliance Speedup",          subtype: 8},
  16: {name: "Resource_Resource_AwayAssignment_1h_T2", pretty: "1 Hour \u03a3-Assignment Speed Up", subtype: 8},
});
assert.strictEqual(LOOT.groupOf(10), "\u03a3 Speed Ups");
assert.strictEqual(LOOT.groupOf(12), "\u03a3 Repair Speed Ups");
assert.strictEqual(LOOT.groupOf(15), "Alliance Speed Ups", "no Sigma version, so no Sigma heading");

assert.deepStrictEqual(LOOT.orderForTest([11, 15, 14, 13, 12, 16, 10]).map(LOOT.groupOf), [
  "\u03a3 Speed Ups", "\u03a3 Speed Ups", "\u03a3 Repair Speed Ups", "\u03a3 Assignment Speed Ups",
  "Speed Ups", "Repair Speed Ups", "Alliance Speed Ups",
], "every Sigma group first, then every normal one");
assert.deepStrictEqual(LOOT.orderForTest([11, 10]), [10, 11], "3 Day beats 1 Minute");

// the same rules over the game's real 84 speed ups, if the file is there
const RES = "C:/Games/Star Trek Fleet Command/Star Trek Fleet Command/default/game/community_patch_resources.json";
if (fs.existsSync(RES)) {
  const all = JSON.parse(fs.readFileSync(RES, "utf8"));
  const speed = Object.keys(all).filter(k => all[k].subtype === 8);
  LOOT.setSpecs(all);
  const heads = [];
  for (const id of LOOT.orderForTest(speed)) {
    const g = LOOT.groupOf(id);
    if (g !== heads[heads.length - 1]) heads.push(g);
  }
  assert.deepStrictEqual(heads, [
    "\u03a3 Speed Ups", "\u03a3 Repair Speed Ups", "\u03a3 Assignment Speed Ups",
    "Speed Ups", "Repair Speed Ups", "Assignment Speed Ups", "Alliance Speed Ups",
  ], "real speed ups fall into seven groups, in order, with no group appearing twice");
  console.log(`real speed ups: ${speed.length} across ${heads.length} groups`);
}

// group totals: how many days of speed up you are holding
LOOT.setSpecs({
  1:  {name: "Resource_G4_Ore_R2",     pretty: "4 Ore",                 grade: 4, rarity: 2, subtype: 4},
  2:  {name: "Resource_G7_Ore_R4",     pretty: "7 Ore",                 grade: 7, rarity: 4, subtype: 4},
  10: {name: "Resource_SpeedUp3d_T2",  pretty: "3 Day Σ-Speed Up",    subtype: 8},
  11: {name: "Resource_SpeedUp1m_T2",  pretty: "1 Minute Σ-Speed Up", subtype: 8},
  13: {name: "Resource_Resource_SpeedUp_2d", pretty: "2 Day Speed Up",  subtype: 8},
});
const held = new Map([[10, 2], [11, 5], [13, 1]]);   // 2x 3-day sigma, 5x 1-minute sigma, 1x 2-day
assert.strictEqual(LOOT.groupDays([10, 11], held), (2 * 3 * 86400 + 5 * 60) / 86400);
assert.strictEqual(LOOT.groupDays([13], held), 2, "one 2 Day speed up is two days");
assert.strictEqual(LOOT.groupDays([1, 2], held), null, "not speed ups, so no day total");
assert.strictEqual(LOOT.daysLabel(2.5), "2.5 days");
assert.strictEqual(LOOT.daysLabel(0.25), "6.0 hours", "under a day reads in hours");

// inside any group, Sigma comes first, then the usual order
LOOT.setSpecs({
  20: {name: "Parsteel",   pretty: "Parsteel",   subtype: 1},
  21: {name: "Tritanium",  pretty: "Tritanium",  subtype: 1},
  22: {name: "ParsteelT2", pretty: "Σ-Parsteel", subtype: 1},
  23: {name: "DilithiumT2", pretty: "Σ-Dilithium", subtype: 1},
});
const cur = LOOT.orderForTest([20, 21, 22, 23]);
assert.deepStrictEqual(cur.slice(0, 2).sort(), [22, 23], "both Sigma currencies lead the Currency group");
assert.deepStrictEqual(cur.slice(2).sort(), [20, 21]);

console.log("loot maths OK");
