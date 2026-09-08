// Self-check for the battle side/level reading. Run: node test_battles.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const BATTLE = require("./battles.js");

// hostile ids carry the level; player ids do not
assert.deepStrictEqual(BATTLE.npcOf("mar_64"), {faction: "mar", level: 64});
assert.strictEqual(BATTLE.npcOf("j91150ac6f2a4a7e85ad1ecf192937df"), null);

// the non-hostile side is mine, whichever way round the fight started
const npcStarted = {
  initiator_id: "mar_64", target_id: "player1", initiator_wins: false,
  initiator_fleet_data: {tag: "npc"}, target_fleet_data: {tag: "mine"},
};
let s = BATTLE.sides(npcStarted);
assert.strictEqual(s.me.fleet.tag, "mine", "attacked by a hostile: I am the target");
assert.strictEqual(s.me.won, true, "initiator lost, so I won");

const iStarted = {
  initiator_id: "player1", target_id: "fed_38", initiator_wins: true,
  initiator_fleet_data: {tag: "mine"}, target_fleet_data: {tag: "npc"},
};
s = BATTLE.sides(iStarted);
assert.strictEqual(s.me.fleet.tag, "mine", "I attacked: I am the initiator");
assert.strictEqual(s.me.won, true);
assert.deepStrictEqual(BATTLE.npcOf(s.foe.id), {faction: "fed", level: 38});

// the result is read from the wreckage, not from the journal's "wins" flag
const dead = {initial_ship_hps: [100], final_ship_hps: [0]};
const hurt = {initial_ship_hps: [100], final_ship_hps: [30]};
const fine = {initial_ship_hps: [100], final_ship_hps: [100]};
assert.strictEqual(BATTLE.outcome({fleet: fine}, {fleet: dead}).label, "kill");
assert.strictEqual(BATTLE.outcome({fleet: dead}, {fleet: hurt}).label, "ship lost");
assert.strictEqual(BATTLE.outcome({fleet: fine}, {fleet: hurt}).label, "no kill",
  "a fight that ends with the target alive is not a kill, whatever the flag says");

// damage is the hull actually removed from the other side
assert.strictEqual(BATTLE.damageDealt({fleet: {initial_ship_hps: [100], final_ship_hps: [30]}}), 70);
assert.strictEqual(BATTLE.damageDealt({fleet: {initial_ship_hps: [100], final_ship_hps: [100]}}), 0);

// smoke run over the real journals, if any have been saved
const DIR = "C:\\Games\\Star Trek Fleet Command\\Star Trek Fleet Command\\default\\game\\battles";
if (fs.existsSync(DIR)) {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith(".json")).slice(0, 40);
  let hostile = 0, pvp = 0, won = 0;
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")).journal;
    const {me, foe} = BATTLE.sides(j);
    assert.ok(me.fleet && foe.fleet, `${f}: both sides resolved`);
    BATTLE.npcOf(foe.id) ? hostile++ : pvp++;
    if (BATTLE.outcome(me, foe).kind === "kill") won++;
  }
  console.log(`real journals: ${files.length} read, ${hostile} vs hostiles, ${pvp} vs players, ${won} kills`);
}

console.log("battle reading OK");
