// Events tab: dailies and their goals, solo milestone events with milestone progress, objectives.
//
// Everything comes from community_patch_events.json, which the mod rewrites whenever the game's
// own event list changes. Nothing here is computed from history: the game says what is active,
// claimable, complete, and how far along each milestone and objective is.

const EVENTS = (() => {
  let data = {updated: 0, events: []}, view = "running", kind = "milestone", selected = null, starOnly = false;

  // dailies you care about, starred by name (ids change with the day; names do not)
  const store = typeof localStorage !== "undefined" ? localStorage : null;
  const stars = new Set((() => { try { return JSON.parse(store?.getItem("evStars") || "[]"); } catch { return []; } })());
  const saveStars = () => store?.setItem("evStars", JSON.stringify([...stars]));
  const starred = o => stars.has(o.name);

  // The game's own event names end in a type tag: SMS / AMS = solo / alliance milestone,
  // SLB / ALB = solo / alliance leaderboard. Split it off into a kind of its own.
  const KINDS = {SMS: "solo milestone", AMS: "alliance milestone", SLB: "solo leaderboard", ALB: "alliance leaderboard"};
  function kindOf(e) {
    const m = /\s*[-–]\s*(SMS|AMS|SLB|ALB)\s*$/.exec(e.name || "");
    return m ? m[1] : "";
  }
  const kindLabel = e => KINDS[kindOf(e)] || "";

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
  const name = e => (e.name || "").replace(/\s*[-–]\s*(SMS|AMS|SLB|ALB)\s*$/, "") || `Event ${e.id}`;

  // --- classification ----------------------------------------------------------------------------
  const isDaily = e => e.IsDailyGoalsEvent || e.IsDailyMilestone;
  // the game's points counter is a 32-bit int and wraps on big alliance events; the progress
  // figure is a double and carries the same number safely, so prefer it
  const pts = e => (e.next && e.next.cur > 0 && (e.points < 0 || e.next.cur > e.points)) ? e.next.cur : (e.points || 0);
  // chip text, in the order that matters: something to collect beats everything else.
  // The game's "active" flags stay false for events it merely lists, so running means not closed
  // and still on the clock.
  function stateOf(e) {
    if (e.IsClaimable) return "claim";
    if (e.IsClosed || e.IsArchived) return "ended";
    if (e.IsComplete) return "done";
    if ((e.remaining_s ?? 0) > 0) return "running";
    return "ended";
  }
  // milestone tiers carry the score they need; reached = the game says so, or points are past it
  const tierDone = (e, t) => t.state === 3 || t.state === 2 || pts(e) >= t.score;
  const tiersDone = e => (e.tiers || []).filter(t => tierDone(e, t)).length;
  const tiersAll = e => (e.tiers || []).length;
  const goalDone = o => o.target > 0 ? o.cur >= o.target : o.claimable;

  function filtered() {
    let list = data.events.filter(e => !isDaily(e));
    if (kind === "milestone") list = list.filter(e => kindOf(e) === "SMS" || kindOf(e) === "AMS");
    else if (kind === "solo") list = list.filter(e => kindOf(e) === "SMS" || kindOf(e) === "SLB");
    else if (kind === "alliance") list = list.filter(e => kindOf(e) === "AMS" || kindOf(e) === "ALB");
    else if (kind === "leaderboard") list = list.filter(e => kindOf(e) === "SLB" || kindOf(e) === "ALB");
    if (view === "all") return list;
    if (view === "ended") return list.filter(e => stateOf(e) === "ended");
    return list.filter(e => stateOf(e) !== "ended");
  }

  // --- render ----------------------------------------------------------------------------------
  function render() {
    // every daily goal is its own small event; it is done when the game marks it complete
    const dailies = data.events.filter(isDaily);
    const goals = dailies.map(e => ({id: e.id, name: e.name, cur: pts(e),
      target: (e.tiers || [])[0]?.score || 0, claimable: e.IsClaimable, done: e.IsComplete}));
    const done = goals.filter(g => g.done).length;
    const starList = goals.filter(starred), starDone = starList.filter(g => g.done).length;
    const reset = Math.min(...dailies.map(e => e.remaining_s ?? Infinity));
    const list = filtered().sort((a, b) => {
      const o = {claim: 0, running: 1, done: 2, ended: 3};
      return o[stateOf(a)] - o[stateOf(b)] || (a.remaining_s ?? 1e12) - (b.remaining_s ?? 1e12);
    });
    const running = list.filter(e => stateOf(e) === "running"), claims = data.events.filter(e => stateOf(e) === "claim");

    document.getElementById("evStats").innerHTML = `
      <div class="tile"><span>starred dailies</span><b>${starList.length ? `${starDone} / ${starList.length}` : "—"}</b>
        <em>${starList.length ? (starDone === starList.length ? "all done" : `${starList.length - starDone} left`) : "star the ones that matter"}</em></div>
      <div class="tile"><span>all dailies</span><b>${goals.length ? `${done} / ${goals.length}` : "—"}</b>
        <em>${goals.length ? `${goals.length - done} left${isFinite(reset) ? ", " + left(reset) : ""}` : "no daily goals seen yet"}</em></div>
      <div class="tile"><span>running</span><b>${running.length}</b>
        <em>${running[0] ? "next ends in " + left(running[0].remaining_s) : ""}</em></div>
      <div class="tile"><span>claim waiting</span><b>${claims.length}</b><em>${claims[0] ? name(claims[0]) : ""}</em></div>
      <div class="tile"><span>events listed</span><b>${data.events.length}</b></div>`;

    document.getElementById("evDailyHead").textContent = isFinite(reset) ? `reset in ${left(reset)}` : "";
    // one column per group; the faction ones are told apart by name, the game exports no faction flag
    const groups = [["Federation", /federation/i], ["Klingon", /klingon/i], ["Romulan", /romulan/i], ["Ex-Borg", /exborg|ex-borg/i], ["General", /./]];
    const byGroup = groups.map(([label, re]) => ({label, rows: []}));
    for (const o of goals) {
      if (starOnly && !starred(o)) continue;
      byGroup[groups.findIndex(([, re]) => re.test(o.name || ""))].rows.push(o);
    }
    const row = o => `<tr class="${o.done ? "gdone" : ""}">
      <td class="star ${starred(o) ? "on" : ""}" data-star="${(o.name || "").replace(/"/g, "&quot;")}" title="star: counts in the starred tile">${starred(o) ? "★" : "☆"}</td>
      <td class="${o.done ? "ok" : "no"}">${o.done ? "✓" : "·"}</td>
      <td>${o.name || `Goal ${o.id}`}</td>
      <td class="num">${o.target ? `${compact(o.cur)} / ${compact(o.target)}` : ""}</td>
      <td>${o.target ? `<span class="bar"><i style="width:${Math.min(100, 100 * o.cur / o.target)}%"></i></span>` : ""}</td></tr>`;
    // factions side by side on top; everything else below them, split into columns of its own
    const table = (label, rows, all) => `<div class="dgroup"><table class="loot" style="min-width:0">
        <colgroup><col style="width:1.4rem"><col style="width:1.4rem"><col style="width:auto"><col style="width:6.5rem"><col style="width:4.2rem"></colgroup>
        <thead><tr><th colspan="5">${label}${all ? ` <span class="gtot">${all.filter(o => o.done).length} / ${all.length}</span>` : ""}</th></tr></thead>
        <tbody>${rows.map(row).join("")}</tbody></table></div>`;
    const factions = byGroup.slice(0, -1).filter(g => g.rows.length);
    const general = byGroup[byGroup.length - 1].rows;
    const cols = Math.min(3, Math.max(1, Math.ceil(general.length / 10)));
    const per = Math.ceil(general.length / cols);
    document.getElementById("evDailies").innerHTML = (factions.length || general.length)
      ? `<div class="dgrid">${factions.map(g => table(g.label, g.rows, g.rows)).join("")}</div>`
        + (general.length ? `<div class="dgrid" style="margin-top:.8rem">${Array.from({length: cols}, (_, i) =>
            table(i ? "&nbsp;" : "General", general.slice(i * per, (i + 1) * per), i ? null : general)).join("")}</div>` : "")
      : `<p class="dim">${starOnly && goals.length ? "no starred dailies yet — untick the box and click a star" : "no daily goals in the list yet — open the events screen in the game once"}</p>`;

    if (selected == null || !list.some(e => e.id == selected)) selected = list[0]?.id ?? null;
    document.getElementById("evBody").innerHTML = list.map(e => {
      const st = stateOf(e), n = e.next || {};
      const nextTier = (e.tiers || []).map(t => t.score).filter(sc => sc > pts(e)).sort((a, b) => a - b)[0];
      const toNext = nextTier ? nextTier - pts(e) : 0;
      return `<tr data-id="${e.id}" class="${e.id == selected ? "sel" : ""}">
        <td>${name(e)} <small class="dim">${kindLabel(e)}</small></td>
        <td><span class="chip ${st}">${st}</span></td>
        <td>${st === "ended" ? "—" : left(e.remaining_s)}</td>
        <td>${tiersAll(e) ? `${tiersDone(e)} / ${tiersAll(e)} <span class="bar wide"><i style="width:${100 * tiersDone(e) / tiersAll(e)}%"></i></span>` : ""}</td>
        <td class="num">${compact(pts(e))}</td>
        <td class="num">${toNext ? compact(toNext) : ""}</td></tr>`;
    }).join("") || `<tr><td colspan="6" class="dim">${data.events.length ? "nothing in this view" : "no events yet — start the game with the current mod, then refresh"}</td></tr>`;

    const sel = list.find(e => e.id == selected);
    document.getElementById("evDetailHead").hidden = !sel;
    document.getElementById("evDetailTable").hidden = !sel;
    document.getElementById("evDetailHead").innerHTML = sel ? `${name(sel)} <small class="dim">milestones · ${compact(pts(sel))} points · ${left(sel.remaining_s)} left</small>` : "";
    document.getElementById("evDetail").innerHTML = sel ? (sel.tiers || []).map((t, i) => {
      const done = tierDone(sel, t), pct = t.score ? Math.min(100, 100 * pts(sel) / t.score) : 0;
      const st = t.claimable || t.state === 2 ? "claim" : done ? "done" : "running";
      return `<tr>
      <td>Milestone ${i + 1}</td>
      <td>${compact(Math.min(sel.points || 0, t.score))} / ${compact(t.score)} <span class="bar"><i style="width:${pct}%"></i></span></td>
      <td><span class="chip ${st}">${st}</span></td></tr>`; }).join("")
      || `<tr><td colspan="3" class="dim">no milestones listed</td></tr>` : "";
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
    // the mod rewrites the file every few seconds; re-read it while the tab is on screen
    setInterval(() => { if (!document.getElementById("tab-ev").hidden && data.events.length) load(); }, 30000);
    document.getElementById("evView").onchange = e => { view = e.target.value; render(); };
    const kb = document.getElementById("evKind");
    kb.value = kind = localStorage.getItem("evKind") || "milestone";
    kb.onchange = () => { kind = kb.value; localStorage.setItem("evKind", kind); render(); };
    document.getElementById("evReload").onclick = load;
    const so = document.getElementById("evStarOnly");
    so.checked = starOnly = localStorage.getItem("evStarOnly") === "1";
    so.onchange = () => { starOnly = so.checked; localStorage.setItem("evStarOnly", starOnly ? "1" : "0"); render(); };
    document.getElementById("evDailies").onclick = e => {
      const td = e.target.closest("td.star"); if (!td) return;
      const n = td.dataset.star;
      stars.has(n) ? stars.delete(n) : stars.add(n); saveStars(); render();
    };
    document.getElementById("evBody").onclick = e => {
      const tr = e.target.closest("tr[data-id]"); if (!tr) return;
      selected = tr.dataset.id; render();
    };
  }

  return {init, load, render, stateOf, goalDone, kindOf, name, pts, stars, setData: d => { data = d; }};
})();

if (typeof module !== "undefined") module.exports = EVENTS;   // for test_events.js
