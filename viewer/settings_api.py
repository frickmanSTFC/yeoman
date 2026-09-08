"""Settings tab backend: read/write the two [yeoman] keys in the mod's toml, report status, refresh data."""
import json, os, re, threading, time
import paths

KEYS = {"battlejournals": ("bool", True), "battlejournal_days": ("int", 30)}
_busy = {}          # "names" | "icons" -> message while a refresh runs


def toml_path():
    return os.path.join(paths.game(), "community_patch_settings.toml")


def _section(text):
    """(start, end) of the [yeoman] section body in text, or None."""
    m = re.search(r"^\[yeoman\][^\n]*\n", text, re.M)
    if not m:
        return None
    n = re.search(r"^\[", text[m.end():], re.M)
    return m.end(), m.end() + n.start() if n else len(text)


def read_toml():
    out = {k: d for k, (_, d) in KEYS.items()}
    try:
        text = open(toml_path(), encoding="utf-8").read()
    except OSError:
        return out
    sec = _section(text)
    if not sec:
        return out
    body = text[sec[0]:sec[1]]
    for k, (typ, _) in KEYS.items():
        m = re.search(rf"^\s*{k}\s*=\s*([^\s#]+)", body, re.M)
        if m:
            v = m.group(1).strip('"')
            out[k] = (v.lower() == "true") if typ == "bool" else int(v)
    return out


def write_toml(values):
    # ponytail: regex edit of two lines; the mod rewrites the file with its own layout anyway
    p = toml_path()
    text = open(p, encoding="utf-8").read() if os.path.isfile(p) else ""
    lines = "".join(f"{k} = {str(v).lower() if isinstance(v, bool) else int(v)}\n" for k, v in values.items())
    sec = _section(text)
    if not sec:
        text = text.rstrip("\n") + "\n\n[yeoman]\n" + lines
    else:
        body = text[sec[0]:sec[1]]
        for k, v in values.items():
            val = str(v).lower() if isinstance(v, bool) else int(v)
            body, n = re.subn(rf"^(\s*{k}\s*=\s*)[^\n#]*", rf"\g<1>{val}", body, count=1, flags=re.M)
            if not n:
                body += f"{k} = {val}\n"
        text = text[:sec[0]] + body + text[sec[1]:]
    with open(p, "w", encoding="utf-8") as f:
        f.write(text)


def folder_stats(folder):
    n = size = 0
    try:
        for e in os.scandir(folder):
            if e.is_file():
                n += 1; size += e.stat().st_size
    except OSError:
        pass
    return {"files": n, "bytes": size}


def file_info(p):
    try:
        return {"mtime": os.path.getmtime(p), "bytes": os.path.getsize(p)}
    except OSError:
        return None


def status():
    import app
    game = paths.game()
    dst = os.path.join(game, "version.dll")
    bundled = os.path.isfile(app.MOD_SRC)
    installed = os.path.isfile(dst)
    return {
        "version": paths.VERSION,
        "game": game,
        "mod": {"installed": installed,
                "up_to_date": bool(bundled and installed and app.sha(dst) == app.sha(app.MOD_SRC)),
                "bundled": bundled, "game_running": app.game_running()},
        "toml": read_toml(),
        "battles": folder_stats(os.path.join(paths.export(), "battles")),
        "names": file_info(os.path.join(paths.DATA, "names.json")),
        "icons": {**(file_info(os.path.join(paths.DATA, "icons.json")) or {}), "count": _icon_count()},
        "busy": dict(_busy),
    }


def _icon_count():
    try:
        return len(json.load(open(os.path.join(paths.DATA, "icons.json")))["by_name"])
    except (OSError, ValueError, KeyError):
        return 0


def refresh(what):
    """Rebuild names or icons in the background; returns a message for the page."""
    if what in _busy:
        return _busy[what]
    def run():
        try:
            if what == "names":
                import names; names.build()
            elif what == "icons":
                import icons; icons.export()
        except Exception as e:
            _busy[what] = f"failed: {e}"; time.sleep(30)
        _busy.pop(what, None)
    _busy[what] = "working…"
    threading.Thread(target=run, daemon=True).start()
    return _busy[what]


def apply(body):
    """POST /settings body -> saved values. Game folder change is kept in settings.json."""
    if "game" in body and paths.is_game_dir(body["game"]):
        s = paths.settings(); s["game"] = body["game"]; paths.save_settings(s)
    vals = {}
    if "battlejournals" in body:
        vals["battlejournals"] = bool(body["battlejournals"])
    if "battlejournal_days" in body:
        vals["battlejournal_days"] = max(0, int(body["battlejournal_days"]))
    if vals:
        write_toml(vals)
    return status()
