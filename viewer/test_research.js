// Self-check for the research status maths. Run: node test_research.js
const assert = require("assert");
const R = require("./research.js");

// two projects: 10 needs building 5 at level 3 then research 20 at level 1; 20 has one level, no needs
R.setCatalogue({
  projects: {
    10: {name: "Beam Focus", tree: 1, levels: [{req: [[1, 5, 3]], cost: [], time: 60}, {req: [[2, 20, 1]], cost: [], time: 60}]},
    20: {name: "Hull Plating", tree: 1, levels: [{req: [], cost: [], time: 60}]},
  },
  trees: {1: {name: "Combat", type: 0, projects: [10, 20]}},
});
R.setSpecs({building: {5: {name: "Operations"}}, research: {}});

// nothing known: 10 is locked on Operations 3, 20 is available
R.setLevels({research: new Map(), building: new Map()});
assert.strictEqual(R.status("10").state, "locked");
assert.deepStrictEqual(R.status("10").blockers, ["Operations 3"]);
assert.strictEqual(R.status("20").state, "available");

// Operations at 3: level 1 of 10 opens up
R.setLevels({research: new Map(), building: new Map([[5, 3]])});
assert.strictEqual(R.status("10").state, "available");

// 10 at level 1 now needs research 20 at 1; once 20 is done, 10's last level opens; then 10 is done
R.setLevels({research: new Map([[10, 1]]), building: new Map([[5, 3]])});
assert.deepStrictEqual(R.status("10").blockers, ["Hull Plating 1"]);
R.setLevels({research: new Map([[10, 1], [20, 1]]), building: new Map([[5, 3]])});
assert.strictEqual(R.status("10").state, "available");
assert.strictEqual(R.status("20").state, "done");
R.setLevels({research: new Map([[10, 2], [20, 1]]), building: new Map([[5, 3]])});
assert.deepStrictEqual(R.status("10"), {cur: 2, max: 2, state: "done", next: null, blockers: []});

// the milestones log: the last line for an id wins
const lv = R.latestLevels('{"kind":"research","id":10,"t":1,"v":1}\n{"kind":"research","id":10,"t":2,"v":2}\n{"kind":"building","id":5,"t":2,"v":9}\n');
assert.strictEqual(lv.research.get(10), 2);
assert.strictEqual(lv.building.get(5), 9);

assert.strictEqual(R.fixName("6⇵ Offensive Explorers"), "G6 Offensive Explorers", "grade glyph becomes G6");
assert.strictEqual(R.fixName("3⇴ Isogen Extraction"), "T3 Isogen Extraction", "isogen tier glyph becomes T3");
assert.strictEqual(R.isReal({levels: [{req: [], cost: [], time: 0}]}), false, "a free instant one-level node is a flag, not research");
assert.strictEqual(R.isReal({levels: [{req: [], cost: [[1, 5]], time: 0}]}), true, "anything with a cost is real");
console.log("research maths OK");
