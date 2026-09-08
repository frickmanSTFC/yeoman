"""Build names.json (game entity id -> display name) from the game's cached translations."""
import json, os
import locale_dump, paths

OUT = os.path.join(paths.DATA, "names.json")


def build():
    cats = locale_dump.load()
    entity, loca = {}, {}
    # "entity" holds several strings per game id (name, description, ...). ponytail: the shortest one is the name.
    for t in cats["entity"]["translations"].values():
        i, text = t.get("id", ""), t.get("text", "")
        if i and text and (i not in entity or len(text) < len(entity[i])):
            entity[i] = text
    # resource names are keyed by loca id (ResourceSpec.IdRefs.LocaId) in these tables
    for cat in ("materials", "resources", "resources_mb", "mining", "research", "ships", "starbase_modules"):
        for k, t in cats.get(cat, {"translations": {}})["translations"].items():
            if t.get("text"):
                loca.setdefault(str(k), t["text"])
    os.makedirs(paths.DATA, exist_ok=True)
    json.dump({"entity": entity, "loca": loca}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    return len(entity) + len(loca)


if __name__ == "__main__":
    print(f"wrote {build()} names to {OUT}")
