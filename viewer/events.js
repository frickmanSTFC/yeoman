// Events tab: dailies and their goals, solo milestone events with milestone progress, objectives.
//
// Everything comes from community_patch_events.json, which the mod rewrites whenever the game's
// own event list changes. Nothing here is computed from history: the game says what is active,
// claimable, complete, and how far along each milestone and objective is.

const EVENTS = (() => {
  let data = {updated: 0, events: []}, view = "running", selected = null;

  const compact = v => {
    const a = Math.abs(v), trim = x => x.toFixed(1).replace(/\.0$/, "");
    if (a >= 1e9) return trim(v / 1e9) + "B";
    if (a >= 1e6) return trim(v / 1e6) + "M";
    if (a >= 1e4) return Math.round(v / 1e3) + "k";
    return Math.round(v).toLocaleString();
  };
  const left = s => {
    if (s == null || s < 0) return "—";
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  };
  const name = e => e.name || `Event ${e.id}`;

  // --- classification ----------------------------------------------------------------------------
  const isDaily = e => e.IsDailyGoalsEvent || e.IsDailyMilestone;
  // chip text, in the order that matters: something to collect beats everything else
  function stateOf(e) {
    if (e.IsClaimable || (e.tiers || []).some(t => t.state === 2)) return "claim";
    if (e.IsClosed || e.IsArchived) return "ended";
    if (e.IsComplete) return "done";
    if (e.IsCurrentlyActive || e.IsActive) return "running";
    return "ended";
  }
  const tiersDone = e => (e.tiers || []).filter(t => t.state === 3 || t.state === 2).length;
  const tiersAll = e => (e.tiers || []).length;
  const goalDone = o => o.target > 0 ? o.cur >= o.target : o.claimable;

  function filtered() {
    const list = data.events.filter(e => !isDaily(e));
    if (view === "all") return list;
    if (view === "ended") return list.filter(e => stateOf(e) === "ended");
    return list.filter(e => stateOf(e) !== "ended");
  }

  // --- render ----------------------------------------------------------------------------------
  function render() {
    const dailies = data.events.filter(isDaily);
    const goals = dailies.flatMap(e => (e.objectives || []).map(o => ({...o, ev: e})));
    const done = goals.filter(goalDone).length;
    const reset = Math.min(...dailies.map(e => e.remaining_s ?? Infinity));
    const list = filtered().sort((a, b) => {
      const o = {claim: 0, running: 1, done: 2, ended: 3};
      return o[stateOf(a)] - o[stateOf(b)] || (a.remaining_s ?? 1e12) - (b.remaining_s ?? 1e12);
    });
    const running = list.filter(e => stateOf(e) === "running"), claims = data.events.filter(e => stateOf(e) === "claim");

    document.getElementById("evStats").innerHTML = `
      <div class="tile"><span>dailies</span><b>${goals.length ? `${done} / ${goals.length}` : "—"}</b>
        <em>${goals.length ? `${goals.length - done} left${isFinite(reset) ? ", " + left(reset) : ""}` : "no daily goals seen yet"}</em></div>
      <div class="tile"><span>running</span><b>${running.length}</b>
        <em>${running[0] ? "next ends in " + left(running[0].remaining_s) : ""}</em></div>
      <div class="tile"><span>claim waiting</span><b>${claims.length}</b><em>${claims[0] ? name(claims[0]) : ""}</em></div>
      <div class="tile"><span>events listed</span><b>${data.events.length}</b></div>`;

    document.getElementById("evDailyHead").textContent = isFinite(reset) ? `reset in ${left(reset)}` : "";
    document.getElementById("evDailies").innerHTML = goals.map(o => `<tr>
      <td class="${goalDone(o) ? "ok" : "no"}">${goalDone(o) ? "✓" : "·"}</td>
      <td>${o.name || `Goal ${o.id}`}</td>
      <td>${o.target ? `${compact(o.cur)} / ${compact(o.target)} <span class="bar"><i style="width:${Math.min(100, 100 * o.cur / o.target)}%"></i></span>` : ""}</td>
      <td><span class="chip ${goalDone(o) ? "done" : "todo"}">${goalDone(o) ? "done" : "to do"}</span></td></tr>`).join("")
      || `<tr><td colspan="4" class="dim">no daily goals in the list yet — open the events screen in the game once</td></tr>`;

    if (selected == null || !list.some(e => e.id == selected)) selected = list[0]?.id ?? null;
    document.getElementById("evBody").innerHTML = list.map(e => {
      const st = stateOf(e), n = e.next || {};
      const toNext = n.max ? Math.max(0, n.max - n.cur) : 0;
      return `<tr data-id="${e.id}" class="${e.id == selected ? "sel" : ""}">
        <td>${name(e)}</td>
        <td><span class="chip ${st}">${st}</span></td>
        <td>${st === "ended" ? "—" : left(e.remaining_s)}</td>
        <td>${tiersAll(e) ? `${tiersDone(e)} / ${tiersAll(e)} <span class="bar wide"><i style="width:${100 * tiersDone(e) / tiersAll(e)}%"></i></span>` : ""}</td>
        <td class="num">${compact(e.points || 0)}</td>
        <td class="num">${toNext ? compact(toNext) : ""}</td></tr>`;
    }).join("") || `<tr><td colspan="6" class="dim">${data.events.length ? "nothing in this view" : "no events yet — start the game with the current mod, then refresh"}</td></tr>`;

    const sel = list.find(e => e.id == selected);
    document.getElementById("evDetailHead").innerHTML = sel ? `${name(sel)} <small class="dim">objectives · ${left(sel.remaining_s)} left</small>` : "";
    document.getElementById("evDetail").innerHTML = sel ? (sel.objectives || []).map(o => `<tr>
      <td>${o.name || `Objective ${o.id}`}</td>
      <td>${o.target ? `${compact(o.cur)} / ${compact(o.target)} <span class="bar"><i style="width:${Math.min(100, 100 * o.cur / o.target)}%"></i></span>` : compact(o.cur)}</td>
      <td><span class="chip ${goalDone(o) ? "done" : "running"}">${goalDone(o) ? "done" : "running"}</span></td></tr>`).join("")
      || `<tr><td colspan="3" class="dim">no objectives listed</td></tr>` : "";
  }

  async function load() {
    const st = document.getElementById("evStatus");
    st.textContent = "reading events…";
    try {
      data = await fetch("/events.json", {cache: "no-store"}).then(r => r.ok ? r.json() : {updated: 0, events: []});
      data.events = data.events || [];
      const age = data.updated ? Math.round(Date.now() / 1000 - data.updated) : null;
      st.textContent = `${data.events.length} events` + (age != null ? ` · updated ${left(age)} ago` : "");
      render();
    } catch (e) {
      st.textContent = "could not read the events file (" + e.message + ")";
    }
  }

  function init() {
    document.getElementById("evView").onchange = e => { view = e.target.value; render(); };
    document.getElementById("evReload").onclick = load;
    document.getElementById("evBody").onclick = e => {
      const tr = e.target.closest("tr[data-id]"); if (!tr) return;
      selected = tr.dataset.id; render();
    };
  }

  return {init, load, stateOf, goalDone, setData: d => { data = d; }};
})();

if (typeof module !== "undefined") module.exports = EVENTS;   // for test_events.js
