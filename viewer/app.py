"""Yeoman start-up. Run this (or Yeoman.exe): it finds the game, installs or updates the mod,
refreshes names and icons when they are stale, then serves the page and opens the browser."""
import hashlib, os, shutil, subprocess, sys, time
import paths

MOD_SRC = os.path.join(getattr(sys, "_MEIPASS", paths.BASE), "mod", "version.dll")
MOVED = ("community_patch_fleets.json", "community_patch_resources.json", "community_patch_specs.json",
         "community_patch_icons.json", "community_patch_components.json", "community_patch_hulls.json",
         "community_patch_images.json", "community_patch_avatars.json", "community_patch_loot.jsonl",
         "community_patch_milestones.jsonl", "community_patch_mining.jsonl", "community_patch_battles.jsonl",
         "battles")


def say(msg):
    print(f"  {msg}", flush=True)


def find_game():
    g = paths.game()
    while not g:
        print("Where is the game? Paste the folder that holds prime.exe, for example")
        print(r"  C:\Games\Star Trek Fleet Command\Star Trek Fleet Command\default\game")
        g = input("> ").strip().strip('"')
        if not paths.is_game_dir(g):
            print("No prime.exe there. Try again.")
            g = None
    s = paths.settings(); s["game"] = g; paths.save_settings(s)
    return g


def game_running():
    out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq prime.exe"], capture_output=True, text=True).stdout
    return "prime.exe" in out


def sha(p):
    with open(p, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def install_mod(game):
    if not os.path.isfile(MOD_SRC):
        say("no mod bundled, skipping install"); return
    dst = os.path.join(game, "version.dll")
    if os.path.isfile(dst) and sha(dst) == sha(MOD_SRC):
        say("mod is up to date"); return
    if game_running():
        say("mod update waiting: close the game and run Yeoman again"); return
    if os.path.isfile(dst):
        shutil.copy2(dst, dst + ".bak-" + time.strftime("%Y-%m-%d"))
    shutil.copy2(MOD_SRC, dst)
    say("mod installed" if not os.path.isfile(dst + ".bak-" + time.strftime("%Y-%m-%d")) else "mod updated (old one kept as .bak)")


def move_old_exports(game):
    """One-time: files the mod used to write straight into the game folder now live in game\\yeoman."""
    exp = paths.export(); os.makedirs(exp, exist_ok=True)
    n = 0
    for name in MOVED:
        src, dst = os.path.join(game, name), os.path.join(exp, name)
        if not os.path.exists(src):
            continue
        if not os.path.exists(dst):
            shutil.move(src, dst)
        elif name.endswith(".jsonl"):        # an older mod kept appending here: keep those lines too
            with open(src, "rb") as a, open(dst, "ab") as b:
                shutil.copyfileobj(a, b)
            os.remove(src)
        elif name == "battles":
            for f in os.listdir(src):
                if not os.path.exists(os.path.join(dst, f)):
                    shutil.move(os.path.join(src, f), dst)
            shutil.rmtree(src, ignore_errors=True)
        else:
            os.remove(src)
        n += 1
    if n:
        say(f"moved {n} older log files into {paths.EXPORT_DIR}\\")


def newer(a, b):
    """True when file a exists and b is missing or older than a."""
    return os.path.isfile(a) and (not os.path.isfile(b) or os.path.getmtime(a) > os.path.getmtime(b))


def refresh_names():
    import locale_dump, names
    if newer(locale_dump.LOCALE_BIN, names.OUT):
        try:
            say(f"names: {names.build()} entries")
        except Exception as e:
            say(f"names not built ({e}); the page shows ids until the game has run once")
    else:
        say("names are current")


def refresh_icons():
    import icons
    bundle = icons.newest_bundle()
    if bundle and newer(bundle, icons.INDEX):
        say("icons: exporting from the game's cache, first time takes a few minutes…")
        n = icons.export()
        say(f"icons: {n} exported")
    elif os.path.isfile(icons.INDEX):
        say("icons are current")
    else:
        say("icons: game cache not found yet; run Yeoman again after the game has started once")


def already_running():
    import socket, serve
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", serve.PORT)) == 0


def register_autostart():
    """Tell the mod where this exe is so the game starts Yeoman itself. Only for the built exe."""
    if not paths.FROZEN:
        return
    import settings_api
    settings_api.write_toml({"exe": sys.executable})


def main():
    print("Yeoman")
    if already_running():
        say("Yeoman is already running; opening the page")
        import webbrowser, serve
        webbrowser.open(f"http://localhost:{serve.PORT}/")
        return
    game = find_game()
    say(f"game: {game}")
    install_mod(game)
    register_autostart()
    move_old_exports(game)
    refresh_names()
    refresh_icons()
    import serve
    serve.run()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(f"\nSomething went wrong: {e}")
        input("Press Enter to close.")
