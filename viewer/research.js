// Research tab: every research project the game has, against what this account has finished.
//
// The catalogue (community_patch_research.json) is what the game's own spec table says: each
// project's tree, its levels, and what every level needs and costs. Your level in each project
// and building comes from the milestones log, so nothing here is guessed: a project is "available"
// only when every building and research requirement for its next level is met right now.

const RESEARCH = (() => {
  let cat = {projects: {}, trees: {}}, levels = {research: new Map(), building: new Map()};
  let specs = {building: {}, research: {}, officer: {}, faction: {}}, resources = {};
  let treeType = "0", search = "", stateFilter = "all";

  const TREE_TYPES = {0: "Standard", 1: "Ship cosmetics", 2: "Faction store", 3: "Fleet commanders",
                      4: "Artifacts", 5: "Challenge"};
  const REQ = {3: "faction rank", 4: "alliance level", 5: "officer rank", 6: "officer level",
               7: "total officer level", 8: "ship tier", 9: "officers at tier", 10: "artifacts at level"};

  const compact = v => {
    const a = Math.abs(v), trim = x => x.toFixed(1).replace(/\.0$/, "");
    if (a >= 1e12) return trim(v / 1e12) + "T";
    if (a >= 1e9)  return trim(v / 1e9) + "B";
    if (a >= 1e6)  return trim(v / 1e6) + "M";
    if (a >= 1e4)  return Math.round(v / 1e3) + "k";
    return Math.round(v).toLocaleString();
  };
  const dur = s => s >= 86400 ? `${(s / 86400).toFixed(1)}d` : s >= 3600 ? `${(s / 3600).toFixed(1)}h` : `${Math.round(s / 60)}m`;

  // "6⇵ Explorer Casing" is "G6 Explorer Casing" in the game: ⇵ is its grade icon, drawn with a
  // picture font we do not have. ⇴ is the Isogen tier icon; ▷ and ▶ read fine as they are.
  const fixName = n => (n || "").replace(/(\d)⇵/g, "G$1").replace(/(\d)⇴/g, "T$1");
  const projName = id => fixName(cat.projects[id]?.name || specs.research?.[id]?.pretty) || `Research ${id}`;
  const bldName = id => specs.building?.[id]?.name || `Building ${id}`;
  const resName = id => resources[id]?.pretty || resources[id]?.name || `#${id}`;
  // fleet commander trees are named after the commander (an officer); faction store trees after the faction
  // a project with one level that costs nothing, takes no time and needs nothing is a flag the game
  // keeps for itself (store unlocks, challenge markers), not research anyone can do
  const isReal = p => (p.levels || []).some(l => l.time || (l.cost || []).length || (l.req || []).length);
  const realIds = t => (t.projects || []).map(String).filter(pid => cat.projects[pid] && isReal(cat.projects[pid]));

  const treeName = id => {
    const t = cat.trees[id] || {};
    const known = realIds(t).length;
    if (t.officer && specs.officer?.[t.officer]) return specs.officer[t.officer];
    if (t.type === 2 && t.faction > 0 && specs.faction?.[t.faction]) return `${specs.faction[t.faction]} store`;
    return t.name || `Tree ${id} · ${known} projects`;
  };

  // --- the core question: for one project, where does it stand? ------------------------------
  // returns {cur, max, state: done|available|locked, next: level spec or null, blockers: [text]}
  function status(id) {
    const p = cat.projects[id];
    if (!p) return null;
    const cur = levels.research.get(Number(id)) ?? 0;
    const max = p.levels.length;
    if (cur >= max) return {cur, max, state: "done", next: null, blockers: []};
    const next = p.levels[cur];                     // levels[i] is what it takes to reach level i+1
    const blockers = [];
    for (const [type, target, lvl] of next.req || []) {
      if (type === 1 && (levels.building.get(target) ?? 0) < lvl) blockers.push(`${bldName(target)} ${lvl}`);
      if (type === 2 && (levels.research.get(target) ?? 0) < lvl) blockers.push(`${projName(target)} ${lvl}`);
      // other kinds (faction rank, officer rank, ship tier...) are in no log; shown as a note only
    }
    return {cur, max, state: blockers.length ? "locked" : "available", next, blockers};
  }

  // requirement kinds no log covers: shown as a note, never treated as a blocker
  const notes = next => (next?.req || []).filter(([t]) => REQ[t])
    .map(([t, , l]) => REQ[t] + (l < 100000 ? ` ${l}` : "")).join(", ");   // a huge "level" is an id, not a rank

  // --- render ----------------------------------------------------------------------------------
  function render() {
    const q = search.toLowerCase();
    const trees = Object.entries(cat.trees)
      .filter(([, t]) => treeType === "all" || String(t.type) === treeType)
      .map(([tid, t]) => {
        const rows = realIds(t)
          .map(pid => ({pid, name: projName(pid), st: status(pid)}))
          .filter(r => !q || r.name.toLowerCase().includes(q))
          .filter(r => stateFilter === "all" || r.st.state === stateFilter);
        const all = realIds(t).map(status);
        const done = all.reduce((a, s) => a + s.cur, 0), total = all.reduce((a, s) => a + s.max, 0);
        return {tid, name: treeName(tid), rows, done, total};
      })
      .filter(t => t.rows.length)
      .sort((a, b) => b.total - a.total);          // biggest tree first, the way the game's tabs read

    const counts = {done: 0, available: 0, locked: 0};
    let lvDone = 0, lvTotal = 0;
    for (const pid of Object.keys(cat.projects)) {
      if (!isReal(cat.projects[pid])) continue;
      if (treeType !== "all" && String(cat.trees[cat.projects[pid].tree]?.type) !== treeType) continue;
      const s = status(pid); counts[s.state]++; lvDone += s.cur; lvTotal += s.max;
    }
    document.getElementById("resStats").innerHTML = `
      <div class="tile"><span>available now</span><b>${counts.available}</b></div>
      <div class="tile"><span>locked</span><b>${counts.locked}</b></div>
      <div class="tile"><span>finished</span><b>${counts.done}</b></div>
      <div class="tile"><span>levels</span><b>${lvDone.toLocaleString()}</b><em>of ${lvTotal.toLocaleString()}</em></div>`;

    const order = {available: 0, locked: 1, done: 2};
    document.getElementById("resBody").innerHTML = trees.map(t => {
      const pct = t.total ? Math.round(100 * t.done / t.total) : 0;
      const head = `<tr class="grouphead"><td colspan="6">${t.name}
        <span class="gtot">${t.done.toLocaleString()} / ${t.total.toLocaleString()} levels
        <span class="bar"><i style="width:${pct}%"></i></span> ${pct}%</span></td></tr>`;
      const body = t.rows.sort((a, b) => order[a.st.state] - order[b.st.state] || a.name.localeCompare(b.name))
        .map(({pid, name, st}) => {
          const n = st.next;
          const need = st.state === "done" ? "" : st.blockers.map(b => `<span class="pill">${b}</span>`).join("")
            + (notes(n) ? `<span class="dim">${notes(n)}</span>` : "");
          const cost = n ? (n.cost || []).slice(0, 4).map(([rid, v]) => `<span class="pill">${resName(rid)} <small>${compact(v)}</small></span>`).join("") : "";
          return `<tr data-id="${pid}">
            <td>${name}</td>
            <td class="num">${st.cur} / ${st.max}</td>
            <td><span class="chip ${st.state}">${st.state}</span></td>
            <td>${need}</td>
            <td>${cost}</td>
            <td class="num">${n ? dur(n.time) : ""}</td></tr>`;
        }).join("");
      return head + body;
    }).join("") || `<tr><td colspan="6" class="dim">${Object.keys(cat.projects).length
      ? "nothing matches" : "no research catalogue yet — start the game with the current mod, then refresh"}</td></tr>`;
  }

  // --- load ------------------------------------------------------------------------------------
  function latestLevels(txt) {
    const r = new Map(), b = new Map();
    for (const line of txt.split("\n")) {
      if (!line) continue;
      let j; try { j = JSON.parse(line); } catch { continue; }
      if (j.kind === "research") r.set(Number(j.id), j.v);        // log is in time order: last wins
      else if (j.kind === "building") b.set(Number(j.id), j.v);
    }
    return {research: r, building: b};
  }

  async function load() {
    const st = document.getElementById("resStatus");
    st.textContent = "reading catalogue…";
    const get = (u, d) => fetch(u, {cache: "no-store"}).then(r => r.ok ? r.json() : d).catch(() => d);
    try {
      const [c, txt, sp, rs] = await Promise.all([
        get("/research.json", {projects: {}, trees: {}}),
        fetch("/milestones.jsonl", {cache: "no-store"}).then(r => r.ok ? r.text() : "").catch(() => ""),
        get("/specs.json", {}), get("/resources.json", {}),
      ]);
      cat = {projects: c.projects || {}, trees: c.trees || {}};
      levels = latestLevels(txt);
      specs = Object.assign({building: {}, research: {}, officer: {}, faction: {}}, sp);
      resources = rs || {};
      st.textContent = `${Object.keys(cat.projects).length.toLocaleString()} research projects in `
        + `${Object.keys(cat.trees).length} trees · ${levels.research.size.toLocaleString()} with a known level`;
      render();
    } catch (e) {
      st.textContent = "could not read the research catalogue (" + e.message + ")";
    }
  }

  function init() {
    document.getElementById("resType").onchange = e => { treeType = e.target.value; render(); };
    document.getElementById("resFilter").oninput = e => { search = e.target.value.trim(); render(); };
    const sf = document.getElementById("resState");
    sf.value = stateFilter = localStorage.getItem("resState") || "all";
    sf.onchange = () => { stateFilter = sf.value; localStorage.setItem("resState", stateFilter); render(); };
    document.getElementById("resReload").onclick = load;
  }

  return {init, load, status, latestLevels, fixName, isReal,
          setCatalogue: c => { cat = c; }, setLevels: l => { levels = l; }, setSpecs: s => { specs = s; }};
})();

if (typeof module !== "undefined") module.exports = RESEARCH;   // for test_research.js
