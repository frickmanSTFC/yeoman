"""Where Yeoman keeps things.

  BASE     folder holding Yeoman.exe (or these scripts when run from source)
  DATA     BASE\\data      names.json, icons.json, icons\\*.png  (made on this PC)
  WEB      index.html and the .js files (inside the exe when frozen)
  game()   the game folder, from settings.json or the usual place
  export() game\\yeoman     everything the mod writes for us
"""
import json, os, sys

VERSION = "0.5 beta"
FROZEN = getattr(sys, "frozen", False)
BASE = os.path.dirname(sys.executable if FROZEN else os.path.abspath(__file__))
WEB = os.path.join(getattr(sys, "_MEIPASS", BASE), "web") if FROZEN else BASE
DATA = os.path.join(BASE, "data")
ICONS = os.path.join(DATA, "icons")
SETTINGS = os.path.join(BASE, "settings.json")
DEFAULT_GAME = r"C:\Games\Star Trek Fleet Command\Star Trek Fleet Command\default\game"
EXPORT_DIR = "yeoman"       # must match FILE_DEF_EXPORT_DIR in the mod


def settings():
    try:
        with open(SETTINGS, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_settings(d):
    with open(SETTINGS, "w", encoding="utf-8") as f:
        json.dump(d, f, indent=2)


def is_game_dir(p):
    return bool(p) and os.path.isfile(os.path.join(p, "prime.exe"))


def game():
    p = settings().get("game")
    if is_game_dir(p):
        return p
    if is_game_dir(DEFAULT_GAME):
        return DEFAULT_GAME
    return None


def export():
    return os.path.join(game(), EXPORT_DIR)
