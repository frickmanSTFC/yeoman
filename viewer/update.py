"""Self-update from the GitHub 'latest' release.

check()  -> what GitHub has vs what this exe was built from (a commit sha baked in at build time).
apply()  -> download the zip, unpack Yeoman.exe next to this one, hand over to it and exit.

Windows will not let a running exe be overwritten, but it will let it be renamed. So the running
file becomes Yeoman.old.exe, the new one takes its name, the new one starts, the old process ends.
The next start-up deletes Yeoman.old.exe. Plain urllib; no token, public repo, 60 requests/hour.
"""
import io, json, os, subprocess, sys, threading, time, urllib.request, zipfile
import paths

REPO = "frickmanSTFC/yeoman"
API = f"https://api.github.com/repos/{REPO}/releases/latest"
EXE = sys.executable if paths.FROZEN else None
_last = {"checked": 0, "result": None}


def _get(url, timeout=6):
    req = urllib.request.Request(url, headers={"User-Agent": f"Yeoman/{paths.VERSION}", "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def check(force=False):
    """{"installed": sha, "latest": sha, "name": release name, "available": bool, "url": zip url, "error": str}"""
    if not force and _last["result"] and time.time() - _last["checked"] < 600:
        return _last["result"]
    out = {"installed": paths.BUILD_SHA, "latest": None, "name": None, "available": False, "url": None, "error": None}
    try:
        rel = json.loads(_get(API))
        body = rel.get("body") or ""
        sha = body.split("Built from", 1)[1].split()[0].strip(".") if "Built from" in body else None
        asset = next((a for a in rel.get("assets", []) if a["name"].endswith(".zip")), None)
        out.update(latest=sha, name=rel.get("name"), url=asset and asset["browser_download_url"],
                   published=rel.get("published_at"))
        # a local build (no sha) never claims to be current; it just cannot compare
        out["available"] = bool(sha and asset and paths.BUILD_SHA and sha != paths.BUILD_SHA)
    except Exception as e:  # offline, rate limited, odd answer: say so, never crash the page
        out["error"] = str(e).split("\n")[0][:120]
    _last.update(checked=time.time(), result=out)
    return out


def apply():
    """Download and swap. Returns a message; the actual restart happens a moment later."""
    if not EXE:
        return "running from source; git pull instead"
    info = check(force=True)
    if not info["url"]:
        return "no release zip found" + (f" ({info['error']})" if info["error"] else "")
    folder = os.path.dirname(EXE)
    new = os.path.join(folder, "Yeoman.new.exe")
    try:
        data = _get(info["url"], timeout=120)
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            member = next(n for n in z.namelist() if n.lower().endswith("yeoman.exe"))
            with z.open(member) as src, open(new, "wb") as dst:
                dst.write(src.read())
    except Exception as e:
        return f"download failed: {e}"
    if os.path.getsize(new) < 5_000_000:
        os.remove(new); return "downloaded file looks wrong, kept the old one"
    threading.Thread(target=_swap, args=(folder, new), daemon=True).start()
    return "update downloaded; restarting…"


def _swap(folder, new):
    time.sleep(1.5)                       # let the page get its reply first
    old = os.path.join(folder, "Yeoman.old.exe")
    try:
        if os.path.exists(old):
            os.remove(old)
        os.rename(EXE, old)               # a running exe can be renamed, not overwritten
        os.rename(new, EXE)
    except OSError as e:
        print(f"  update: could not swap files ({e})"); return
    # Hand over through a detached helper: it waits until this process is gone (port free, temp
    # folder released), then starts the new exe. PyInstaller marks its unpack folder in the
    # environment; the helper gets a clean one so the new exe unpacks afresh.
    env = {k: v for k, v in os.environ.items() if k != "_MEIPASS2" and not k.startswith("_PYI_")}
    flags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    subprocess.Popen(f'cmd /c "timeout /t 3 /nobreak >nul & start "" "{EXE}""', cwd=folder, env=env,
                     creationflags=flags, close_fds=True, shell=False)
    os._exit(0)


def cleanup():
    """Called at start-up: drop the previous exe left behind by a swap."""
    if EXE:
        old = os.path.join(os.path.dirname(EXE), "Yeoman.old.exe")
        for _ in range(5):                # the old process may still be closing
            try:
                if os.path.exists(old):
                    os.remove(old)
                return
            except OSError:
                time.sleep(1)
