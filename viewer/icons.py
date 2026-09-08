"""Export resource icons from the game's Unity cache to data/icons/*.png and write data/icons.json.

icons.json: {"by_name": {spriteName: file}, "by_id": {artId: file}}
Rerun after a game update.  Requires: pip install UnityPy
"""
import glob, json, os, re
import UnityPy
import paths

CACHE = os.path.expandvars(r"%USERPROFILE%\AppData\LocalLow\Unity\Digit Game Studios Ltd__Star Trek Fleet Command")
OUT = paths.ICONS
INDEX = os.path.join(paths.DATA, "icons.json")
# Small icons first; the large bundle is only there to fill gaps, and an existing file is never
# overwritten, so a name found in both keeps the small art.
BUNDLES = ("resource_icons", "resource_icons_large")


def newest_bundle():
    """Path of the most recent icon bundle file, or None when the game cache is not there."""
    files = [f for b in BUNDLES for f in glob.glob(os.path.join(CACHE, b, "*", "__data"))]
    return max(files, key=os.path.getmtime) if files else None


def export():
    os.makedirs(OUT, exist_ok=True)
    by_name, by_id = {}, {}
    for b in BUNDLES:
        for f in glob.glob(os.path.join(CACHE, b, "*", "__data")):
            env = UnityPy.load(f)
            for o in env.objects:
                if o.type.name != "Sprite":
                    continue
                d = o.read()
                name = d.m_Name
                safe = re.sub(r"[^A-Za-z0-9_.-]", "_", name)
                path = os.path.join(OUT, safe + ".png")
                if not os.path.exists(path):
                    try:
                        d.image.save(path)
                    except Exception as e:  # a few sprites reference missing atlases
                        print("skip", name, e)
                        continue
                rel = f"data/icons/{safe}.png"
                by_name[name] = rel
                # art id is the first 3-6 digit group, e.g. Token_10061_Raw_Isogenite_Small
                # only item-style sprites carry art ids; SkillNode_/ResearchBuff_ numbers are something else
                m = re.match(r"(?:Token|Resource|Consumable|FtechToken|Chip)_0*(\d{2,6})_", name)
                if m:
                    by_id.setdefault(m.group(1), rel)   # zero padding stripped: Token_09827_... -> 9827
    json.dump({"by_name": by_name, "by_id": by_id}, open(INDEX, "w"))
    return len(by_name)


if __name__ == "__main__":
    print(f"exported {export()} icons -> {OUT}")
