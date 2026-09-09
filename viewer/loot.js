// Loot tab: read the append-only loot log, work out what was gained and spent each day,
// and draw it. Page-only — no game restart needed to change anything in here.
//
// The log is a stream of absolute resource amounts. A change is (this value - the last value we
// saw for that id), so the first sighting of an id only sets a baseline and counts as nothing.
// That also means a jump between one session's last value and the next session's first value is
// picked up, which is how offline gains (gifts, refinery, base production) get counted.

const LOOT = (() => {
  const GAIN = "var(--gain)", SPEND = "var(--spend)", HELD = "var(--hold)";   // dataviz slots 3, 8 and 1, dark steps
  const AXIS = "var(--line)", INK = "var(--text)", INK2 = "var(--muted)", INK3 = "var(--dim)";

  let rows = [], specs = {}, selected = null, rangeDays = 14, filter = "", todayOnly = false, groupBy = false;
  let showHidden = false;
  // The Reputation tab is the same log seen through a filter: the game's "Faction points" type.
  const FACTION_SUBTYPE = 7;
  let repRange = 14, repSelected = null;

  // Resources the user has flagged as not worth seeing. Kept in the browser, so it survives F5.
  const store = typeof localStorage !== "undefined" ? localStorage : null;   // absent under node
  const hidden = new Set((() => { try { return JSON.parse(store?.getItem("lootHidden") || "[]"); }
                                  catch { return []; } })().map(Number));
  const saveHidden = () => store?.setItem("lootHidden", JSON.stringify([...hidden]));

  // --- helpers ----------------------------------------------------------------
  const pad = n => String(n).padStart(2, "0");
  const dayKey = t => { const d = new Date(t * 1000);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const shortDay = k => k.slice(5).replace("-", "/");

  const compact = v => {
    const sign = v < 0 ? "-" : "", a = Math.abs(v);
    const trim = x => x.toFixed(1).replace(/\.0$/, "");
    if (a >= 1e12) return sign + trim(a / 1e12) + "T";
    if (a >= 1e9)  return sign + trim(a / 1e9) + "B";
    if (a >= 1e6)  return sign + trim(a / 1e6) + "M";
    if (a >= 1e4)  return sign + Math.round(a / 1e3) + "k";
    return sign + Math.round(a).toLocaleString();
  };
  const full = v => Math.round(v).toLocaleString();

  // The game's own resource categories (ResourceSubtype). Not our invention, so the headings match
  // what the game thinks these things are.
  const SUBTYPE = {
    0: "Other", 1: "Currency", 2: "Premium currency", 3: "Raw material", 4: "Refined material",
    5: "Token", 6: "Intel", 7: "Faction points", 8: "Speed ups", 9: "Resource batch", 10: "Daily",
    11: "Material", 12: "Peace shield token", 13: "Peace shield", 14: "Scrapped material",
    15: "Territory capture", 16: "Cosmetic shard", 17: "Rating",
  };

  // Rarity as the game numbers it: R1..R4 on every refined material line up with these words.
  const RARITY = {1: "Common", 2: "Uncommon", 3: "Rare", 4: "Epic"};

  const specOf = id => specs[String(id)] || {};

  // Family name for a graded resource: the internal name with the grade, rarity and "Raw" tokens
  // taken out. "Resource_G4_Ore_R2" and "Resource_G7_Ore_Raw" are both "Ore", so raw and refined
  // share one heading. Hydrocarbon is the game's internal word for gas.
  function familyOf(id) {
    let f = (specOf(id).name || "").replace(/^Resource_/, "")
      .replace(/_?G\d+_?/g, "_").replace(/_?R\d+$/, "").replace(/_Raw$/i, "")
      .replace(/_+/g, " ").trim();
    return (f || "Material").replace(/Hydrocarbon/gi, "Gas");
  }

  const isRaw = id => /_Raw$/i.test(specOf(id).name || "");

  // Speed ups all arrive as one flat category (subtype 8), so they get split up here using the
  // game's own wording. The Sigma ones carry a real "Σ" in the name the game shows; the kind is the
  // word Repair / Assignment / Alliance in that same name. Nothing is inferred from ids.
  const SPEEDUP_SUBTYPE = 8;
  const prettyOf = id => specOf(id).pretty || specOf(id).name || "";

  function speedupKind(id) {
    const p = prettyOf(id);
    if (/Repair/i.test(p))     return {rank: 1, label: "Repair Speed Ups"};
    if (/Assignment/i.test(p)) return {rank: 2, label: "Assignment Speed Ups"};
    if (/Alliance/i.test(p))   return {rank: 3, label: "Alliance Speed Ups"};
    return {rank: 0, label: "Speed Ups"};
  }
  const isSigma = id => prettyOf(id).includes("Σ");
  const isSpeedup = id => specOf(id).subtype === SPEEDUP_SUBTYPE;

  // How long the speed up is worth, in seconds, read off the name ("3 Day", "15 Hour"). Used to put
  // the big ones at the top of their group.
  function durationOf(id) {
    const m = /(\d+)\s*(Minute|Hour|Day)/i.exec(prettyOf(id));
    if (!m) return 0;
    return Number(m[1]) * ({minute: 60, hour: 3600, day: 86400}[m[2].toLowerCase()]);
  }

  // Total time a group is worth, in days: every speed up in it, times how many you hold. Only used
  // where the whole group is speed ups, since adding up ore counts across grades would be nonsense.
  function groupDays(ids, have) {
    let secs = 0;
    for (const id of ids) {
      if (!isSpeedup(id)) return null;
      secs += durationOf(id) * (have.get(id) ?? 0);
    }
    return ids.length ? secs / 86400 : null;
  }

  const daysLabel = d => d >= 1 ? `${d.toFixed(1)} days` : `${(d * 24).toFixed(1)} hours`;

  // One heading per material: Ore, Crystal, Hydrocarbon, Parts Explorer, and so on. Everything
  // without a star grade falls back to the game's own category and sits below.
  const groupOf = id => {
    if (specOf(id).grade > 0) return familyOf(id);
    if (isSpeedup(id)) return (isSigma(id) ? "Σ " : "") + speedupKind(id).label;
    return SUBTYPE[specOf(id).subtype] ?? "Other";
  };

  // Group order: starred materials first, then the rest by category name. Inside speed ups the
  // order is fixed rather than alphabetical: every Sigma group, then every normal one.
  const groupSort = id => {
    if ((specOf(id).grade || 0) > 0) return [0, familyOf(id), 0];
    if (isSpeedup(id)) return [1, "Speed Ups", (isSigma(id) ? 0 : 10) + speedupKind(id).rank];
    return [1, groupOf(id), 0];
  };

  const cmp = (a, b) => { for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; };
  const nameOf = id => { const s = specOf(id);
    return s.pretty || (s.name || "").replace(/^Resource_/, "").replace(/_/g, " ") || String(id); };

  // --- aggregation ------------------------------------------------------------
  // day -> Map(resource id -> {g: gained, s: spent})
  function aggregate() {
    const last = new Map(), days = new Map();
    for (const r of rows) {
      const prev = last.get(r.id);
      last.set(r.id, r.v);
      if (prev === undefined) continue;          // first sighting: baseline only
      const change = r.v - prev;
      if (!change) continue;
      const k = dayKey(r.t);
      let m = days.get(k); if (!m) days.set(k, m = new Map());
      let e = m.get(r.id); if (!e) m.set(r.id, e = {g: 0, s: 0});
      if (change > 0) e.g += change; else e.s -= change;
    }
    return days;
  }

  // what you hold right now: the last absolute amount the log saw for each resource
  function stock() {
    const m = new Map();
    for (const r of rows) m.set(r.id, r.v);
    return m;
  }

  // The highest amount held on each day. The log records the amount after every change, so the
  // peak is simply the largest reading that day; a day with no change inherits the last one.
  function peakByDay() {
    const peaks = new Map();   // day -> Map(id -> highest amount seen)
    for (const r of rows) {
      let m = peaks.get(dayKey(r.t));
      if (!m) peaks.set(dayKey(r.t), m = new Map());
      m.set(r.id, Math.max(m.get(r.id) ?? -Infinity, r.v));
    }
    return peaks;
  }

  // continuous calendar days so gaps read as zero rather than closing up
  function dayList(days, n) {
    const keys = [...days.keys()].sort();
    if (!keys.length) return [];
    const end = new Date(); end.setHours(12, 0, 0, 0);
    const first = new Date(keys[0] + "T12:00:00");
    const span = Math.round((end - first) / 86400000) + 1;
    const count = n === "all" ? span : Math.min(n, span);
    const out = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(end); d.setDate(d.getDate() - i);
      out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    }
    return out;
  }

  // --- svg bits ---------------------------------------------------------------
  // rounded data-end, square against the baseline
  function barPath(x, y, w, h, up) {
    const r = Math.min(4, w / 2, h);
    if (h <= 0.5) return "";
    return up
      ? `M${x},${y + h} v${-(h - r)} q0,${-r} ${r},${-r} h${w - 2 * r} q${r},0 ${r},${r} v${h - r} z`
      : `M${x},${y} v${h - r} q0,${r} ${r},${r} h${w - 2 * r} q${r},0 ${r},${-r} v${-(h - r)} z`;
  }

  let tipEl = null;                                  // built on first use so this file also loads in node
  const tipNode = () => tipEl ??= document.body.appendChild(
    Object.assign(document.createElement("div"), {className: "tip", hidden: true}));
  const tip = {
    show(html, ev) { const el = tipNode(); el.innerHTML = html; el.hidden = false;
      el.style.left = Math.min(ev.clientX + 14, innerWidth - el.offsetWidth - 8) + "px";
      el.style.top = (ev.clientY + 14) + "px"; },
    hide() { if (tipEl) tipEl.hidden = true; },
  };

  // gains above the zero line, spends below it: position carries the meaning as well as colour
  function dayChart(days, id, keys) {
    const W = 900, H = 260, L = 64, R = 12, T = 18, B = 30;
    const iw = W - L - R, ih = H - T - B;
    const data = keys.map(k => { const e = (days.get(k) || new Map()).get(id) || {g: 0, s: 0};
      return {k, g: e.g, s: e.s}; });
    const maxG = Math.max(1, ...data.map(d => d.g));
    const maxS = Math.max(0, ...data.map(d => d.s));
    const total = maxG + maxS;
    const zeroY = T + ih * (maxG / total);
    const step = iw / Math.max(1, data.length);
    const bw = Math.max(3, Math.min(38, step - 2));            // 2px surface gap between bars
    const peak = data.reduce((a, b) => b.g > a.g ? b : a, data[0] || {g: 0});

    const yG = v => (v / total) * ih;
    const ticks = [maxG, maxG / 2, 0, -maxS / 2, -maxS].filter((v, i, a) => a.indexOf(v) === i && (v !== 0 || true));

    let g = "";
    for (const v of ticks) {
      const y = zeroY - (v / total) * ih;
      g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${AXIS}" stroke-width="${v === 0 ? 1.5 : 1}"/>`
        + `<text x="${L - 8}" y="${y + 4}" text-anchor="end" fill="${INK3}" font-size="11">${compact(v)}</text>`;
    }
    data.forEach((d, i) => {
      const x = L + i * step + (step - bw) / 2;
      if (d.g) g += `<path d="${barPath(x, zeroY - yG(d.g), bw, yG(d.g), true)}" fill="${GAIN}"/>`;
      if (d.s) g += `<path d="${barPath(x, zeroY, bw, yG(d.s), false)}" fill="${SPEND}"/>`;
      g += `<rect x="${L + i * step}" y="${T}" width="${step}" height="${ih}" fill="transparent"
              data-day="${d.k}" data-g="${d.g}" data-s="${d.s}"/>`;
      if (data.length <= 16 || i % Math.ceil(data.length / 12) === 0)
        g += `<text x="${x + bw / 2}" y="${H - 10}" text-anchor="middle" fill="${INK3}" font-size="11">${shortDay(d.k)}</text>`;
    });
    if (peak && peak.g > 0) {                                   // one direct label: the best day
      const i = data.indexOf(peak), x = L + i * step + step / 2;
      g += `<text x="${x}" y="${zeroY - yG(peak.g) - 7}" text-anchor="middle" fill="${INK}" font-size="11">${compact(peak.g)}</text>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="none">${g}</svg>`;
  }

  // Its own chart with its own scale rather than a second axis on the bars above: stock and daily
  // gathering are different sizes, and two scales in one frame read as a lie.
  function heldChart(peaks, id, keys) {
    const W = 900, H = 170, L = 64, R = 12, T = 16, B = 26;
    const iw = W - L - R, ih = H - T - B;

    let carried = null;                       // a quiet day still holds yesterday's amount
    const data = keys.map(k => {
      const v = peaks.get(k)?.get(id);
      if (v !== undefined) carried = v;
      return {k, v: carried, real: v !== undefined};
    });
    const known = data.filter(d => d.v != null);
    if (!known.length) return "";
    const max = Math.max(1, ...known.map(d => d.v));
    const step = iw / Math.max(1, data.length);
    const x = i => L + i * step + step / 2;
    const y = v => T + ih - (v / max) * ih;

    let g = "";
    for (const v of [max, max / 2, 0]) {
      g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${AXIS}" stroke-width="1"/>`
        + `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" fill="${INK3}" font-size="11">${compact(v)}</text>`;
    }
    const pts = data.map((d, i) => d.v == null ? null : `${x(i)},${y(d.v)}`).filter(Boolean);
    g += `<polyline points="${pts.join(" ")}" fill="none" stroke="${HELD}" stroke-width="2"
            stroke-linejoin="round" stroke-linecap="round"/>`;
    data.forEach((d, i) => {
      if (d.v != null && d.real) {
        g += `<circle cx="${x(i)}" cy="${y(d.v)}" r="4" fill="${HELD}" stroke="var(--bg)" stroke-width="2"/>`;
      }
      g += `<rect x="${L + i * step}" y="${T}" width="${step}" height="${ih}" fill="transparent"
              data-day="${d.k}" data-held="${d.v ?? ""}"/>`;
      if (data.length <= 16 || i % Math.ceil(data.length / 12) === 0)
        g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" fill="${INK3}" font-size="11">${shortDay(d.k)}</text>`;
    });
    const last = known[known.length - 1];
    g += `<text x="${W - R}" y="${y(last.v) - 8}" text-anchor="end" fill="${INK}" font-size="11">${compact(last.v)}</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="chart mini" preserveAspectRatio="none">${g}</svg>`;
  }

  function sparkline(days, id, keys) {
    const W = 140, H = 26;
    const vals = keys.map(k => ((days.get(k) || new Map()).get(id) || {g: 0}).g);
    const max = Math.max(1, ...vals);
    const step = W / Math.max(1, vals.length), bw = Math.max(1.5, step - 2);
    const bars = vals.map((v, i) => v ? `<rect x="${i * step}" y="${H - (v / max) * H}" width="${bw}"
      height="${(v / max) * H}" rx="1.5" fill="${GAIN}"/>` : "").join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="spark">${bars}</svg>`;
  }

  function rowFor(id, t, days, keys, have, daysCovered, sel = selected, hideBox = true) {
    const ico = LOOTICON({...specOf(id), id});   // the art id is what the game's icon map is keyed by
    const box = hideBox ? `<input type="checkbox" class="hide" title="hide this resource" ${hidden.has(id) ? "checked" : ""}>` : "";
    return `<tr data-id="${id}" class="${sel == id ? "sel" : ""}">
      <td class="res" title="${nameOf(id)}">${box}${ico}<span>${nameOf(id)}</span></td>
      <td class="num have">${compact(have.get(id) ?? 0)}</td>
      <td class="num">${t.today ? compact(t.today) : ""}</td>
      <td class="num">${t.yday ? compact(t.yday) : ""}</td>
      <td class="num">${t.g ? compact(t.g / daysCovered) : ""}</td>
      <td class="num gain">${t.g ? compact(t.g) : ""}</td>
      <td class="num spend">${t.s ? compact(t.s) : ""}</td>
      <td class="num">${t.g || t.s ? compact(t.g - t.s) : ""}</td>
      <td>${sparkline(days, id, keys.slice(-14))}</td></tr>`;
  }

  const isFaction = id => specOf(id).subtype === FACTION_SUBTYPE;
  // every faction the account holds points in, biggest standing first, moved in range or not
  const repIds = have => [...have.entries()].filter(([id, v]) => isFaction(id) && v > 0)
                                            .sort((a, b) => b[1] - a[1]).map(([id]) => id);

  // --- render -----------------------------------------------------------------
  function render() { renderView("loot"); }
  function renderRep() { renderView("rep"); }

  function renderView(view) {
    const rep = view === "rep";
    const days = aggregate();
    const have = stock();
    const keys = dayList(days, rep ? repRange : rangeDays);
    const inRange = new Set(keys);
    const today = keys[keys.length - 1], yesterday = keys[keys.length - 2];

    const totals = new Map();   // id -> {g, s, today, yday}
    for (const [k, m] of days) {
      if (!inRange.has(k)) continue;
      for (const [id, e] of m) {
        let t = totals.get(id); if (!t) totals.set(id, t = {g: 0, s: 0, today: 0, yday: 0});
        t.g += e.g; t.s += e.s;
        if (k === today) t.today = e.g;
        if (k === yesterday) t.yday = e.g;
      }
    }

    if (rep) {
      renderRepView(days, have, keys, totals);
      return;
    }
    let list = [...totals.entries()]
      .filter(([id]) => !isFaction(id))                     // factions have their own tab
      .filter(([id]) => showHidden || !hidden.has(id))
      .filter(([id]) => !filter || nameOf(id).toLowerCase().includes(filter));
    const lbl = document.getElementById("lootShowHiddenN");
    if (lbl) lbl.textContent = hidden.size ? ` (${hidden.size})` : "";
    if (todayOnly) list = list.filter(([, t]) => t.today > 0);
    list.sort((a, b) => b[1].g - a[1].g);
    if (groupBy) {
      // Group first, then inside a group the highest star grade at the top, then Epic before
      // Common. The sort is stable, so the biggest mover still wins a tie.
      list.sort((a, b) => cmp(groupSort(a[0]), groupSort(b[0]))
                       || isSigma(b[0]) - isSigma(a[0])      // Sigma first inside any group
                       || isRaw(a[0]) - isRaw(b[0])          // raw sits under the refined stuff
                       || durationOf(b[0]) - durationOf(a[0])   // longest speed up first
                       || (specOf(b[0]).grade || 0) - (specOf(a[0]).grade || 0)
                       || (specOf(b[0]).rarity || 0) - (specOf(a[0]).rarity || 0));
    }

    const daysCovered = keys.length || 1;
    const gainers = list.filter(([, t]) => t.g > 0);
    const best = gainers[0];
    document.getElementById("lootStats").innerHTML = `
      <div class="tile"><span>days in range</span><b>${daysCovered}</b></div>
      <div class="tile"><span>resources moved</span><b>${list.length}</b></div>
      <div class="tile"><span>biggest earner</span><b>${best ? nameOf(best[0]) : "—"}</b>
        <em>${best ? compact(best[1].g) : ""}</em></div>
      <div class="tile"><span>log lines</span><b>${rows.length.toLocaleString()}</b></div>`;

    if (!list.length) {
      document.getElementById("lootBody").innerHTML = `<tr><td colspan="9" class="dim">${
        todayOnly ? "nothing gathered today yet" : "nothing recorded yet — play for a bit, then hit refresh"}</td></tr>`;
      document.getElementById("lootDetail").innerHTML = "";
      return;
    }

    // headings only when grouping is on and the list actually spans more than one category
    let lastGroup = null;
    const grouped = groupBy && new Set(list.map(([id]) => groupOf(id))).size > 1;

    // held total per group, worked out once rather than per row
    const byGroup = new Map();
    for (const [id] of list) {
      const g = groupOf(id);
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(id);
    }
    const groupTotal = g => {
      const d = groupDays(byGroup.get(g) || [], have);
      return d ? ` <span class="gtot">${daysLabel(d)} held</span>` : "";
    };
    document.getElementById("lootBody").innerHTML = list.map(([id, t]) => {
      let head = "";
      if (grouped) {
        const g = groupOf(id);
        if (g !== lastGroup) {
          lastGroup = g;
          head = `<tr class="grouphead"><td colspan="9">${g}${groupTotal(g)}</td></tr>`;
        }
      }
      return head + rowFor(id, t, days, keys, have, daysCovered);
    }).join("") || `<tr><td colspan="9" class="dim">nothing to show</td></tr>`;


    if (selected == null || !totals.has(Number(selected))) selected = list[0][0];
    const sel = Number(selected), st = totals.get(sel);
    document.getElementById("lootDetail").innerHTML = `
      <h2>${nameOf(sel)} <small class="dim">per day</small></h2>
      <div class="legend">
        <span><i style="background:${GAIN}"></i>gained ${compact(st.g)}</span>
        <span><i style="background:${SPEND}"></i>spent ${compact(st.s)}</span>
        <span class="dim">${compact(st.g / daysCovered)} / day average</span>
        <span class="dim">holding ${full(have.get(sel) ?? 0)}</span>
      </div>
      ${dayChart(days, sel, keys)}
      <h2>Most held each day <small class="dim">peak amount in the account</small></h2>
      ${heldChart(peakByDay(), sel, keys)}`;
    hookTips("#lootDetail svg");
  }

  // Reputation: every faction with points, sorted by standing, whether or not it moved in range.
  function renderRepView(days, have, keys, totals) {
    const ids = repIds(have);
    const daysCovered = keys.length || 1;
    const tot = id => totals.get(id) || {g: 0, s: 0, today: 0, yday: 0};
    const best = [...ids].sort((a, b) => tot(b).g - tot(a).g)[0];
    document.getElementById("repStats").innerHTML = `
      <div class="tile"><span>factions</span><b>${ids.length}</b></div>
      <div class="tile"><span>days in range</span><b>${daysCovered}</b></div>
      <div class="tile"><span>biggest gain</span><b>${best && tot(best).g ? nameOf(best) : "—"}</b>
        <em>${best && tot(best).g ? compact(tot(best).g) : ""}</em></div>`;
    if (!ids.length) {
      document.getElementById("repBody").innerHTML =
        `<tr><td colspan="9" class="dim">no faction points recorded yet — play for a bit, then hit refresh</td></tr>`;
      document.getElementById("repDetail").innerHTML = "";
      return;
    }
    if (repSelected == null || !ids.includes(Number(repSelected))) repSelected = ids[0];
    document.getElementById("repBody").innerHTML =
      ids.map(id => rowFor(id, tot(id), days, keys, have, daysCovered, repSelected, false)).join("");

    const sel = Number(repSelected), st = tot(sel);
    document.getElementById("repDetail").innerHTML = `
      <h2>${nameOf(sel)} <small class="dim">per day</small></h2>
      <div class="legend">
        <span><i style="background:${GAIN}"></i>gained ${compact(st.g)}</span>
        <span><i style="background:${SPEND}"></i>spent ${compact(st.s)}</span>
        <span class="dim">${compact(st.g / daysCovered)} / day average</span>
        <span class="dim">standing ${full(have.get(sel) ?? 0)}</span>
      </div>
      ${dayChart(days, sel, keys)}
      <h2>Standing each day <small class="dim">highest reputation seen that day</small></h2>
      ${heldChart(peakByDay(), sel, keys)}`;
    hookTips("#repDetail svg");
  }

  function hookTips(selector) {
    for (const svg of document.querySelectorAll(selector)) {
      svg.onmousemove = e => {
        const t = e.target.closest("[data-day]"); if (!t) return tip.hide();
        tip.show(t.dataset.held !== undefined
          ? `<b>${t.dataset.day}</b><br>held ${t.dataset.held ? full(t.dataset.held) : "—"}`
          : `<b>${t.dataset.day}</b><br>gained ${full(t.dataset.g)}<br>spent ${full(t.dataset.s)}`, e);
      };
      svg.onmouseleave = tip.hide;
    }
  }

  // icon lookup shares the fleet page's icons.json index
  let LOOTICON = () => "";
  function setIconFn(fn) { LOOTICON = fn; }

  // --- load -------------------------------------------------------------------
  async function load() {
    const st = document.getElementById("lootStatus");
    st.textContent = "reading log…";
    try {
      await (globalThis.iconsReady ?? Promise.resolve());   // icons before the first render
      const [txt, sp] = await Promise.all([
        fetch("/loot.jsonl", {cache: "no-store"}).then(r => r.ok ? r.text() : ""),
        fetch("/resources.json", {cache: "no-store"}).then(r => r.ok ? r.json() : {}).catch(() => ({})),
      ]);
      specs = sp || {};
      rows = txt.split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } })
                .filter(Boolean);
      const named = Object.keys(specs).length;
      st.textContent = `${rows.length.toLocaleString()} entries · ${named} resource names`
        + (named ? "" : " · names arrive after the next game restart");
      render();
      if (document.getElementById("repBody")) renderRep();
    } catch (e) {
      st.textContent = "could not read the loot log (" + e.message + ")";
    }
  }

  function init() {
    const rr = document.getElementById("repRange");
    if (rr) {
      rr.onchange = e => { repRange = e.target.value === "all" ? "all" : Number(e.target.value); renderRep(); };
      document.getElementById("repReload").onclick = load;
      document.getElementById("repBody").onclick = e => {
        const tr = e.target.closest("tr[data-id]"); if (!tr) return;
        repSelected = tr.dataset.id; renderRep();
      };
    }
    document.getElementById("lootRange").onchange = e => {
      rangeDays = e.target.value === "all" ? "all" : Number(e.target.value); render(); };
    document.getElementById("lootFilter").oninput = e => { filter = e.target.value.toLowerCase().trim(); render(); };
    document.getElementById("lootReload").onclick = load;

    // Ask the game to look for icons it has learned. The scan is heavy, so it never runs on its own.
    document.getElementById("lootScan").onclick = async () => {
      const msg = document.getElementById("lootScanMsg");
      const before = Object.keys(globalThis.iconMap || {}).length;
      msg.textContent = "asking the game…";
      try {
        await fetch("/scan_icons", {cache: "no-store"});
        await new Promise(r => setTimeout(r, 4000));      // the mod picks the marker up on its next tick
        const m = await fetch("/iconmap.json", {cache: "no-store"}).then(r => r.ok ? r.json() : {});
        globalThis.setIconMap?.(m);
        const after = Object.keys(m).length;
        msg.textContent = after > before ? `+${after - before} new icons (${after} total)`
                                         : `no new icons (${after} total)`;
        render();
      } catch (e) {
        msg.textContent = "could not reach the game (" + e.message + ")";
      }
    };
    const gbox = document.getElementById("lootGroup");
    gbox.checked = groupBy = localStorage.getItem("lootGroup") === "1";
    gbox.onchange = () => { groupBy = gbox.checked;
      localStorage.setItem("lootGroup", groupBy ? "1" : "0"); render(); };

    const box = document.getElementById("lootToday");
    box.checked = todayOnly = localStorage.getItem("lootToday") === "1";
    box.onchange = () => { todayOnly = box.checked;
      localStorage.setItem("lootToday", todayOnly ? "1" : "0"); render(); };
    const sbox = document.getElementById("lootShowHidden");
    sbox.checked = showHidden = localStorage.getItem("lootShowHidden") === "1";
    sbox.onchange = () => { showHidden = sbox.checked;
      localStorage.setItem("lootShowHidden", showHidden ? "1" : "0"); render(); };

    document.getElementById("lootBody").onclick = e => {
      const tr = e.target.closest("tr[data-id]"); if (!tr) return;
      const id = Number(tr.dataset.id);
      if (e.target.classList.contains("hide")) {          // the flag box, not a row pick
        e.target.checked ? hidden.add(id) : hidden.delete(id);
        saveHidden(); render(); return;
      }
      selected = tr.dataset.id; render();
    };
  }

  // the group sort as render() applies it, exposed so test_loot.js checks the real thing
  const orderForTest = ids => [...ids].sort((a, b) =>
    cmp(groupSort(a), groupSort(b))
    || isSigma(b) - isSigma(a)
    || isRaw(a) - isRaw(b)
    || durationOf(b) - durationOf(a)
    || (specOf(b).grade || 0) - (specOf(a).grade || 0)
    || (specOf(b).rarity || 0) - (specOf(a).rarity || 0));

  // the Reputation tab shares the loaded log: first visit loads it, later visits just redraw
  const showRep = () => rows.length ? renderRep() : load();

  return {init, load, setIconFn, aggregate, dayList, stock, peakByDay, compact, groupOf, orderForTest,
          groupDays, daysLabel, hidden, showRep, repIds,
          setRows: r => { rows = r; }, setSpecs: s => { specs = s; }};
})();

if (typeof module !== "undefined") module.exports = LOOT;   // for test_loot.js
