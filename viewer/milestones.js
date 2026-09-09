// Milestones tab: a dated timeline of buildings, research and ships going up a level.
//
// Same idea as the loot log. The game only ever reports current state, so the first value seen for
// a thing is a baseline and counts as nothing; every value after that is a real step, and the jump
// between one session's last value and the next session's first catches upgrades finished offline.

const MILE = (() => {
  const AXIS = "var(--line)", INK = "var(--text)", INK3 = "var(--dim)";

  const KINDS = {
    building:   {label: "Building", unit: "level"},
    research:   {label: "Research", unit: "level"},
    ship_tier:  {label: "Ship",     unit: "tier"},
    ship_level: {label: "Ship",     unit: "level"},
  };

  let rows = [], specs = {building: {}, research: {}, hull: {}, hull_name: {}, component_name: {}};
  let hulls = {}, comps = {}, names = {loca: {}}, lootRows = [], resources = {};
  let kindFilter = "all", rangeDays = 30;

  // How far either side of an upgrade we look for the resources that paid for it. The cost is
  // measured, not calculated, so it already includes any discount or event bonus — but two things
  // finishing inside the same window will have their costs added together.
  const COST_WINDOW_S = 15;

  const pad = n => String(n).padStart(2, "0");
  const dayKey = t => { const d = new Date(t * 1000);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const when = t => new Date(t * 1000).toLocaleString(undefined,
    {month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"});

  const compact = v => {
    const a = Math.abs(v), trim = x => x.toFixed(1).replace(/\.0$/, "");
    if (a >= 1e12) return trim(a / 1e12) + "T";
    if (a >= 1e9)  return trim(a / 1e9) + "B";
    if (a >= 1e6)  return trim(a / 1e6) + "M";
    if (a >= 1e4)  return Math.round(a / 1e3) + "k";
    return Math.round(a).toLocaleString();
  };
  const resName = id => { const r = resources[String(id)] || {};
    return r.pretty || (r.name || "").replace(/^Resource_/, "").replace(/_/g, " ") || `#${id}`; };

  // ship id -> hull id, from the "ship_hull" lines the mod writes once per ship
  function hullOf(shipId) {
    for (const r of rows) if (r.kind === "ship_hull" && r.id === shipId) return r.v;
    return null;
  }

  function labelFor(kind, id) {
    if (kind === "building") return specs.building?.[String(id)]?.name || `Building ${id}`;
    if (kind === "research") {
      const s = specs.research?.[String(id)];
      const fix = n => n && n.replace(/(\d)⇵/g, "G$1").replace(/(\d)⇴/g, "T$1");   // grade / Isogen tier icons
      return fix(s?.pretty || names.loca?.[String(s?.loca_id)]) || `Research ${id}`;
    }
    if (kind === "ship_tier" || kind === "ship_level") {
      const h = hullOf(id), spec = hulls?.[String(h)];
      // real ship name first, then the hull's internal name, then whatever a fleet snapshot saw
      return specs.hull_name?.[String(spec?.loca_id)]
        || spec?.name || specs.hull?.[String(h)]?.name || `Ship ${id}`;
    }
    return `${kind} ${id}`;
  }

  // Module upgrades: each "ship_components" line is the whole fitted list, so an id present now
  // and absent last time is a module that changed. The first list for a ship is a starting point.
  function moduleChanges() {
    const last = new Map(), out = [];
    for (const r of rows) {
      if (r.kind !== "ship_components" || !Array.isArray(r.v)) continue;
      const prev = last.get(r.id);
      last.set(r.id, r.v);
      if (!prev) continue;                                   // first reading: baseline only
      const before = new Set(prev);
      for (const c of r.v) if (!before.has(c)) out.push({t: r.t, ship: r.id, component: c});
    }
    return out.reverse();
  }

  // What actually left the account around that moment, from the loot log.
  function costOf(t) {
    const last = new Map(), spent = new Map();
    for (const r of lootRows) {
      const prev = last.get(r.id);
      last.set(r.id, r.v);
      if (prev === undefined) continue;
      const change = r.v - prev;
      if (change >= 0) continue;
      if (Math.abs(r.t - t) > COST_WINDOW_S) continue;
      spent.set(r.id, (spent.get(r.id) || 0) - change);
    }
    return [...spent.entries()].sort((a, b) => b[1] - a[1]);
  }

  function componentName(id) {
    const c = comps[String(id)];
    if (!c) return `Module ${id}`;
    const pretty = specs.component_name?.[String(c.loca_id)] || c.name;
    return c.tier ? `${pretty} <small class="dim">T${c.tier}</small>` : pretty;
  }

  function shipName(shipId) {
    const spec = hulls?.[String(hullOf(shipId))];
    return specs.hull_name?.[String(spec?.loca_id)] || spec?.name || `Ship ${shipId}`;
  }

  // real steps only: drop the first sighting of each thing
  function steps() {
    const last = new Map(), out = [];
    for (const r of rows) {
      // ship_hull maps a ship to its hull; ship_components is a fitted list, not a level.
      // Both belong to the module table below, never the timeline.
      if (r.kind === "ship_hull" || r.kind === "ship_components") continue;
      const key = r.kind + ":" + r.id;
      const prev = last.get(key);
      last.set(key, r.v);
      if (prev === undefined || prev === r.v) continue;
      out.push({t: r.t, kind: r.kind, id: r.id, from: prev, to: r.v});
    }
    return out.reverse();                       // newest first
  }

  function dayList(n) {
    const end = new Date(); end.setHours(12, 0, 0, 0);
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(end); d.setDate(d.getDate() - i);
      out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    }
    return out;
  }

  function barPath(x, y, w, h) {
    const r = Math.min(4, w / 2, h);
    if (h <= 0.5) return "";
    return `M${x},${y + h} v${-(h - r)} q0,${-r} ${r},${-r} h${w - 2 * r} q${r},0 ${r},${r} v${h - r} z`;
  }

  function perDayChart(list) {
    const W = 900, H = 170, L = 44, R = 12, T = 16, B = 26;
    const iw = W - L - R, ih = H - T - B;
    const keys = dayList(rangeDays);
    // one stacked bar per day, segments coloured like the tiles: building, research, ship
    const KINDS = [["building", "var(--accent3)"], ["research", "var(--accent4)"], ["ship", "var(--accent5)"]];
    const counts = new Map(keys.map(k => [k, [0, 0, 0]]));
    for (const s of list) {
      const c = counts.get(dayKey(s.t)); if (!c) continue;
      c[KINDS.findIndex(([k]) => s.kind.startsWith(k))]++;
    }
    const parts = keys.map(k => counts.get(k));
    const vals = parts.map(c => c[0] + c[1] + c[2]);
    const max = Math.max(1, ...vals);
    const step = iw / keys.length, bw = Math.max(2, Math.min(30, step - 2));

    let g = "";
    for (const v of [max, Math.round(max / 2), 0]) {
      const y = T + ih - (v / max) * ih;
      g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${AXIS}" stroke-width="1"/>`
        + `<text x="${L - 8}" y="${y + 4}" text-anchor="end" fill="${INK3}" font-size="11">${v}</text>`;
    }
    vals.forEach((v, i) => {
      const x = L + i * step + (step - bw) / 2, h = (v / max) * ih;
      let top = T + ih;
      parts[i].forEach((c, k) => {
        const ch = (c / max) * ih;
        if (c) g += `<path d="${barPath(x, top - ch, bw, ch)}" fill="${KINDS[k][1]}"/>`;
        top -= ch;
      });
      g += `<rect x="${L + i * step}" y="${T}" width="${step}" height="${ih}" fill="transparent"
              data-day="${keys[i]}" data-n="${v}"/>`;
      if (keys.length <= 16 || i % Math.ceil(keys.length / 12) === 0)
        g += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" fill="${INK3}" font-size="11">${keys[i].slice(5).replace("-", "/")}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" class="chart mini" preserveAspectRatio="none">${g}</svg>`;
  }

  function render() {
    const all = steps();
    const list = kindFilter === "all" ? all : all.filter(s => s.kind.startsWith(kindFilter));
    const cut = Date.now() / 1000 - rangeDays * 86400;
    const shown = list.filter(s => s.t >= cut);

    const byKind = {};
    for (const s of shown) byKind[s.kind] = (byKind[s.kind] || 0) + 1;

    document.getElementById("mileStats").innerHTML = `
      <div class="tile"><span>steps in range</span><b>${shown.length}</b></div>
      <div class="tile"><span>buildings</span><b>${byKind.building || 0}</b></div>
      <div class="tile"><span>research</span><b>${byKind.research || 0}</b></div>
      <div class="tile"><span>ships</span><b>${(byKind.ship_tier || 0) + (byKind.ship_level || 0)}</b><em>tier + level ups</em></div>`;

    document.getElementById("mileChart").innerHTML = shown.length ? perDayChart(shown) : "";

    document.getElementById("mileBody").innerHTML = shown.length
      ? shown.slice(0, 500).map(s => `<tr>
          <td>${when(s.t)}</td>
          <td><span class="tag">${KINDS[s.kind]?.label || s.kind}</span></td>
          <td>${labelFor(s.kind, s.id)}</td>
          <td class="num">${KINDS[s.kind]?.unit || ""} ${s.from} → <b>${s.to}</b></td>
        </tr>`).join("")
      : `<tr><td colspan="4" class="dim">nothing yet — the first reading of each building, research
           node and ship is only a starting point. Upgrade something and it lands here.</td></tr>`;

    const mods = moduleChanges().filter(m => m.t >= cut);
    document.getElementById("modBody").innerHTML = mods.length
      ? mods.slice(0, 300).map(m => {
          const cost = costOf(m.t);
          const paid = cost.length
            ? cost.slice(0, 4).map(([id, amt]) => `${compact(amt)} ${resName(id)}`).join(", ")
              + (cost.length > 4 ? ` <span class="dim">+${cost.length - 4} more</span>` : "")
            : `<span class="dim">nothing recorded</span>`;
          return `<tr><td>${when(m.t)}</td><td>${shipName(m.ship)}</td>
                  <td>${componentName(m.component)}</td><td class="wrap">${paid}</td></tr>`;
        }).join("")
      : `<tr><td colspan="4" class="dim">no module upgrades recorded yet</td></tr>`;
  }

  async function load() {
    const st = document.getElementById("mileStatus");
    st.textContent = "reading log…";
    const get = (u, d) => fetch(u, {cache: "no-store"}).then(r => r.ok ? r.json() : d).catch(() => d);
    try {
      const [txt, sp, hl, cp, nm, res, loot] = await Promise.all([
        fetch("/milestones.jsonl", {cache: "no-store"}).then(r => r.ok ? r.text() : ""),
        get("/specs.json", {}), get("/hulls.json", {}), get("/components.json", {}),
        get("/names.json", {loca: {}}), get("/resources.json", {}),
        fetch("/loot.jsonl", {cache: "no-store"}).then(r => r.ok ? r.text() : "").catch(() => ""),
      ]);
      specs = Object.assign({building: {}, research: {}, hull: {}, hull_name: {}, component_name: {}}, sp);
      hulls = hl || {}; comps = cp || {}; names = nm || {loca: {}}; resources = res || {};
      lootRows = loot.split("\n").filter(Boolean)
        .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      rows = txt.split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } })
                .filter(Boolean);
      st.textContent = `${rows.length.toLocaleString()} entries · `
        + `${Object.keys(specs.building).length} buildings, ${Object.keys(specs.research).length} research, `
        + `${Object.keys(hulls).length} ships named`;
      render();
    } catch (e) {
      st.textContent = "could not read the milestone log (" + e.message + ")";
    }
  }

  function init() {
    document.getElementById("mileKind").onchange = e => { kindFilter = e.target.value; render(); };
    document.getElementById("mileRange").onchange = e => { rangeDays = Number(e.target.value); render(); };
    document.getElementById("mileReload").onclick = load;
  }

  return {init, load, steps, moduleChanges, costOf,
          setRows: r => { rows = r; }, setLoot: r => { lootRows = r; }};
})();

if (typeof module !== "undefined") module.exports = MILE;   // for test_milestones.js
