"""Tiny viewer server. Run: python serve.py  (opens http://localhost:8765). Yeoman.exe runs it via app.py."""
import http.server, os, webbrowser, functools, json, glob
import paths

GAME = paths.export()          # game\yeoman: what the mod writes for us
DLCACHE = os.path.expandvars(r"%USERPROFILE%\AppData\LocalLow\Digit Game Studios Ltd_\Star Trek Fleet Command\DownloadCacheManager")
PORT = 8765


# ponytail: summarise the battle journals here rather than in the browser. Each journal is ~200 KB
# and there are hundreds; the page only needs a dozen fields per fight. Rebuilt when the folder
# changes, which is cheap enough at this size.
_battle_cache = {"key": None, "data": None}

BATTLE_FIELDS = ("system_id", "initiator_id", "target_id", "initiator_wins",
                 "battle_duration", "battle_type", "battle_time")
FLEET_FIELDS = ("hull_ids", "initial_ship_levels", "bridge_officers", "ship_ids", "xp_gained",
                "initial_ship_hps", "final_ship_hps", "max_ship_hps",
                "initial_ship_shps", "final_ship_shps", "max_ship_shps",
                "active_officer_slots", "faction_id")


def battle_summary():
    """One small record per battle journal, built from the files on disk."""
    folder = os.path.join(GAME, "battles")
    files = sorted(glob.glob(os.path.join(folder, "*.json")))
    key = (len(files), max((os.path.getmtime(f) for f in files), default=0))
    if _battle_cache["key"] == key:
        return _battle_cache["data"]

    out, players = [], {}
    for path in files:
        try:
            with open(path, encoding="utf-8") as fh:
                d = json.load(fh)
        except (OSError, ValueError):
            continue
        j = d.get("journal") or {}
        rec = {k: j.get(k) for k in BATTLE_FIELDS}
        rec["id"] = str(d.get("id") or j.get("id") or "")
        for side, short in (("initiator_fleet_data", "a"), ("target_fleet_data", "b")):
            fd = j.get(side) or {}
            rec[short] = {k: fd.get(k) for k in FLEET_FIELDS}
        out.append(rec)
        players.update(d.get("names") or {})

    data = json.dumps({"battles": out, "players": players}).encode()
    _battle_cache.update(key=key, data=data)
    return data


class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Drop a marker the mod picks up on its next tick; it scans once, then deletes the marker.
        if self.path.startswith("/scan_icons"):
            try:
                open(os.path.join(GAME, "community_patch_scan_icons"), "w").close()
                body = b'{"ok":true}'
            except OSError as e:
                body = json.dumps({"ok": False, "error": str(e)}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/battles_summary.json"):
            return self.reply(battle_summary())
        if self.path.startswith("/settings.json"):
            import settings_api
            return self.reply(json.dumps(settings_api.status()).encode())
        super().do_GET()

    def do_POST(self):
        import settings_api
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n) or b"{}")
        if self.path.startswith("/settings"):
            return self.reply(json.dumps(settings_api.apply(body)).encode())
        if self.path.startswith("/update"):
            return self.reply(json.dumps(settings_api.update_action(body.get("what"))).encode())
        if self.path.startswith("/refresh"):
            return self.reply(json.dumps({"msg": settings_api.refresh(body.get("what"))}).encode())
        self.send_error(404)

    def reply(self, body):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def translate_path(self, path):
        if path.startswith("/fleets.json"):
            return os.path.join(GAME, "community_patch_fleets.json")
        if path.startswith("/images.json"):
            return os.path.join(GAME, "community_patch_images.json")
        if path.startswith("/avatars.json"):
            return os.path.join(GAME, "community_patch_avatars.json")
        if path.startswith("/battles.jsonl"):
            return os.path.join(GAME, "community_patch_battles.jsonl")
        if path.startswith("/battle/"):   # one journal per battle, named by id
            return os.path.join(GAME, "battles", os.path.basename(path[8:]))
        if path.startswith("/iconmap.json"):
            return os.path.join(GAME, "community_patch_icons.json")
        if path.startswith("/components.json"):
            return os.path.join(GAME, "community_patch_components.json")
        if path.startswith("/hulls.json"):
            return os.path.join(GAME, "community_patch_hulls.json")
        if path.startswith("/specs.json"):
            return os.path.join(GAME, "community_patch_specs.json")
        if path.startswith("/resources.json"):
            return os.path.join(GAME, "community_patch_resources.json")
        if path.startswith("/events.json"):
            return os.path.join(GAME, "community_patch_events.json")
        if path.startswith("/research.json"):
            return os.path.join(GAME, "community_patch_research.json")
        if path.startswith("/milestones.jsonl"):
            return os.path.join(GAME, "community_patch_milestones.jsonl")
        if path.startswith("/loot.jsonl"):
            return os.path.join(GAME, "community_patch_loot.jsonl")
        if path.startswith("/mining.jsonl"):
            return os.path.join(GAME, "community_patch_mining.jsonl")
        if path.startswith("/names.json") or path.startswith("/icons.json"):
            return os.path.join(paths.DATA, os.path.basename(path.split("?")[0]))
        if path.startswith("/data/icons/"):
            return os.path.join(paths.ICONS, os.path.basename(path[12:]))
        if path.startswith("/dl/"):   # game's own download cache (portraits, ship cards)
            return os.path.join(DLCACHE, os.path.basename(path[4:]))
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):  # quiet
        pass


SRV = None   # the live server, so update.py can close it before handing over to a new exe


def run():
    global SRV
    handler = functools.partial(H, directory=paths.WEB)
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as srv:
        SRV = srv
        webbrowser.open(f"http://localhost:{PORT}/")
        print(f"  page: http://localhost:{PORT}/   (close this window to stop)")
        srv.serve_forever()


if __name__ == "__main__":
    run()
