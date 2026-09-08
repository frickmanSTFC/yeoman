"""Decode STFC's LocaleDB/locale_<lang>.bin (protobuf LocalizationCacheData) with no deps.

Usage:
  python locale_dump.py                 # list categories
  python locale_dump.py <category> [out.json]   # dump one category as {key: text}
"""
import json, os, sys

LOCALE_BIN = os.path.expandvars(
    r"%USERPROFILE%\AppData\LocalLow\Digit Game Studios Ltd_\Star Trek Fleet Command\LocaleDB\locale_en.bin")


# ponytail: minimal wire-format reader; enough for this one file. Swap for `protobuf` pkg if it grows.
def varint(b, i):
    r = s = 0
    while True:
        c = b[i]; i += 1
        r |= (c & 0x7F) << s; s += 7
        if not c & 0x80:
            return r, i


def fields(b):
    """Yield (field_no, wire_type, value) for one message."""
    i, n = 0, len(b)
    while i < n:
        try:
            tag, i = varint(b, i)
            f, wt = tag >> 3, tag & 7
            if wt == 0:
                v, i = varint(b, i)
            elif wt == 1:
                v, i = b[i:i + 8], i + 8
            elif wt == 2:
                l, i = varint(b, i); v, i = b[i:i + l], i + l
            elif wt == 5:
                v, i = b[i:i + 4], i + 4
            else:
                raise ValueError(f"wire type {wt}")
        except IndexError:   # the game leaves a few trailing bytes after the last message
            return
        yield f, wt, v


def s64(v):  # int64 varints are two's complement in 64 bits
    return v - (1 << 64) if v >= (1 << 63) else v


def load(path=LOCALE_BIN):
    data = open(path, "rb").read()
    cats = {}
    for f, wt, v in fields(data):
        if f != 2:
            continue
        cat_key = None; cat = {"info": {}, "translations": {}}
        for f2, _, v2 in fields(v):           # map entry: 1=key, 2=CachedCategory
            if f2 == 1:
                cat_key = s64(v2)
            elif f2 == 2:
                for f3, _, v3 in fields(v2):  # CachedCategory: 1=info, 2=translations map
                    if f3 == 1:
                        for f4, _, v4 in fields(v3):
                            if f4 == 1: cat["info"]["id"] = s64(v4)
                            elif f4 == 2: cat["info"]["name"] = v4.decode()
                            elif f4 == 3: cat["info"]["dynamic"] = bool(v4)
                    elif f3 == 2:
                        tk = None; t = {}
                        for f4, _, v4 in fields(v3):
                            if f4 == 1:
                                tk = s64(v4)
                            elif f4 == 2:
                                for f5, _, v5 in fields(v4):
                                    if f5 == 1: t["id"] = v5.decode()
                                    elif f5 == 2: t["key"] = s64(v5)
                                    elif f5 == 3: t["text"] = v5.decode()
                        cat["translations"][tk] = t
        cats[cat["info"].get("name", cat_key)] = cat
    return cats


if __name__ == "__main__":
    cats = load()
    if len(sys.argv) < 2:
        for name, c in sorted(cats.items(), key=lambda kv: str(kv[0])):
            tr = c["translations"]
            sample = next(iter(tr.values()), {})
            print(f"{str(name):40} {len(tr):6}  e.g. {sample.get('id','')!r} -> {sample.get('text','')[:40]!r}")
    else:
        c = cats[sys.argv[1]]
        out = {str(k): v.get("text", "") for k, v in c["translations"].items()}
        if len(sys.argv) > 2:
            json.dump(out, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=0)
            print(f"wrote {len(out)} entries to {sys.argv[2]}")
        else:
            print(json.dumps(out, ensure_ascii=False, indent=1)[:3000])
