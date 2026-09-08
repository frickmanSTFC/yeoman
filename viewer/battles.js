// Battles tab: one row per fight, read from the journals the mod saves.
//
// A journal names two sides, "initiator" and "target". Hostiles carry an id like "mar_64" —
// a faction tag and the hostile's level — while a player id is a long random string. That is how
// a side is identified as mine, and where the hostile level comes from.

const BATTLE = (() => {
  const WIN = "var(--gain)", LOSS = "var(--spend)", DRAW = "var(--accent4)";

  const NPC = /^([a-z][a-z0-9]*)_(\d+)$/i;      // e.g. mar_64, fed_38

  let battles = [], players = {}, hulls = {}, specs = {}, names = {entity: {}};
  let rangeDays = 30, sideFilter = "all", meId = null;

  const when = t => new Date(t).toLocaleString(undefined,
    {month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"});

  const compact = v => {
    const a = Math.abs(v), trim = x => x.toFixed(1).replace(/\.0$/, "");
    if (!a) return "";
    if (a >= 1e12) return trim(a / 1e12) + "T";
    if (a >= 1e9)  return trim(a / 1e9) + "B";
    if (a >= 1e6)  return trim(a / 1e6) + "M";
    if (a >= 1e4)  return Math.round(a / 1e3) + "k";
    return Math.round(a).toLocaleString();
  };

  const hullName = id => {
    const h = hulls[String(id)];
    return specs.hull_name?.[String(h?.loca_id)] || h?.name || `Hull ${id}`;
  };
  const officerName = id => specs.officer?.[String(id)] || `#${id}`;
  const systemName = id => names.entity?.[String(id)] || `System ${id}`;

  function npcOf(id) {
    const m = NPC.exec(id || "");
    return m ? {faction: m[1], level: Number(m[2])} : null;
  }

  // My side is whichever one is not an NPC. If both are players, fall back to the id seen most
  // often across all battles — that is me, since I am in every one of my own battles.
  function sides(j) {
    const a = {id: j.initiator_id, fleet: j.a || j.initiator_fleet_data, won: j.initiator_wins};
    const b = {id: j.target_id, fleet: j.b || j.target_fleet_data, won: !j.initiator_wins};
    const aNpc = !!npcOf(a.id), bNpc = !!npcOf(b.id);
    if (aNpc !== bNpc) return aNpc ? {me: b, foe: a} : {me: a, foe: b};
    return a.id === meId ? {me: a, foe: b} : {me: b, foe: a};
  }

  // Same shape as the Fleets tab: captain and the two bridge seats on the first line,
  // below deck underneath. Hostiles report an empty object here, and a player's list can
  // carry empty slots.
  function crewOf(fleet) {
    const bo = (fleet?.bridge_officers || []).filter?.(Boolean) || [];
    if (!bo.length) return "";
    const pill = (o, cls) => `<span class="pill ${cls}">${officerName(o.id)}`
      + ` <small>${o.level ?? "?"}/${o.rank ?? "?"}</small></span>`;
    const bridge = bo.slice(0, 3).map((o, i) => pill(o, i === 0 ? "captain" : "")).join("");
    const below = bo.slice(3).map(o => pill(o, "")).join("");
    return `<div>${bridge}</div>` + (below ? `<div class="below">${below}</div>` : "");
  }

  // How much of the ship was left standing. Shields can start above their listed maximum, so the
  // reading is against what the ship went in with, not against the max.
  function condition(fleet) {
    const sum = a => (a || []).reduce((t, v) => t + (Number(v) || 0), 0);
    const h0 = sum(fleet?.initial_ship_hps), h1 = sum(fleet?.final_ship_hps);
    const s0 = sum(fleet?.initial_ship_shps), s1 = sum(fleet?.final_ship_shps);
    if (!h0 && !s0) return "";
    const pct = (a, b) => b > 0 ? Math.max(0, Math.round(100 * a / b)) : 0;
    const bar = (a, b, cls) => `<span class="bar ${cls}"><i style="width:${pct(a, b)}%"></i></span>`;
    const parts = [];
    if (h0) parts.push(`<div>hull ${pct(h1, h0)}%${bar(h1, h0, "hp")}</div>`);
    if (s0) parts.push(`<div>shield ${pct(s1, s0)}%${bar(s1, s0, "sh")}</div>`);
    return `<div class="dim cond">${parts.join("")}</div>`;
  }

  function shipsOf(fleet) {
    const ids = (fleet?.hull_ids || []).filter(Boolean), lv = fleet?.initial_ship_levels || [];
    return ids.map((h, i) => `${hullName(h)}${lv[i] ? ` <small class="dim">L${lv[i]}</small>` : ""}`).join(", ");
  }

  // The prefix on a hostile id is the same word on every hostile ("mar"), so it carries no
  // information and is not the faction. The faction lives in faction_id, which needs the game to
  // resolve it, so it is left out rather than shown as a number.
  function foeLabel(foe) {
    const npc = npcOf(foe.id);
    if (!npc) return players?.[foe.id]?.name || "player";
    const faction = specs.faction?.[String(foe.fleet?.faction_id)];
    return `<span class="tag">${faction || "Hostile"}</span> level ${npc.level}`;
  }

  // The journal's "wins" flag does not mean a kill. Some fights (battle type 15 here) run their
  // rounds and stop with the target still alive, yet still come back flagged as won. So the result
  // is read from the wreckage instead: who, if anyone, ended on zero hull.
  const totalHp = a => (a || []).reduce((t, v) => t + (Number(v) || 0), 0);

  // battle_duration is 5 on every journal, so it is not a round count and is not shown. The real
  // blow-by-blow lives in battle_log as a packed list of raw numbers, which is not decoded here.
  // Damage is the hull actually taken off the other side.
  function damageDealt(foe) {
    return totalHp(foe.fleet?.initial_ship_hps) - totalHp(foe.fleet?.final_ship_hps);
  }

  function outcome(me, foe) {
    const foeDead = totalHp(foe.fleet?.initial_ship_hps) > 0 && totalHp(foe.fleet?.final_ship_hps) === 0;
    const meDead = totalHp(me.fleet?.initial_ship_hps) > 0 && totalHp(me.fleet?.final_ship_hps) === 0;
    if (foeDead) return {label: "kill", colour: WIN, kind: "kill"};
    if (meDead) return {label: "ship lost", colour: LOSS, kind: "loss"};
    return {label: "no kill", colour: DRAW, kind: "nokill"};
  }

  function render() {
    const cut = Date.now() - rangeDays * 86400000;
    const rows = [];
    const tally = {kill: 0, loss: 0, nokill: 0};

    for (const j of battles) {
      const t = Date.parse(j.battle_time + "Z");
      if (!(t >= cut)) continue;
      const {me, foe} = sides(j);
      const isNpc = !!npcOf(foe.id);
      if (sideFilter === "hostiles" && !isNpc) continue;
      if (sideFilter === "players" && isNpc) continue;
      const out = outcome(me, foe);
      tally[out.kind]++;
      rows.push({t, j, me, foe, out});
    }
    rows.sort((a, b) => b.t - a.t);

    document.getElementById("batStats").innerHTML = `
      <div class="tile"><span>battles in range</span><b>${rows.length}</b></div>
      <div class="tile"><span>kills</span><b style="color:${WIN}">${tally.kill}</b></div>
      <div class="tile"><span>ships lost</span><b style="color:${LOSS}">${tally.loss}</b></div>
      <div class="tile"><span>no kill</span><b style="color:${DRAW}">${tally.nokill}</b></div>
      <div class="tile"><span>journals saved</span><b>${battles.length}</b></div>`;

    document.getElementById("batBody").innerHTML = rows.length
      ? rows.slice(0, 300).map(r => `<tr data-id="${r.j.id}">
          <td><a href="/battle/${r.j.id}.json" target="_blank" title="open the raw journal">${when(r.t)}</a></td>
          <td>${systemName(r.j.system_id)}</td>
          <td class="wrap">${shipsOf(r.me.fleet)}${condition(r.me.fleet)}</td>
          <td class="wrap">${crewOf(r.me.fleet)}</td>
          <td class="wrap">${foeLabel(r.foe)}<div class="dim">${shipsOf(r.foe.fleet)}</div>
              ${condition(r.foe.fleet)}</td>
          <td><span class="chip ${r.out.kind}">${r.out.label}</span></td>
          <td class="num">${compact(damageDealt(r.foe))}</td>
        </tr>`).join("")
      : `<tr><td colspan="7" class="dim">no battles in this range — open Battle Logs in the game
           to pull them across, then hit refresh</td></tr>`;
  }

  async function load() {
    const st = document.getElementById("batStatus");
    st.textContent = "reading battle journals…";
    const get = (u, d) => fetch(u, {cache: "no-store"}).then(r => r.ok ? r.json() : d).catch(() => d);
    try {
      const [sum, hl, sp, nm] = await Promise.all([
        get("/battles_summary.json", {battles: [], players: {}}),
        get("/hulls.json", {}), get("/specs.json", {}), get("/names.json", {entity: {}}),
      ]);
      hulls = hl || {}; specs = sp || {}; names = nm || {entity: {}};
      battles = sum.battles || []; players = sum.players || {};

      // whoever appears in every battle is me
      const seen = new Map();
      for (const j of battles) {
        for (const s of [j.initiator_id, j.target_id]) seen.set(s, (seen.get(s) || 0) + 1);
      }
      meId = [...seen.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      st.textContent = `${battles.length} battles · ${Object.keys(specs.officer || {}).length} officer names`
        + (Object.keys(specs.officer || {}).length ? "" : " · officer names arrive after the next game restart");
      render();
    } catch (e) {
      st.textContent = "could not read the battle journals (" + e.message + ")";
    }
  }

  function init() {
    document.getElementById("batRange").onchange = e => { rangeDays = Number(e.target.value); render(); };
    document.getElementById("batSide").onchange = e => { sideFilter = e.target.value; render(); };
    document.getElementById("batReload").onclick = load;
  }

  return {init, load, sides, npcOf, outcome, damageDealt, setData: b => { battles = b; }};
})();

if (typeof module !== "undefined") module.exports = BATTLE;   // for test_battles.js
