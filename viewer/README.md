# Yeoman

A live companion page for Star Trek Fleet Command on PC. It shows your fleets, mining, loot
history, build and research milestones, and battle results in a browser tab, updated while you play.

It has two parts:

- **The mod.** A build of the [STFC Community Mod](https://github.com/netniv/stfc-mod) (GPL v3)
  with extra export patches. It writes small JSON logs into a `yeoman` folder inside the game folder.
- **Yeoman.exe.** Installs the mod, reads those logs, serves the page on `http://localhost:8765/`.

## Install

1. Close the game.
2. Put `Yeoman.exe` in a folder of its own, for example `C:\Yeoman`.
3. Double-click `Yeoman.exe`. The first run:
   - asks where the game is, if it is not in the usual place, and remembers the answer;
   - copies the mod into the game folder (the old `version.dll`, if any, is kept as a `.bak` file);
   - stops there for icons and names until the game has run once.
4. Start the game. Play for a minute so the mod writes its first logs.
5. Run `Yeoman.exe` again. It exports icons from the game's own cache (a few minutes, once),
   builds the name table, and opens the page.

From then on: start the game, run `Yeoman.exe`. Close the Yeoman window to stop the page.

## Updates

A new `Yeoman.exe` carries a new mod. Close the game, run the new exe once, start the game.
Every game update breaks the mod until a new Yeoman is built, so expect a new exe after game patches.

## Where things live

| What | Where |
|---|---|
| `settings.json` | next to `Yeoman.exe`, holds the game folder |
| `data\` | next to `Yeoman.exe`: `names.json`, `icons.json`, `icons\*.png` |
| game logs | `<game>\yeoman\` |
| the mod | `<game>\version.dll` |

Nothing leaves your PC. The page is only reachable from your own machine.

## Settings

The **Settings** tab on the page holds the theme, the alarm, the game folder, the battle journal
switches and the names/icons refresh buttons. The battle journal switches are stored in the mod's own
settings file, `<game>\community_patch_settings.toml`, under `[yeoman]`, and apply on the next game start:

```toml
[yeoman]
battlejournals = true       # save one file per battle for the Battles tab
battlejournal_days = 30     # delete saved battles older than this at game start (0 = keep all)
```

## Help, license, thanks

The Settings tab links to an About page with a FAQ, the license (GPL v3, built on the STFC
Community Mod) and thanks. Same page from source: `about.html`.

## Running from source

```
pip install UnityPy
python app.py
```

Build the exe with `build.ps1` (needs `pip install pyinstaller` and a mod build in `..\stfc-mod`).
