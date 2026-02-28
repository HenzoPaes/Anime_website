#!/usr/bin/env python3
"""
Anime Admin Panel — GUI Edition  v4
Requires: pip install customtkinter pillow requests playwright
          playwright install chromium
"""

from __future__ import annotations
import re, os, sys, time, json, subprocess, threading, io
from datetime import datetime
from urllib.parse import quote_plus, urljoin

# ── Playwright (opcional – necessário só para banner CR) ──────────────────────
try:
    from playwright.sync_api import sync_playwright as _sync_playwright
    PLAYWRIGHT_OK = True
except ImportError:
    PLAYWRIGHT_OK = False

LOG_FILE = "anime_admin_log.json"  # persiste histórico entre sessões

# ── Dependency check ──────────────────────────────────────────────────────────
missing = []
try:
    import customtkinter as ctk
except ImportError:
    missing.append("customtkinter")
try:
    from PIL import Image, ImageTk, ImageDraw
except ImportError:
    missing.append("pillow")
try:
    import requests
except ImportError:
    missing.append("requests")

if missing:
    print(f"Instale as dependencias: pip install {' '.join(missing)}")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────
GITHUB_RAW_URL = "https://raw.githubusercontent.com/HenzoPaes/Anime_website/refs/heads/data/output.json"
GITHUB_REPO    = "https://github.com/HenzoPaes/Anime_website.git"
GIT_BRANCH     = "data"
ANIMES_FOLDER  = "./api/Animes"
OUTPUT_FILE    = "output.json"
ANIVIDEO_WRAP  = "https://api.anivideo.net/videohls.php"
ANIVIDEO_CDN   = "https://cdn-s01.mywallpaper-4k-image.net/stream"

# ── Palette ───────────────────────────────────────────────────────────────────
BG         = "#0a0a14"
BG2        = "#0f0f1e"
BG3        = "#161628"
SIDEBAR    = "#0c0c1a"
ACCENT     = "#7c3aed"
ACCENT2    = "#a855f7"
SUCCESS    = "#10b981"
DANGER     = "#ef4444"
WARNING    = "#f59e0b"
TEXT       = "#e2e8f0"
TEXT_DIM   = "#64748b"
TEXT_MUTED = "#374151"
BORDER     = "#1e1e3f"
CARD       = "#111126"
ONLINE     = "#22c55e"
MOVIE_CLR  = "#f59e0b"

# ─────────────────────────────────────────────────────────────────────────────
# BUSINESS LOGIC
# ─────────────────────────────────────────────────────────────────────────────
def make_iframe(src: str) -> str:
    return f'<iframe width="100%" height="100%" src="{src}" frameborder="0" allowfullscreen></iframe>'

def anivideo_url(path: str, ep: int) -> str:
    cdn = f"{ANIVIDEO_CDN}/{path}/{ep:02d}.mp4/index.m3u8"
    nc  = int(time.time() * 1000)
    return f"{ANIVIDEO_WRAP}?d={cdn}&nocache{nc}"

def extract_av_path(iframe_html: str) -> str | None:
    m = re.search(r'/stream/([a-z]/[^/]+)/\d{2}\.mp4', iframe_html or "", re.I)
    return m.group(1) if m else None

def av_ep_exists(path: str, ep: int) -> bool:
    url = f"{ANIVIDEO_CDN}/{path}/{ep:02d}.mp4/index.m3u8"
    try:
        r = requests.head(url, timeout=8, allow_redirects=True)
        return r.status_code < 400
    except:
        return False

# ── MAL: busca dados completos do anime ──────────────────────────────────────
# ── Copiado exatamente do script de extração ─────────────────────────────────
def fetch_mal_info(query: str) -> dict | None:
    """Cópia exata de fetch_mal_info do script extrator."""
    url = f"https://api.jikan.moe/v4/anime?q={query}&limit=1"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        if data.get('data'):
            return data['data'][0]
    except Exception as e:
        pass
    return None

# Alias para compatibilidade com o resto do código
def fetch_mal(query: str) -> dict | None:
    return fetch_mal_info(query)

def fetch_mal_by_id(mal_id: int) -> dict | None:
    try:
        r = requests.get(f"https://api.jikan.moe/v4/anime/{mal_id}", timeout=12)
        r.raise_for_status()
        return r.json().get("data")
    except:
        return None

def mal_to_season_data(mal: dict, s_num: int, is_movie=False) -> dict:
    """Extrai todos os campos do retorno do MAL — mesma lógica do script extrator."""
    title_r  = mal.get('title', '')
    title_j  = mal.get('title_japanese', title_r)
    genres   = [g['name'] for g in mal.get('genres', [])]
    studios  = [s['name'] for s in mal.get('studios', [])]
    studio   = studios[0] if studios else "Desconhecido"
    mal_id   = mal.get('mal_id', 0)
    cover    = mal.get('images', {}).get('jpg', {}).get('large_image_url', '')
    score    = float(mal.get('score') or 0.0)
    synopsis = mal.get('synopsis', 'Sem sinopse disponível.')
    trailer  = (mal.get('trailer') or {}).get('url') or ''
    year     = mal.get('year') or datetime.now().year
    eps_tot  = int(mal.get('episodes') or 1)

    # Status: cópia exata do script extrator
    _s = mal.get('status', '')
    if _s == "Finished Airing":
        status = "finished"
    elif _s == "Currently Airing":
        status = "ongoing"
    elif _s in ("Not yet aired", "On Hiatus"):
        status = "paused"
    else:
        status = "ongoing"

    # Runtime (filmes): "110 min" → 110
    dur_str = mal.get('duration') or "0 min"
    try:
        runtime = int(dur_str.split(" ")[0])
    except:
        runtime = 0

    rating = mal.get('rating') or ''

    return {
        "title_r":  title_r,
        "title_j":  title_j,
        "studio":   studio,
        "genres":   genres,
        "mal_id":   mal_id,
        "cover":    cover,
        "year":     year,
        "status":   status,
        "score":    score,
        "eps_tot":  eps_tot,
        "synopsis": synopsis,
        "trailer":  trailer,
        "runtime":  runtime,
        "rating":   rating,
    }

# ── Crunchyroll Banner — cópia exata do script extrator ──────────────────────
CR_KEYART_RE = re.compile(r'/keyart/([A-Z0-9]+)-', re.IGNORECASE)

def build_crunchyroll_banner_url(keyart_id, width=1920, quality=85, blur=0, variant="backdrop_wide"):
    """Cópia exata de build_crunchyroll_banner_url do script extrator."""
    return (
        f"https://imgsrv.crunchyroll.com/cdn-cgi/image/"
        f"fit=cover,format=auto,quality={quality},width={width},blur={blur}"
        f"/keyart/{keyart_id}-{variant}"
    )

def _fetch_cr_banner_with_context(anime_name, context, fallback=""):
    """
    Cópia exata de fetch_crunchyroll_banner do script extrator.
    Recebe um playwright context já aberto e reutiliza ele.
    """
    search_url = f"https://www.crunchyroll.com/pt-br/search?q={quote_plus(anime_name)}"
    page = context.new_page()
    try:
        page.set_extra_http_headers({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })

        # 1) Busca na Crunchyroll
        page.goto(search_url, wait_until="domcontentloaded", timeout=20000)
        try:
            page.wait_for_selector("a[href*='/series/']", timeout=10000)
        except Exception:
            return fallback

        # 2) Acessa a página da série
        series_href = page.locator("a[href*='/series/']").first.get_attribute("href")
        if not series_href:
            return fallback
        series_url = urljoin("https://www.crunchyroll.com", series_href)
        page.goto(series_url, wait_until="domcontentloaded", timeout=20000)

        # 3) Extrai o keyart ID de qualquer srcset ou src que contenha /keyart/
        try:
            page.wait_for_selector("source[srcset*='keyart']", timeout=8000)
        except Exception:
            pass  # tenta mesmo assim

        keyart_id = None

        # Tenta primeiro nos srcset dos <source>
        for source in page.locator("source[srcset*='keyart']").all():
            srcset = source.get_attribute("srcset") or ""
            m = CR_KEYART_RE.search(srcset)
            if m:
                keyart_id = m.group(1)
                break

        # Fallback: procura em qualquer atributo src/srcset da página inteira
        if not keyart_id:
            html = page.content()
            m = CR_KEYART_RE.search(html)
            if m:
                keyart_id = m.group(1)

        if not keyart_id:
            return fallback

        banner_url = build_crunchyroll_banner_url(keyart_id)
        return banner_url

    except Exception:
        return fallback
    finally:
        try:
            page.close()
        except Exception:
            pass

def fetch_crunchyroll_banner(anime_name: str, fallback: str = "") -> str:
    """
    Wrapper que abre playwright, cria context e chama a lógica exata do script.
    Retorna fallback se playwright não instalado ou falhar.
    """
    if not PLAYWRIGHT_OK:
        return fallback
    try:
        with _sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            try:
                return _fetch_cr_banner_with_context(anime_name, context, fallback)
            finally:
                try: browser.close()
                except: pass
    except Exception:
        return fallback

# ── DB helpers ────────────────────────────────────────────────────────────────
def load_db() -> list:
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, encoding="utf-8") as f:
            return json.load(f)
    return []

def save_db(db: list):
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    if os.path.exists(ANIMES_FOLDER):
        for anime in db:
            aid = anime.get("id")
            if aid:
                fp = os.path.join(ANIMES_FOLDER, f"{aid}.json")
                with open(fp, "w", encoding="utf-8") as f:
                    json.dump(anime, f, ensure_ascii=False, indent=2)

def find_anime(db: list, q: str) -> dict | None:
    ql = q.lower().strip()
    for a in db:
        if a.get("id", "").lower() == ql or ql in a.get("title", "").lower():
            return a
    return None

# ── Episode update logic ──────────────────────────────────────────────────────
def get_audio_ep_counts(anime: dict) -> list[dict]:
    result = []
    for season in anime.get("seasons", []):
        audios    = season.get("audios", [])
        has_sub   = next((a.get("available", False) for a in audios if a["type"] == "sub"), False)
        has_dub   = next((a.get("available", False) for a in audios if a["type"] == "dub"), False)
        sub_count = next((a.get("episodesAvailable", 0) for a in audios if a["type"] == "sub"), 0)
        dub_count = next((a.get("episodesAvailable", 0) for a in audios if a["type"] == "dub"), 0)
        result.append({
            "season": season.get("season", "?"),
            "label":  season.get("seasonLabel", f"S{season.get('season','?')}"),
            "type":   season.get("type", "series"),
            "sub":    sub_count if has_sub else None,
            "dub":    dub_count if has_dub else None,
            "max":    season.get("episodes", 0),
            "status": season.get("status", "?"),
        })
    return result

def check_next_ep_per_audio(anime: dict) -> list[dict]:
    results = []
    for season in anime.get("seasons", []):
        if season.get("status") == "finished" and season.get("type") != "movie":
            continue
        ep_list = season.get("episodeList", [])
        if not ep_list:
            continue
        s_num  = season["season"]
        audios = season.get("audios", [])
        sub_path = dub_path = None
        sub_cur = dub_cur = 0
        for ep in reversed(ep_list):
            embeds = ep.get("embeds", {})
            if sub_path is None and embeds.get("sub"):
                sub_path = extract_av_path(embeds["sub"])
                sub_cur  = ep["number"]
            if dub_path is None and embeds.get("dub"):
                dub_path = extract_av_path(embeds["dub"])
                dub_cur  = ep["number"]
            if sub_path and dub_path:
                break
        for aud in audios:
            if aud["type"] == "sub" and aud.get("available") and sub_path:
                cur = max(sub_cur, aud.get("episodesAvailable", sub_cur))
                next_e = cur + 1
                max_e  = season.get("episodes", 0)
                if max_e and next_e > max_e:
                    continue
                results.append({"season": s_num, "label": season.get("seasonLabel", f"S{s_num}"),
                                 "audio": "sub", "audio_label": "Legendado", "current": cur,
                                 "next_ep": next_e, "max": max_e, "path": sub_path, "available": None})
            if aud["type"] == "dub" and aud.get("available") and dub_path:
                cur = max(dub_cur, aud.get("episodesAvailable", dub_cur))
                next_e = cur + 1
                max_e  = season.get("episodes", 0)
                if max_e and next_e > max_e:
                    continue
                results.append({"season": s_num, "label": season.get("seasonLabel", f"S{s_num}"),
                                 "audio": "dub", "audio_label": "Dublado", "current": cur,
                                 "next_ep": next_e, "max": max_e, "path": dub_path, "available": None})
    return results

def try_add_next_ep(anime: dict) -> list[str]:
    logs = []
    for season in anime.get("seasons", []):
        if season.get("status") == "finished" and season.get("type") != "movie":
            continue
        s_num   = season["season"]
        ep_list = season.get("episodeList", [])
        audios  = season.get("audios", [])
        max_e   = season.get("episodes", 0)
        if not ep_list:
            continue
        logs.append(f"  ── S{s_num} — {season.get('seasonLabel', '')} ──")
        ep_map: dict[int, dict] = {int(ep["number"]): ep for ep in ep_list}
        last_sub_num = last_dub_num = 0
        last_sub_path = last_dub_path = None
        for ep in ep_list:
            num    = int(ep["number"])
            embeds = ep.get("embeds", {}) or {}
            if embeds.get("sub"):
                last_sub_num  = max(last_sub_num, num)
                p = extract_av_path(embeds["sub"])
                if p: last_sub_path = p
            if embeds.get("dub"):
                last_dub_num  = max(last_dub_num, num)
                p = extract_av_path(embeds["dub"])
                if p: last_dub_path = p
        aud_sub = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "sub" and a.get("available")), 0)
        aud_dub = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "dub" and a.get("available")), 0)
        sub_cur = max(last_sub_num, int(aud_sub or 0))
        dub_cur = max(last_dub_num, int(aud_dub or 0))
        any_added = False

        # ── SUB ──
        if last_sub_path:
            sub_next = sub_cur + 1
            if not (max_e and sub_next > max_e):
                logs.append(f"    [LEG] Atual: {sub_cur:02d} → Checando {sub_next:02d}...")
                if av_ep_exists(last_sub_path, sub_next):
                    logs.append(f"    [LEG] ✅ Ep {sub_next:02d} disponível!")
                    if sub_next in ep_map:
                        ep_map[sub_next].setdefault("embeds", {})["sub"] = make_iframe(anivideo_url(last_sub_path, sub_next))
                    else:
                        ep_map[sub_next] = {"id": f"{anime['id']}-s{s_num}-ep{sub_next}", "number": sub_next,
                                            "title": f"{anime.get('titleRomaji', anime['title'])} - T{s_num} Ep {sub_next}",
                                            "season": str(s_num), "embeds": {"sub": make_iframe(anivideo_url(last_sub_path, sub_next))},
                                            "embedCredit": "api.anivideo.net"}
                    for aud in audios:
                        if aud.get("type") == "sub": aud["episodesAvailable"] = sub_next
                    any_added = True
                else:
                    logs.append(f"    [LEG] ❌ Ep {sub_next:02d} não disponível.")
        else:
            logs.append(f"    [LEG] ⚠️ sem stream_path.")

        # ── DUB ──
        if last_dub_path:
            dub_next = dub_cur + 1
            if not (max_e and dub_next > max_e):
                logs.append(f"    [DUB] Atual: {dub_cur:02d} → Checando {dub_next:02d}...")
                if av_ep_exists(last_dub_path, dub_next):
                    logs.append(f"    [DUB] ✅ Ep {dub_next:02d} disponível!")
                    if dub_next in ep_map:
                        ep_map[dub_next].setdefault("embeds", {})["dub"] = make_iframe(anivideo_url(last_dub_path, dub_next))
                    else:
                        ep_map[dub_next] = {"id": f"{anime['id']}-s{s_num}-ep{dub_next}", "number": dub_next,
                                            "title": f"{anime.get('titleRomaji', anime['title'])} - T{s_num} Ep {dub_next}",
                                            "season": str(s_num), "embeds": {"dub": make_iframe(anivideo_url(last_dub_path, dub_next))},
                                            "embedCredit": "api.anivideo.net"}
                    for aud in audios:
                        if aud.get("type") == "dub": aud["episodesAvailable"] = dub_next
                    any_added = True
                else:
                    logs.append(f"    [DUB] ❌ Ep {dub_next:02d} não disponível.")
        else:
            logs.append(f"    [DUB] ⚠️ sem stream_path.")

        if any_added:
            season["episodeList"] = sorted(ep_map.values(), key=lambda x: int(x["number"]))
            all_nums = [int(ep["number"]) for ep in season["episodeList"] if ep.get("embeds")]
            if all_nums:
                season["currentEpisode"] = max(all_nums)
            sub_done = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "sub"), 0)
            dub_done = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "dub"), 0)
            if max_e and min(int(sub_done or 0), int(dub_done or 0)) >= max_e:
                season["status"] = "finished"
                logs.append(f"    🏁 Temporada {s_num} concluída!")
    return logs

# ── Persistent log system ────────────────────────────────────────────────────
_LOG_LOCK = threading.Lock()

def _load_logs() -> list[dict]:
    if os.path.exists(LOG_FILE):
        try:
            with open(LOG_FILE, encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return []

def _save_logs(logs: list[dict]):
    try:
        with open(LOG_FILE, "w", encoding="utf-8") as f:
            json.dump(logs[-2000:], f, ensure_ascii=False, indent=2)  # máx 2000 entradas
    except:
        pass

def log_event(kind: str, title: str, detail: str = "", level: str = "info"):
    """
    kind   : "update" | "error" | "add" | "delete" | "git"
    level  : "info" | "warning" | "error"
    """
    entry = {
        "ts":     datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "kind":   kind,
        "title":  title,
        "detail": detail,
        "level":  level,
    }
    with _LOG_LOCK:
        logs = _load_logs()
        logs.append(entry)
        _save_logs(logs)

def do_git_push(msg: str) -> str:
    try:
        out = subprocess.run("git remote", shell=True, capture_output=True, text=True).stdout
        if "origin" not in out.split():
            subprocess.run(f"git remote add origin {GITHUB_REPO}", shell=True, capture_output=True)
        else:
            subprocess.run(f"git remote set-url origin {GITHUB_REPO}", shell=True, capture_output=True)
        cur = subprocess.run("git branch --show-current", shell=True, capture_output=True, text=True).stdout.strip()
        if cur != GIT_BRANCH:
            subprocess.run(f"git checkout -B {GIT_BRANCH}", shell=True, capture_output=True)
        subprocess.run("git add .", shell=True, check=True, capture_output=True)
        subprocess.run(f'git commit --allow-empty -m "{msg}"', shell=True, check=True, capture_output=True)
        r = subprocess.run(f"git push origin {GIT_BRANCH}", shell=True, capture_output=True, text=True)
        return (r.stdout + r.stderr).strip() or f"Push para '{GIT_BRANCH}' concluído!"
    except subprocess.CalledProcessError as e:
        return f"Erro git: {e}"

# ── Pillow image helpers ──────────────────────────────────────────────────────
_img_cache: dict[str, ImageTk.PhotoImage] = {}

def fetch_cover(url: str, size=(72, 102)) -> "ImageTk.PhotoImage":
    key = f"{url}_{size}"
    if key in _img_cache:
        return _img_cache[key]
    try:
        r = requests.get(url, timeout=8)
        r.raise_for_status()
        img  = Image.open(io.BytesIO(r.content)).convert("RGBA")
        img  = img.resize(size, Image.LANCZOS)
        mask = Image.new("L", size, 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size[0]-1, size[1]-1], radius=8, fill=255)
        img.putalpha(mask)
        ph = ImageTk.PhotoImage(img)
        _img_cache[key] = ph
        return ph
    except:
        return make_placeholder(size)

def make_placeholder(size=(72, 102)) -> "ImageTk.PhotoImage":
    img  = Image.new("RGBA", size, (22, 22, 45, 255))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([0, 0, size[0]-1, size[1]-1], radius=8,
                            fill=(22, 22, 45, 255), outline=(60, 60, 100, 200), width=1)
    cx, cy = size[0]//2, size[1]//2
    draw.rectangle([cx-12, cy-16, cx+12, cy+16], fill=(50, 50, 90))
    draw.text((cx-5, cy-8), "?", fill=(120, 120, 180))
    return ImageTk.PhotoImage(img)

def hex_to_rgb(h: str):
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)

# ─────────────────────────────────────────────────────────────────────────────
# WIDGETS
# ─────────────────────────────────────────────────────────────────────────────
class Sidebar(ctk.CTkFrame):
    NAV_ITEMS = [
        ("🏠", "Dashboard",     "dashboard"),
        ("📋", "Lista Animes",  "list"),
        ("➕", "Adicionar",     "add"),
        ("📂", "Importar JSON", "import"),
        ("🔄", "Auto-Update",   "update"),
        ("🔍", "Verificar Eps", "check"),
        ("📊", "Estatísticas",  "stats"),
        ("📜", "Logs & Hist.",  "logs"),
        ("─",  "",              "sep"),
        ("☁️", "Push GitHub",   "push"),
        ("⬇️", "Pull GitHub",   "pull"),
    ]

    def __init__(self, master, on_nav, **kw):
        super().__init__(master, fg_color=SIDEBAR, corner_radius=0, width=220, **kw)
        self._on_nav = on_nav
        self._btns: dict[str, ctk.CTkButton] = {}
        self._active = "dashboard"
        self._build()

    def _build(self):
        logo = ctk.CTkFrame(self, fg_color="#12082a", corner_radius=0, height=80)
        logo.pack(fill="x")
        logo.pack_propagate(False)
        ctk.CTkLabel(logo, text="🎌", font=("Segoe UI Emoji", 28)).pack(pady=(14, 0))
        ctk.CTkLabel(logo, text="ANIME ADMIN", font=("Segoe UI", 11, "bold"), text_color=ACCENT2).pack()

        ctk.CTkLabel(self, text="  MENU", font=("Segoe UI", 9, "bold"),
                     text_color=TEXT_MUTED, anchor="w").pack(fill="x", padx=12, pady=(18, 4))

        for icon, label, key in self.NAV_ITEMS:
            if key == "sep":
                ctk.CTkFrame(self, height=1, fg_color=BORDER).pack(fill="x", padx=16, pady=8)
                ctk.CTkLabel(self, text="  GIT", font=("Segoe UI", 9, "bold"),
                             text_color=TEXT_MUTED, anchor="w").pack(fill="x", padx=12, pady=(0, 4))
                continue
            btn = ctk.CTkButton(self, text=f"  {icon}  {label}", anchor="w", height=40,
                                corner_radius=8, font=("Segoe UI", 13), fg_color="transparent",
                                hover_color=BG3, text_color=TEXT_DIM,
                                command=lambda k=key: self._nav(k))
            btn.pack(fill="x", padx=8, pady=2)
            self._btns[key] = btn
        self._set_active("dashboard")

    def _nav(self, key):
        self._set_active(key)
        self._on_nav(key)

    def _set_active(self, key):
        if self._active in self._btns:
            self._btns[self._active].configure(fg_color="transparent", text_color=TEXT_DIM)
        self._active = key
        if key in self._btns:
            self._btns[key].configure(fg_color=ACCENT, text_color="white")


class AnimeCard(ctk.CTkFrame):
    def __init__(self, master, anime: dict, on_edit, on_delete, on_update, **kw):
        super().__init__(master, fg_color=CARD, corner_radius=12,
                         border_width=1, border_color=BORDER, **kw)
        self._img_ref = None
        self._build(anime, on_edit, on_delete, on_update)

    def _build(self, anime, on_edit, on_delete, on_update):
        # Cover
        img_frame = ctk.CTkFrame(self, fg_color="transparent", width=72, height=102)
        img_frame.pack(side="left", padx=(12, 8), pady=10)
        img_frame.pack_propagate(False)
        self._cover_lbl = ctk.CTkLabel(img_frame, text="", width=72, height=102)
        self._cover_lbl.pack()
        url = anime.get("coverImage", "")
        def _load():
            ph = fetch_cover(url, (72, 102))
            self._img_ref = ph
            try: self._cover_lbl.configure(image=ph, text="")
            except: pass
        threading.Thread(target=_load, daemon=True).start()

        # Info
        info = ctk.CTkFrame(self, fg_color="transparent")
        info.pack(side="left", fill="both", expand=True, pady=10)

        seasons = anime.get("seasons", [])
        last    = seasons[-1] if seasons else {}
        status  = last.get("status", "?")
        is_movie= last.get("type") == "movie"
        cur     = last.get("currentEpisode", "?")
        tot     = last.get("episodes", "?")
        score   = float(last.get("score") or 0)

        ctk.CTkLabel(info, text=anime.get("title","?")[:42], font=("Segoe UI", 14, "bold"),
                     text_color=TEXT, anchor="w").pack(anchor="w")
        ctk.CTkLabel(info, text=f"{anime.get('studio','?')}  •  {last.get('year','?')}",
                     font=("Segoe UI", 11), text_color=TEXT_DIM, anchor="w").pack(anchor="w", pady=(2,4))

        badges = ctk.CTkFrame(info, fg_color="transparent")
        badges.pack(anchor="w", pady=(0,6))
        if is_movie:
            self._badge(badges, "🎬 FILME", MOVIE_CLR)
        elif status == "ongoing":
            self._badge(badges, "● ONGOING", ONLINE)
        elif status == "paused":
            self._badge(badges, "⏸ PAUSADO", WARNING)
        else:
            self._badge(badges, "✓ FINALIZADO", ACCENT)
        self._badge(badges, f"S{len(seasons)}", "#3b82f6")
        self._badge(badges, f"EP {cur}/{tot}", "#6b7280")
        if score:
            self._badge(badges, f"★ {score}", WARNING)
        audios = {a["type"].upper() for s in seasons for a in s.get("audios",[]) if a.get("available")}
        for aud in sorted(audios):
            self._badge(badges, aud, "#8b5cf6")

        # Actions
        actions = ctk.CTkFrame(self, fg_color="transparent", width=100)
        actions.pack(side="right", padx=12, pady=10)
        actions.pack_propagate(False)
        ctk.CTkButton(actions, text="✏️", width=32, height=28, corner_radius=6,
                      fg_color=BG3, hover_color=ACCENT, font=("Segoe UI", 12),
                      command=lambda: on_edit(anime)).pack(pady=2)
        ctk.CTkButton(actions, text="🔄", width=32, height=28, corner_radius=6,
                      fg_color=BG3, hover_color=SUCCESS, font=("Segoe UI", 12),
                      command=lambda: on_update(anime)).pack(pady=2)
        ctk.CTkButton(actions, text="🗑️", width=32, height=28, corner_radius=6,
                      fg_color=BG3, hover_color=DANGER, font=("Segoe UI", 12),
                      command=lambda: on_delete(anime)).pack(pady=2)

    def _badge(self, parent, text, color):
        try:
            r, g, b = hex_to_rgb(color)
            fg = f"#{min(r+80,255):02x}{min(g+80,255):02x}{min(b+80,255):02x}"
            bg = f"#{r//4:02x}{g//4:02x}{b//4:02x}"
        except:
            fg, bg = TEXT, BG3
        ctk.CTkLabel(parent, text=text, font=("Segoe UI", 10, "bold"),
                     text_color=fg, fg_color=bg, corner_radius=5,
                     padx=6, pady=1).pack(side="left", padx=3)


class LogBox(ctk.CTkFrame):
    def __init__(self, master, **kw):
        super().__init__(master, fg_color=BG2, corner_radius=10, border_width=1, border_color=BORDER, **kw)
        self._tb = ctk.CTkTextbox(self, fg_color="transparent", text_color="#86efac",
                                   font=("Consolas", 12), state="disabled", wrap="word")
        self._tb.pack(fill="both", expand=True, padx=4, pady=4)

    def write(self, msg: str):
        self._tb.configure(state="normal")
        self._tb.insert("end", msg + "\n")
        self._tb.see("end")
        self._tb.configure(state="disabled")

    def clear(self):
        self._tb.configure(state="normal")
        self._tb.delete("1.0", "end")
        self._tb.configure(state="disabled")


class StatCard(ctk.CTkFrame):
    def __init__(self, master, label, value, color=ACCENT, icon="", **kw):
        super().__init__(master, fg_color=CARD, corner_radius=12,
                         border_width=1, border_color=BORDER, **kw)
        ctk.CTkLabel(self, text=icon, font=("Segoe UI Emoji", 20)).pack(pady=(12,0))
        ctk.CTkLabel(self, text=str(value), font=("Segoe UI", 26, "bold"), text_color=color).pack()
        ctk.CTkLabel(self, text=label, font=("Segoe UI", 11), text_color=TEXT_DIM).pack(pady=(0,12))


# ─────────────────────────────────────────────────────────────────────────────
# DIALOGS
# ─────────────────────────────────────────────────────────────────────────────
class Dialog(ctk.CTkToplevel):
    def __init__(self, master, title, width=520, height=500):
        super().__init__(master)
        self.title(title)
        self.geometry(f"{width}x{height}")
        self.configure(fg_color=BG2)
        self.resizable(True, True)
        self.grab_set()
        self.lift()
        self.focus_force()

    def _header(self, text):
        ctk.CTkLabel(self, text=text, font=("Segoe UI", 16, "bold"), text_color=ACCENT2
                     ).pack(pady=(16, 4), padx=20, anchor="w")
        ctk.CTkFrame(self, height=1, fg_color=BORDER).pack(fill="x", padx=20, pady=(0,10))

    def _field(self, parent, label: str, default: str = "", placeholder: str = "", height=36) -> ctk.StringVar:
        ctk.CTkLabel(parent, text=label, font=("Segoe UI", 12), text_color=TEXT_DIM).pack(anchor="w")
        var = ctk.StringVar(value=str(default))
        ctk.CTkEntry(parent, textvariable=var, height=height, corner_radius=8,
                     fg_color=BG3, border_color=BORDER, text_color=TEXT,
                     placeholder_text=placeholder).pack(fill="x", pady=(2, 8))
        return var

    def _textarea(self, parent, label: str, default: str = "", height=80) -> "ctk.CTkTextbox":
        ctk.CTkLabel(parent, text=label, font=("Segoe UI", 12), text_color=TEXT_DIM).pack(anchor="w")
        tb = ctk.CTkTextbox(parent, height=height, fg_color=BG3, text_color=TEXT,
                             font=("Segoe UI", 12), wrap="word")
        tb.pack(fill="x", pady=(2, 8))
        if default:
            tb.insert("1.0", default)
        return tb

    def _switch(self, parent, label: str, default=True) -> ctk.BooleanVar:
        row = ctk.CTkFrame(parent, fg_color="transparent")
        row.pack(fill="x", pady=3)
        ctk.CTkLabel(row, text=label, font=("Segoe UI", 12), text_color=TEXT_DIM).pack(side="left")
        var = ctk.BooleanVar(value=default)
        ctk.CTkSwitch(row, variable=var, text="", onvalue=True, offvalue=False,
                      progress_color=ACCENT).pack(side="right")
        return var

    def _segmented(self, parent, label: str, values: list, current: str) -> "ctk.CTkSegmentedButton":
        ctk.CTkLabel(parent, text=label, font=("Segoe UI", 12), text_color=TEXT_DIM).pack(anchor="w")
        sb = ctk.CTkSegmentedButton(parent, values=values, selected_color=ACCENT, font=("Segoe UI", 12))
        sb.set(current if current in values else values[0])
        sb.pack(fill="x", pady=(2, 8))
        return sb

    def _btn_row(self, parent, ok_text="Salvar", ok_color=SUCCESS, ok_cb=None):
        row = ctk.CTkFrame(parent, fg_color="transparent")
        row.pack(fill="x", pady=(10, 0))
        ctk.CTkButton(row, text="Cancelar", fg_color=BG3, hover_color=BORDER,
                      text_color=TEXT_DIM, command=self.destroy).pack(side="left")
        ctk.CTkButton(row, text=ok_text, fg_color=ok_color, hover_color=ACCENT2,
                      command=ok_cb).pack(side="right")

    def _sep(self, parent, label=""):
        ctk.CTkFrame(parent, height=1, fg_color=BORDER).pack(fill="x", pady=(8,4))
        if label:
            ctk.CTkLabel(parent, text=label, font=("Segoe UI", 12, "bold"),
                         text_color=ACCENT2).pack(anchor="w", pady=(0, 6))


# ── EditAnimeDialog: edita TUDO — info geral + cada temporada ────────────────
class EditAnimeDialog(Dialog):
    """
    Dialog completo de edição:
    - Aba "Geral": metadados do anime
    - Uma aba por temporada: todos os campos, incluindo campos especiais de filme
    """

    def __init__(self, master, anime: dict, on_submit):
        super().__init__(master, f"Editar — {anime.get('title','')}", 700, 620)
        self._anime      = anime
        self._on_submit  = on_submit
        self._svar_list: list[dict] = []   # uma entrada por temporada
        self._build()

    def _build(self):
        a = self._anime
        self._header(f"✏️  {a.get('title', '')[:40]}")

        tabs = ctk.CTkTabview(self, fg_color=BG3, border_color=BORDER, border_width=1)
        tabs.pack(fill="both", expand=True, padx=16, pady=(0, 8))

        # ── Aba Geral ─────────────────────────────────────────────────────────
        tab_g = tabs.add("🎌  Geral")
        sg = ctk.CTkScrollableFrame(tab_g, fg_color="transparent")
        sg.pack(fill="both", expand=True)

        self._v_title   = self._field(sg, "Título",          a.get("title", ""))
        self._v_title_j = self._field(sg, "Título Japonês",  a.get("titleJapanese", ""))
        self._v_studio  = self._field(sg, "Estúdio",         a.get("studio", ""))
        self._v_genres  = self._field(sg, "Gêneros (vírgula)", ", ".join(a.get("genre", [])))
        self._v_cover   = self._field(sg, "Cover URL",       a.get("coverImage", ""))
        self._v_banner  = self._field(sg, "Banner URL",      a.get("bannerImage", ""))
        self._v_mal_id  = self._field(sg, "MAL ID",          str(a.get("malId", "")))
        self._v_rec     = self._switch(sg, "Recomendado?",   bool(a.get("recommended", False)))

        # Botão para re-buscar dados do MAL
        mal_row = ctk.CTkFrame(sg, fg_color="transparent")
        mal_row.pack(fill="x", pady=(0, 6))
        ctk.CTkButton(mal_row, text="🔍 Re-buscar MAL", width=160, fg_color=ACCENT,
                      hover_color=ACCENT2, command=self._refetch_mal).pack(side="left")
        ctk.CTkButton(mal_row, text="☁️ Re-buscar Banner CR", width=180, fg_color="#6366f1",
                      hover_color=ACCENT2, command=self._refetch_banner).pack(side="left", padx=8)
        self._mal_status = ctk.CTkLabel(mal_row, text="", font=("Segoe UI", 11), text_color=SUCCESS)
        self._mal_status.pack(side="left", padx=8)

        # ── Abas por temporada ────────────────────────────────────────────────
        for season in a.get("seasons", []):
            s_num    = season.get("season", "?")
            is_movie = season.get("type") == "movie"
            lbl      = season.get("seasonLabel", f"S{s_num}")[:22]
            tab_icon = "🎬" if is_movie else "📺"
            tab_s    = tabs.add(f"{tab_icon}  {lbl}")
            ss       = ctk.CTkScrollableFrame(tab_s, fg_color="transparent")
            ss.pack(fill="both", expand=True)

            sv: dict = {"season_num": s_num, "is_movie": is_movie}

            # Campos comuns
            sv["label"]      = self._field(ss, "Season Label",      season.get("seasonLabel", ""))
            sv["year"]       = self._field(ss, "Ano",               str(season.get("year", "")))
            sv["episodes"]   = self._field(ss, "Total de episódios", str(season.get("episodes", "")))
            sv["current_ep"] = self._field(ss, "Episódio atual",    str(season.get("currentEpisode", "")))
            sv["score"]      = self._field(ss, "Score",             str(season.get("score", "")))
            sv["synopsis"]   = self._textarea(ss, "Sinopse",        season.get("synopsis", ""), height=90)
            sv["trailer"]    = self._field(ss, "Trailer URL",       str(season.get("trailer", "") or ""))
            sv["status"]     = self._segmented(ss, "Status", ["ongoing", "finished", "paused"],
                                               season.get("status", "ongoing"))

            # Áudios
            self._sep(ss, "🎧 Áudios")
            audios   = season.get("audios", [])
            has_sub  = next((a.get("available", False) for a in audios if a["type"] == "sub"), False)
            has_dub  = next((a.get("available", False) for a in audios if a["type"] == "dub"), False)
            sub_eps  = next((a.get("episodesAvailable", 0) for a in audios if a["type"] == "sub"), 0)
            dub_eps  = next((a.get("episodesAvailable", 0) for a in audios if a["type"] == "dub"), 0)
            sv["has_sub"] = self._switch(ss, "Tem Legendado?", has_sub)
            sv["sub_eps"] = self._field(ss, "Eps legendado disponíveis", str(sub_eps))
            sv["has_dub"] = self._switch(ss, "Tem Dublado?",   has_dub)
            sv["dub_eps"] = self._field(ss, "Eps dublado disponíveis",   str(dub_eps))

            # ── Campos extras de FILME ────────────────────────────────────────
            if is_movie:
                self._sep(ss, "🎥 Campos do Filme")
                sv["movie_title"] = self._field(ss, "Título do Filme",    season.get("movieTitle", ""))
                sv["tagline"]     = self._field(ss, "Tagline",            season.get("tagline", ""))
                sv["runtime"]     = self._field(ss, "Runtime (min)",      str(season.get("runtime", "")))
                sv["director"]    = self._field(ss, "Diretor",            season.get("director", ""))
                sv["age_rating"]  = self._field(ss, "Classificação etária", season.get("ageRating", ""))
                sv["accent"]      = self._field(ss, "Accent Color (hex)", season.get("accentColor", "#FF2E2E"))
                sv["poster"]      = self._field(ss, "Poster URL",         season.get("posterImage", ""))

                # Escolhedor de cor
                acc_row = ctk.CTkFrame(ss, fg_color="transparent")
                acc_row.pack(fill="x", pady=(0,6))
                def _pick(var=sv["accent"]):
                    from tkinter import colorchooser
                    col = colorchooser.askcolor(color=var.get())
                    if col and col[1]:
                        var.set(col[1])
                ctk.CTkButton(acc_row, text="🎨 Escolher cor", width=140, fg_color=BG3,
                              hover_color=BORDER, command=_pick).pack(side="left")

                # Stills
                stills_str = ", ".join(season.get("stills", []))
                sv["stills"] = self._field(ss, "Stills (URLs separadas por vírgula)", stills_str)

                # Cast
                cast = season.get("cast", [])
                cast_str = "\n".join(
                    f"{c.get('character','?')}|{c.get('voice','?')}|{c.get('voiceDub','?')}"
                    for c in cast
                )
                sv["cast_tb"] = self._textarea(ss, "Cast (linha: personagem|voice|voiceDub)", cast_str, height=100)

                # Awards
                awards_str = ", ".join(season.get("awards", []))
                sv["awards"] = self._field(ss, "Awards (vírgula)", awards_str)

            self._svar_list.append(sv)

        # Botões
        btn_row = ctk.CTkFrame(self, fg_color="transparent")
        btn_row.pack(fill="x", padx=20, pady=(0, 14))
        ctk.CTkButton(btn_row, text="Cancelar", fg_color=BG3, hover_color=BORDER,
                      text_color=TEXT_DIM, command=self.destroy).pack(side="left")
        ctk.CTkButton(btn_row, text="💾 Salvar Tudo", fg_color=SUCCESS, hover_color="#059669",
                      command=self._submit).pack(side="right")

    def _refetch_mal(self):
        query = self._v_title.get().strip()
        if not query:
            return
        self._mal_status.configure(text="Buscando MAL...", text_color=WARNING)
        def _worker():
            mal = fetch_mal_info(query)
            if not mal:
                self.after(0, self._mal_status.configure,
                           {"text": "❌ Não encontrado no MAL", "text_color": DANGER})
                return
            self.after(0, self._v_title.set,   mal.get('title', query))
            self.after(0, self._v_title_j.set, mal.get('title_japanese', ''))
            studios = [s['name'] for s in mal.get('studios', [])]
            self.after(0, self._v_studio.set,  studios[0] if studios else '')
            genres = ', '.join(g['name'] for g in mal.get('genres', []))
            self.after(0, self._v_genres.set,  genres)
            cover = mal.get('images', {}).get('jpg', {}).get('large_image_url', '')
            self.after(0, self._v_cover.set,   cover)
            self.after(0, self._v_mal_id.set,  str(mal.get('mal_id', '')))
            self.after(0, self._mal_status.configure,
                       {"text": f"✅ MAL: {mal.get('title','')}", "text_color": SUCCESS})
        threading.Thread(target=_worker, daemon=True).start()

    def _refetch_banner(self):
        query    = self._v_title.get().strip()
        fallback = self._v_cover.get().strip()
        self._mal_status.configure(text="Buscando banner CR... (pode demorar ~15s)", text_color=WARNING)
        def _worker():
            banner = fetch_crunchyroll_banner(query, fallback)
            self.after(0, self._v_banner.set, banner)
            if banner and banner != fallback:
                self.after(0, self._mal_status.configure,
                           {"text": "✅ Banner CR encontrado!", "text_color": SUCCESS})
            else:
                self.after(0, self._mal_status.configure,
                           {"text": "⚠️ Não encontrado — usando cover", "text_color": WARNING})
        threading.Thread(target=_worker, daemon=True).start()

    def _submit(self):
        # Geral
        result = {
            "title":   self._v_title.get(),
            "title_j": self._v_title_j.get(),
            "studio":  self._v_studio.get(),
            "genres":  [g.strip() for g in self._v_genres.get().split(",") if g.strip()],
            "cover":   self._v_cover.get(),
            "banner":  self._v_banner.get(),
            "mal_id":  self._v_mal_id.get(),
            "rec":     self._v_rec.get(),
            "seasons": [],
        }
        # Temporadas
        for sv in self._svar_list:
            sd = {
                "season_num": sv["season_num"],
                "is_movie":   sv["is_movie"],
                "label":      sv["label"].get(),
                "year":       sv["year"].get(),
                "episodes":   sv["episodes"].get(),
                "current_ep": sv["current_ep"].get(),
                "score":      sv["score"].get(),
                "synopsis":   sv["synopsis"].get("1.0", "end").strip(),
                "trailer":    sv["trailer"].get(),
                "status":     sv["status"].get(),
                "has_sub":    sv["has_sub"].get(),
                "sub_eps":    sv["sub_eps"].get(),
                "has_dub":    sv["has_dub"].get(),
                "dub_eps":    sv["dub_eps"].get(),
            }
            if sv["is_movie"]:
                sd.update({
                    "movie_title": sv["movie_title"].get(),
                    "tagline":     sv["tagline"].get(),
                    "runtime":     sv["runtime"].get(),
                    "director":    sv["director"].get(),
                    "age_rating":  sv["age_rating"].get(),
                    "accent":      sv["accent"].get(),
                    "poster":      sv["poster"].get(),
                    "stills":   [s.strip() for s in sv["stills"].get().split(",") if s.strip()],
                    "cast_raw": sv["cast_tb"].get("1.0", "end").strip(),
                    "awards":   [a.strip() for a in sv["awards"].get().split(",") if a.strip()],
                })
            result["seasons"].append(sd)

        self._on_submit(result)
        self.destroy()


# ── AddAnimeDialog ─────────────────────────────────────────────────────────────
class AddAnimeDialog(Dialog):
    def __init__(self, master, on_submit):
        super().__init__(master, "Adicionar Anime", 540, 580)
        self._on_submit = on_submit
        self._build()

    def _build(self):
        self._header("➕  Adicionar Anime")
        sc = ctk.CTkScrollableFrame(self, fg_color="transparent")
        sc.pack(fill="both", expand=True, padx=20)

        self._name    = self._field(sc, "Nome (busca MAL)",                placeholder="ex: Jujutsu Kaisen")
        self._slug    = self._field(sc, "ID Slug (vazio = auto)",           placeholder="ex: jujutsu-kaisen")
        self._eps     = self._field(sc, "Episódios disponíveis",            "0")
        self._max_eps = self._field(sc, "Máx episódios (0 = igual disp.)", "0")
        self._season  = self._field(sc, "Nº da temporada",                  "1")
        self._avslug  = self._field(sc, "AniVideo slug base (vazio=pular)", placeholder="ex: jujutsu-kaisen")

        # Include season number in URL
        row_inc = ctk.CTkFrame(sc, fg_color="transparent")
        row_inc.pack(fill="x", pady=3)
        ctk.CTkLabel(row_inc, text="Incluir nº temporada no link?", text_color=TEXT_DIM,
                     font=("Segoe UI",12)).pack(side="left")
        self._inc_season = ctk.BooleanVar(value=True)
        ctk.CTkSwitch(row_inc, variable=self._inc_season, text="", progress_color=ACCENT).pack(side="right")

        # Tipo
        row_type = ctk.CTkFrame(sc, fg_color="transparent")
        row_type.pack(fill="x", pady=6)
        ctk.CTkLabel(row_type, text="Tipo:", text_color=TEXT_DIM, font=("Segoe UI",12)).pack(side="left")
        self._type = ctk.CTkSegmentedButton(row_type, values=["Série", "Filme"],
                                             selected_color=ACCENT, font=("Segoe UI",12),
                                             command=self._toggle_movie)
        self._type.set("Série")
        self._type.pack(side="right")

        self._has_sub = self._switch(sc, "Tem Legendado?", True)
        self._has_dub = self._switch(sc, "Tem Dublado?",   False)

        # Campos de Filme (inicialmente ocultos)
        self._movie_frame = ctk.CTkFrame(sc, fg_color="transparent")
        self._mv_title  = self._field(self._movie_frame, "Título do Filme",  placeholder="ex: Chainsaw Man – Reze Arc")
        self._mv_tag    = self._field(self._movie_frame, "Tagline",           "")
        self._mv_rt     = self._field(self._movie_frame, "Runtime (min)",     "")
        self._mv_dir    = self._field(self._movie_frame, "Diretor",           "")
        self._mv_age    = self._field(self._movie_frame, "Classificação",     "ex: 16+")
        self._mv_post   = self._field(self._movie_frame, "Poster URL",        "")
        self._mv_acc    = self._field(self._movie_frame, "Accent Color",      "#FF2E2E")
        self._mv_stills = self._field(self._movie_frame, "Stills (vírgula)", "")
        self._mv_cast   = self._textarea(self._movie_frame, "Cast (personagem|voice|voiceDub)", "", height=90)
        self._mv_awards = self._field(self._movie_frame, "Awards (vírgula)", "")

        self._btn_row(sc, "➕ Adicionar", ACCENT, ok_cb=self._submit)

    def _toggle_movie(self, val):
        if val == "Filme":
            try:
                if not self._movie_frame.winfo_ismapped():
                    self._movie_frame.pack(fill="x", pady=(8,4))
            except:
                self._movie_frame.pack(fill="x", pady=(8,4))
        else:
            try: self._movie_frame.pack_forget()
            except: pass

    def _submit(self):
        data = {
            "name":      self._name.get().strip(),
            "slug":      self._slug.get().strip(),
            "eps":       self._eps.get().strip(),
            "max_eps":   self._max_eps.get().strip(),
            "season":    self._season.get().strip(),
            "avslug":    self._avslug.get().strip(),
            "is_movie":  self._type.get() == "Filme",
            "has_sub":   self._has_sub.get(),
            "has_dub":   self._has_dub.get(),
            "inc_season": self._inc_season.get(),
        }
        if data["is_movie"]:
            data.update({
                "mv_title":  self._mv_title.get().strip(),
                "mv_tag":    self._mv_tag.get().strip(),
                "mv_rt":     self._mv_rt.get().strip(),
                "mv_dir":    self._mv_dir.get().strip(),
                "mv_age":    self._mv_age.get().strip(),
                "mv_post":   self._mv_post.get().strip(),
                "mv_acc":    self._mv_acc.get().strip(),
                "mv_stills": self._mv_stills.get().strip(),
                "mv_cast":   self._mv_cast.get("1.0","end").strip(),
                "mv_awards": self._mv_awards.get().strip(),
            })
        if not data["name"]:
            return
        self._on_submit(data)
        self.destroy()


class ConfirmDialog(Dialog):
    def __init__(self, master, message, on_confirm, title="Confirmar"):
        super().__init__(master, title, 420, 190)
        self._header("⚠️  Confirmar")
        ctk.CTkLabel(self, text=message, font=("Segoe UI",13), text_color=TEXT, wraplength=360
                     ).pack(pady=16, padx=24)
        row = ctk.CTkFrame(self, fg_color="transparent")
        row.pack(padx=24, fill="x")
        ctk.CTkButton(row, text="Cancelar", fg_color=BG3, hover_color=BORDER,
                      text_color=TEXT_DIM, command=self.destroy).pack(side="left")
        def _ok():
            on_confirm()
            self.destroy()
        ctk.CTkButton(row, text="Confirmar", fg_color=DANGER, hover_color="#dc2626",
                      command=_ok).pack(side="right")


class PushDialog(Dialog):
    def __init__(self, master, on_push):
        super().__init__(master, "Git Push", 490, 200)
        self._on_push = on_push
        self._header(f"☁️  Push → branch '{GIT_BRANCH}'")
        inner = ctk.CTkFrame(self, fg_color="transparent")
        inner.pack(fill="x", padx=20)
        default = f"chore: update database [{datetime.now().strftime('%d/%m/%Y %H:%M')}]"
        self._msg = self._field(inner, "Mensagem do commit:", default)
        self._btn_row(inner, "🚀 Push", ACCENT, ok_cb=self._do)

    def _do(self):
        msg = self._msg.get().strip() or "chore: update database"
        self._on_push(msg)
        self.destroy()


class ImportDialog(Dialog):
    def __init__(self, master, on_import):
        super().__init__(master, "Importar JSON", 490, 210)
        self._on_import = on_import
        self._header("📂  Importar Anime via JSON")
        inner = ctk.CTkFrame(self, fg_color="transparent")
        inner.pack(fill="x", padx=20)
        self._path = self._field(inner, "Caminho do arquivo:", placeholder="./meu-anime.json")
        def _browse():
            from tkinter import filedialog
            p = filedialog.askopenfilename(filetypes=[("JSON","*.json")])
            if p: self._path.set(p)
        ctk.CTkButton(inner, text="Procurar...", width=110, fg_color=BG3,
                      hover_color=BORDER, command=_browse).pack(anchor="w", pady=(0,8))
        self._btn_row(inner, "Importar", SUCCESS, ok_cb=self._do)

    def _do(self):
        path = self._path.get().strip().strip('"')
        self._on_import(path)
        self.destroy()


# ─────────────────────────────────────────────────────────────────────────────
# MAIN APP
# ─────────────────────────────────────────────────────────────────────────────
class AnimeAdminApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("dark-blue")
        self.title("🎌 Anime Admin Panel — HenzoPaes")
        self.geometry("1220x760")
        self.minsize(900, 600)
        self.configure(fg_color=BG)
        self.db: list         = []
        self._log: LogBox | None = None
        self.current_page     = "dashboard"
        self._search_var: ctk.StringVar | None = None
        self._list_scroll = None
        self._build_ui()
        self.after(200, self._on_mount)

    def _build_ui(self):
        self._sidebar = Sidebar(self, on_nav=self._navigate)
        self._sidebar.pack(side="left", fill="y")

        self._main = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        self._main.pack(side="left", fill="both", expand=True)

        topbar = ctk.CTkFrame(self._main, fg_color=BG2, height=52, corner_radius=0)
        topbar.pack(fill="x")
        topbar.pack_propagate(False)
        self._page_lbl   = ctk.CTkLabel(topbar, text="Dashboard",
                                         font=("Segoe UI", 16, "bold"), text_color=TEXT)
        self._page_lbl.pack(side="left", padx=24, pady=14)
        self._status_lbl = ctk.CTkLabel(topbar, text="", font=("Segoe UI", 11), text_color=SUCCESS)
        self._status_lbl.pack(side="right", padx=24)

        self._content = ctk.CTkFrame(self._main, fg_color=BG, corner_radius=0)
        self._content.pack(fill="both", expand=True)

    def _set_status(self, msg: str, color=SUCCESS):
        self._status_lbl.configure(text=msg, text_color=color)

    def _on_mount(self):
        self.db = load_db()
        self._navigate("dashboard")
        if not self.db:
            self._set_status("Database vazia — use Pull ou Importar JSON", WARNING)

    # ── Navigation ────────────────────────────────────────────────────────────
    def _navigate(self, page: str):
        for w in self._content.winfo_children():
            w.destroy()
        self.current_page = page
        titles = {
            "dashboard": "🏠  Dashboard",
            "list":      "📋  Lista de Animes",
            "update":    "🔄  Auto-Update",
            "check":     "🔍  Verificar Episódios",
            "stats":     "📊  Estatísticas",
            "logs":      "📜  Logs & Histórico",
            "add":       "➕  Adicionar Anime",
            "import":    "📂  Importar JSON",
            "push":      "☁️  Git Push",
            "pull":      "⬇️  Pull GitHub",
        }
        self._page_lbl.configure(text=titles.get(page, page))

        if   page == "dashboard": self._page_dashboard()
        elif page == "list":      self._page_list()
        elif page == "update":    self._page_update(dry=False)
        elif page == "check":     self._page_update(dry=True)
        elif page == "stats":     self._page_stats()
        elif page == "logs":      self._page_logs()
        elif page == "add":       AddAnimeDialog(self, self._do_add)
        elif page == "import":    ImportDialog(self,   self._do_import)
        elif page == "push":      PushDialog(self,     self._do_push)
        elif page == "pull":      self._do_pull()

    # ── Dashboard ─────────────────────────────────────────────────────────────
    def _page_dashboard(self):
        db      = self.db
        ongoing = sum(1 for a in db if any(s.get("status")=="ongoing"  for s in a.get("seasons",[])))
        paused  = sum(1 for a in db if any(s.get("status")=="paused"   for s in a.get("seasons",[])))
        total_ep= sum(s.get("currentEpisode",0) for a in db for s in a.get("seasons",[]))
        has_dub = sum(1 for a in db if any(
            aud.get("available") and aud.get("type")=="dub"
            for s in a.get("seasons",[]) for aud in s.get("audios",[])))
        movies  = sum(1 for a in db for s in a.get("seasons",[]) if s.get("type")=="movie")

        f = ctk.CTkFrame(self._content, fg_color="transparent")
        f.pack(fill="both", expand=True, padx=28, pady=28)

        row_cards = ctk.CTkFrame(f, fg_color="transparent")
        row_cards.pack(fill="x", pady=(0,20))
        for label, val, color, icon in [
            ("Total Animes",  len(db),     ACCENT,    "📦"),
            ("Em Andamento",  ongoing,     ONLINE,    "🟢"),
            ("Pausados",      paused,      WARNING,   "⏸️"),
            ("Finalizados",   len(db)-ongoing-paused, "#3b82f6", "✅"),
            ("Com Dublagem",  has_dub,     ACCENT2,   "🎙️"),
            ("Episódios",     total_ep,    WARNING,   "🎬"),
        ]:
            StatCard(row_cards, label, val, color, icon).pack(side="left", padx=6, ipadx=8)

        info = ctk.CTkFrame(f, fg_color=CARD, corner_radius=12, border_width=1, border_color=BORDER)
        info.pack(fill="x", pady=(0,16))
        ctk.CTkLabel(info, text="Repositório & Branch", font=("Segoe UI",13,"bold"),
                     text_color=ACCENT2).pack(anchor="w", padx=16, pady=(14,2))
        for txt in [f"  Repo   : {GITHUB_REPO}", f"  Branch : {GIT_BRANCH}"]:
            ctk.CTkLabel(info, text=txt, font=("Consolas",12), text_color=TEXT_DIM
                         ).pack(anchor="w", padx=16)
        ctk.CTkFrame(info, height=14, fg_color="transparent").pack()

        ctk.CTkLabel(f, text="Ações Rápidas", font=("Segoe UI",14,"bold"), text_color=TEXT
                     ).pack(anchor="w", pady=(4,8))
        btn_row = ctk.CTkFrame(f, fg_color="transparent")
        btn_row.pack(fill="x")
        for txt, color, cmd in [
            ("➕ Adicionar",       ACCENT,    lambda: self._navigate("add")),
            ("🔄 Auto-Update",     SUCCESS,   lambda: self._navigate("update")),
            ("🔍 Verificar Eps",   "#3b82f6", lambda: self._navigate("check")),
            ("☁️  Push GitHub",    "#6366f1", lambda: self._navigate("push")),
            ("⬇️  Pull GitHub",    BG3,       lambda: self._navigate("pull")),
        ]:
            ctk.CTkButton(btn_row, text=txt, fg_color=color, hover_color=ACCENT2,
                          height=38, corner_radius=8, font=("Segoe UI",13),
                          command=cmd).pack(side="left", padx=6)

    # ── List ──────────────────────────────────────────────────────────────────
    def _page_list(self):
        f = ctk.CTkFrame(self._content, fg_color="transparent")
        f.pack(fill="both", expand=True)

        top = ctk.CTkFrame(f, fg_color="transparent")
        top.pack(fill="x", padx=20, pady=(16,8))
        self._search_var = ctk.StringVar()
        ctk.CTkEntry(top, textvariable=self._search_var, placeholder_text="🔍 Buscar anime...",
                     height=38, corner_radius=10, fg_color=BG3, border_color=BORDER,
                     text_color=TEXT, font=("Segoe UI",13), width=300).pack(side="left")
        self._search_var.trace_add("write", lambda *_: self._refresh_list())
        for txt, color, cmd in [
            ("📂 Importar", BG3,    lambda: ImportDialog(self, self._do_import)),
            ("➕ Adicionar", ACCENT, lambda: AddAnimeDialog(self, self._do_add)),
        ]:
            ctk.CTkButton(top, text=txt, fg_color=color, height=38, corner_radius=8,
                          hover_color=BORDER if color==BG3 else ACCENT2,
                          command=cmd).pack(side="right", padx=(4,0))

        self._list_scroll = ctk.CTkScrollableFrame(f, fg_color="transparent", scrollbar_button_color=BG3)
        self._list_scroll.pack(fill="both", expand=True, padx=12, pady=(0,12))
        self._refresh_list()

    def _refresh_list(self):
        if not self._list_scroll:
            return
        q = (self._search_var.get().lower().strip()
             if self._search_var else "")
        for w in self._list_scroll.winfo_children():
            w.destroy()
        filtered = ([a for a in self.db
                     if q in a.get("title","").lower() or q in a.get("id","").lower()]
                    if q else self.db)
        if not filtered:
            ctk.CTkLabel(self._list_scroll, text="Nenhum anime encontrado.",
                         text_color=TEXT_DIM, font=("Segoe UI",14)).pack(pady=40)
            return
        for anime in filtered:
            AnimeCard(
                self._list_scroll, anime,
                on_edit   = self._open_edit,
                on_delete = lambda a: ConfirmDialog(
                    self, f"Remover '{a['title']}'?", lambda x=a: self._do_delete(x)),
                on_update = self._do_update_one,
            ).pack(fill="x", padx=8, pady=5)

    def _refresh_list_if_open(self):
        if self.current_page == "list":
            self._refresh_list()

    # ── Update page ───────────────────────────────────────────────────────────
    def _page_update(self, dry=False):
        f = ctk.CTkFrame(self._content, fg_color="transparent")
        f.pack(fill="both", expand=True, padx=20, pady=20)
        title    = "Verificar Novos Episódios (Dry Run)" if dry else "Auto-Update Todos os Animes"
        subtitle = "Apenas verifica, não salva nada." if dry else "Verifica e adiciona novos eps via AniVideo CDN."
        ctk.CTkLabel(f, text=title, font=("Segoe UI",16,"bold"), text_color=ACCENT2).pack(anchor="w")
        ctk.CTkLabel(f, text=subtitle, font=("Segoe UI",12), text_color=TEXT_DIM).pack(anchor="w", pady=(2,12))
        btn_row = ctk.CTkFrame(f, fg_color="transparent")
        btn_row.pack(fill="x", pady=(0,12))
        log = LogBox(f)
        label_btn = "🔍 Verificar Agora" if dry else "🚀 Iniciar Update"
        ctk.CTkButton(btn_row, text=label_btn, fg_color=ACCENT, height=40, corner_radius=8,
                      font=("Segoe UI",13),
                      command=lambda: self._run_update(log, dry=dry)).pack(side="left")
        ctk.CTkButton(btn_row, text="🗑️ Limpar Log", fg_color=BG3, height=40, corner_radius=8,
                      hover_color=BORDER, command=log.clear).pack(side="left", padx=10)
        log.pack(fill="both", expand=True)
        log.write("Pronto. Pressione o botão acima para iniciar.")
        self._log = log

    def _run_update(self, log: LogBox, dry=False):
        log.clear()
        log.write(f"╔══ {'VERIFICAÇÃO (dry run)' if dry else 'UPDATE COMPLETO'} ══╗\n")
        def _worker():
            changed = []
            for anime in self.db:
                if not any(s.get("status") in ("ongoing","paused") for s in anime.get("seasons",[])):
                    continue
                title = anime["title"]
                self.after(0, log.write, f"\n▶  {title}")
                self.after(0, log.write, "─" * 52)
                # Situação atual
                for info in get_audio_ep_counts(anime):
                    if info["status"] == "finished" and info["type"] != "movie":
                        continue
                    parts = []
                    if info["sub"] is not None: parts.append(f"LEG: {info['sub']:02d} eps")
                    if info["dub"] is not None: parts.append(f"DUB: {info['dub']:02d} eps")
                    max_s = f"/{info['max']}" if info["max"] else ""
                    self.after(0, log.write, f"  [{info['label']}]  {' | '.join(parts)}{max_s}")

                if dry:
                    checks = check_next_ep_per_audio(anime)
                    if not checks:
                        self.after(0, log.write, "  (sem temporadas em andamento)"); continue
                    anime_changed = False
                    for chk in checks:
                        tag = "LEG" if chk["audio"] == "sub" else "DUB"
                        max_s = f"/{chk['max']}" if chk["max"] else ""
                        self.after(0, log.write,
                            f"  [{tag}] S{chk['season']} atual:{chk['current']:02d}{max_s} → ep {chk['next_ep']:02d}...")
                        if av_ep_exists(chk["path"], chk["next_ep"]):
                            self.after(0, log.write, f"  [{tag}] ✅  Ep {chk['next_ep']:02d} DISPONÍVEL!")
                            anime_changed = True
                        else:
                            self.after(0, log.write, f"  [{tag}] ❌  Ep {chk['next_ep']:02d} não disponível.")
                    if anime_changed:
                        changed.append(title)
                else:
                    msgs = try_add_next_ep(anime)
                    for m in msgs: self.after(0, log.write, m)
                    added = [m for m in msgs if "✅" in m]
                    errors = [m for m in msgs if "sem stream_path" in m]
                    if added:
                        detail = " | ".join(re.sub(r"\s+", " ", m.strip()) for m in added)
                        log_event("update", f"Eps adicionados: {title}", detail)
                    for e in errors:
                        log_event("stream", title, e.strip(), level="error")
                    if added:
                        changed.append(title)

            if not dry and changed:
                save_db(self.db)
                self.after(0, self._refresh_list_if_open)

            self.after(0, log.write, "")
            if changed:
                self.after(0, log.write, f"╔══ ✅  {len(changed)} anime(s) com novos eps ══╗")
                for c in changed: self.after(0, log.write, f"  ✓  {c}")
            else:
                self.after(0, log.write, "╔══ ℹ️  Nenhum episódio novo encontrado ══╗")
            self.after(0, log.write, "╚══ Finalizado ══╝")
            self.after(0, self._set_status,
                       f"{'Verificação' if dry else 'Update'} completo! {len(changed)} novidade(s).")
        threading.Thread(target=_worker, daemon=True).start()

    # ── Stats ─────────────────────────────────────────────────────────────────
    def _page_stats(self):
        f = ctk.CTkScrollableFrame(self._content, fg_color="transparent")
        f.pack(fill="both", expand=True, padx=20, pady=20)
        genres: dict[str,int] = {}
        for a in self.db:
            for g in a.get("genre",[]): genres[g] = genres.get(g,0)+1
        top = sorted(genres.items(), key=lambda x:-x[1])[:8]
        ctk.CTkLabel(f, text="Gêneros mais comuns", font=("Segoe UI",15,"bold"),
                     text_color=ACCENT2).pack(anchor="w", pady=(0,8))
        bar_frame = ctk.CTkFrame(f, fg_color=CARD, corner_radius=12, border_width=1, border_color=BORDER)
        bar_frame.pack(fill="x", pady=(0,16))
        max_n = max((n for _,n in top), default=1)
        for genre, count in top:
            row = ctk.CTkFrame(bar_frame, fg_color="transparent")
            row.pack(fill="x", padx=16, pady=4)
            ctk.CTkLabel(row, text=genre, width=140, anchor="w",
                         font=("Segoe UI",12), text_color=TEXT).pack(side="left")
            bar = ctk.CTkProgressBar(row, height=16, corner_radius=6,
                                      progress_color=ACCENT, fg_color=BG3, width=260)
            bar.set(count/max_n)
            bar.pack(side="left", padx=8)
            ctk.CTkLabel(row, text=str(count), font=("Segoe UI",12,"bold"),
                         text_color=ACCENT2).pack(side="left")

        ctk.CTkLabel(f, text="Em andamento", font=("Segoe UI",15,"bold"),
                     text_color=ACCENT2).pack(anchor="w", pady=(8,8))
        ongoing = [a for a in self.db if any(s.get("status")=="ongoing" for s in a.get("seasons",[]))]
        for a in ongoing[:15]:
            last = a.get("seasons",[{}])[-1]
            row  = ctk.CTkFrame(f, fg_color=CARD, corner_radius=8, border_width=1, border_color=BORDER)
            row.pack(fill="x", pady=3)
            ctk.CTkLabel(row, text=a.get("title","")[:36], font=("Segoe UI",13),
                         text_color=TEXT, anchor="w").pack(side="left", padx=12, pady=8)
            ctk.CTkLabel(row,
                text=f"S{len(a.get('seasons',[]))} · Ep {last.get('currentEpisode','?')}/{last.get('episodes','?')}",
                font=("Segoe UI",12), text_color=TEXT_DIM).pack(side="right", padx=12)

    # ── Logs & Histórico ──────────────────────────────────────────────────────
    def _page_logs(self):
        f = ctk.CTkFrame(self._content, fg_color="transparent")
        f.pack(fill="both", expand=True, padx=20, pady=16)

        # Toolbar
        tb = ctk.CTkFrame(f, fg_color="transparent")
        tb.pack(fill="x", pady=(0, 12))

        self._log_filter = ctk.StringVar(value="todos")
        ctk.CTkLabel(tb, text="Filtro:", font=("Segoe UI",12), text_color=TEXT_DIM).pack(side="left", padx=(0,8))
        seg = ctk.CTkSegmentedButton(tb,
            values=["todos","update","add","error","git"],
            selected_color=ACCENT, font=("Segoe UI",12),
            command=lambda v: self._render_logs(log_frame, v))
        seg.set("todos")
        seg.pack(side="left")
        ctk.CTkButton(tb, text="🗑️ Limpar Logs", width=130, fg_color=DANGER,
                      hover_color="#dc2626", height=34, corner_radius=8,
                      command=lambda: self._clear_logs(log_frame)).pack(side="right")

        # Scrollable log list
        log_frame = ctk.CTkScrollableFrame(f, fg_color="transparent", scrollbar_button_color=BG3)
        log_frame.pack(fill="both", expand=True)
        self._render_logs(log_frame, "todos")

    def _render_logs(self, container, filter_kind: str):
        for w in container.winfo_children():
            w.destroy()
        logs = _load_logs()
        if filter_kind != "todos":
            logs = [l for l in logs if l.get("kind") == filter_kind]
        if not logs:
            ctk.CTkLabel(container, text="Nenhum log encontrado.",
                         text_color=TEXT_DIM, font=("Segoe UI",14)).pack(pady=40)
            return

        # Show newest first
        for entry in reversed(logs[-200:]):
            kind  = entry.get("kind", "info")
            level = entry.get("level", "info")
            ts    = entry.get("ts", "")
            title = entry.get("title", "")
            detail= entry.get("detail", "")

            # Color per kind
            kind_colors = {
                "update": ("#3b82f6", "🔄"),
                "add":    (SUCCESS,   "➕"),
                "error":  (DANGER,    "❌"),
                "delete": (WARNING,   "🗑️"),
                "git":    (ACCENT2,   "☁️"),
                "stream": (DANGER,    "📡"),
            }
            color, icon = kind_colors.get(kind, (TEXT_DIM, "ℹ️"))

            card = ctk.CTkFrame(container, fg_color=CARD, corner_radius=8,
                                border_width=1, border_color=BORDER)
            card.pack(fill="x", padx=4, pady=3)

            # Left accent bar
            bar = ctk.CTkFrame(card, width=4, fg_color=color, corner_radius=2)
            bar.pack(side="left", fill="y", padx=(0,10), pady=4)

            inner = ctk.CTkFrame(card, fg_color="transparent")
            inner.pack(side="left", fill="both", expand=True, pady=6)

            top_row = ctk.CTkFrame(inner, fg_color="transparent")
            top_row.pack(fill="x")
            ctk.CTkLabel(top_row, text=f"{icon} {title}",
                         font=("Segoe UI", 13, "bold"), text_color=TEXT,
                         anchor="w").pack(side="left")
            ctk.CTkLabel(top_row, text=ts, font=("Segoe UI", 11),
                         text_color=TEXT_DIM).pack(side="right", padx=12)

            if detail:
                ctk.CTkLabel(inner, text=detail, font=("Consolas", 11),
                             text_color=TEXT_DIM, anchor="w", wraplength=780).pack(anchor="w")

    def _clear_logs(self, container):
        with _LOG_LOCK:
            _save_logs([])
        self._render_logs(container, "todos")
        self._set_status("Logs apagados.", WARNING)

    # ── Add Anime ─────────────────────────────────────────────────────────────
    def _do_add(self, data: dict):
        if not data.get("name"):
            return
        self._navigate("update")
        def _worker():
            log = self._log
            wlog = lambda m: self.after(0, log.write, m)
            name     = data["name"]
            id_slug  = data["slug"] or re.sub(r"[^a-z0-9]+","-",name.lower()).strip("-")
            total_eps= int(data["eps"]    or 0)
            max_eps  = int(data["max_eps"] or 0) or total_eps
            s_num    = int(data["season"] or 1)
            avslug   = data["avslug"].strip()
            has_sub  = data["has_sub"]
            has_dub  = data["has_dub"]
            is_movie = data.get("is_movie", False)
            inc_s    = data.get("inc_season", True)

            # ── MAL — igual ao script extrator ───────────────────────────────
            wlog(f"[MAL] Buscando informações de '{name}' no MyAnimeList...")
            mal = fetch_mal_info(name)
            if mal:
                md       = mal_to_season_data(mal, s_num, is_movie)
                title_r  = md["title_r"]
                title_j  = md["title_j"]
                genres   = md["genres"]
                studio   = md["studio"]
                mal_id   = md["mal_id"]
                cover    = md["cover"]
                score    = md["score"]
                synopsis = md["synopsis"]
                trailer  = md["trailer"]
                year     = md["year"]
                status_api = md["status"]
                runtime  = md["runtime"]
                rating   = md["rating"]
                wlog(f"[MAL] Anime encontrado com sucesso!")
                wlog(f"[MAL] {title_r} ({year}) — Status: {status_api} — Score: {score}")
            else:
                title_r = title_j = name
                genres = []; studio = "Desconhecido"; mal_id = 0
                cover = ""; score = 0.0; synopsis = ""; trailer = ""; year = datetime.now().year
                status_api = "ongoing"; runtime = 0; rating = ""
                wlog("[MAL] ⚠️ Não encontrado. Usando defaults.")

            # ── Crunchyroll Banner — igual ao script extrator ─────────────────
            if PLAYWRIGHT_OK:
                wlog(f"\n[CR] Buscando banner da Crunchyroll para '{title_r}'...")
            else:
                wlog("[CR] ⚠️ Playwright não instalado — usando cover do MAL.")
                wlog("     pip install playwright && playwright install chromium")
            banner = fetch_crunchyroll_banner(title_r, fallback=cover)
            if banner and banner != cover:
                wlog(f"[CR] ✅ Banner encontrado!")
            else:
                wlog("[CR] Banner não encontrado, usando coverImage como fallback.")
                banner = cover

            # ── AniVideo paths ────────────────────────────────────────────────
            av_sub = av_dub = None
            if avslug:
                letter = avslug[0].lower()
                av_sub = f"{letter}/{avslug}"
                if not is_movie and inc_s and s_num > 1:
                    av_sub += f"-{s_num}"
                av_dub = av_sub + "-dublado"
                wlog(f"AniVideo sub: {av_sub}")
                wlog(f"AniVideo dub: {av_dub}")

            # ── Episódios ─────────────────────────────────────────────────────
            ep_list = []
            for ep_i in range(1, total_eps+1):
                embeds = {}
                if av_sub and has_sub: embeds["sub"] = make_iframe(anivideo_url(av_sub, ep_i))
                if av_dub and has_dub: embeds["dub"] = make_iframe(anivideo_url(av_dub, ep_i))
                ep_list.append({
                    "id": f"{id_slug}-s{s_num}-ep{ep_i}", "number": ep_i,
                    "title": f"{title_r} - T{s_num} Ep {ep_i}",
                    "season": str(s_num), "embeds": embeds,
                    "embedCredit": "api.anivideo.net" if (av_sub or av_dub) else "",
                })

            season_data: dict = {
                "season": s_num,
                "seasonLabel": f"{s_num}ª Temporada",
                "year": year, "episodes": max_eps, "currentEpisode": total_eps,
                "status": status_api, "score": score, "synopsis": synopsis,
                "trailer": trailer,
                "audios": [
                    {"type":"sub","label":"Legendado","available":has_sub,
                     "episodesAvailable": total_eps if has_sub else 0},
                    {"type":"dub","label":"Dublado","available":has_dub,
                     "episodesAvailable": total_eps if has_dub else 0},
                ],
                "episodeList": ep_list,
            }

            # Campos extras de filme
            if is_movie:
                season_data["type"]        = "movie"
                season_data["movieTitle"]  = data.get("mv_title") or title_r
                season_data["seasonLabel"] = data.get("mv_title") or title_r
                season_data["tagline"]     = data.get("mv_tag", "")
                season_data["runtime"]     = int(data.get("mv_rt", "") or runtime or 0)
                season_data["director"]    = data.get("mv_dir", "")
                season_data["ageRating"]   = data.get("mv_age", "") or rating
                season_data["accentColor"] = data.get("mv_acc", "#FF2E2E")
                season_data["posterImage"] = data.get("mv_post", "") or cover
                raw_stills = data.get("mv_stills", "")
                season_data["stills"] = [s.strip() for s in raw_stills.split(",") if s.strip()]
                # Cast
                cast_list = []
                for line in (data.get("mv_cast") or "").strip().splitlines():
                    parts = [p.strip() for p in line.split("|")]
                    if len(parts) >= 2:
                        cast_list.append({
                            "character": parts[0],
                            "voice":     parts[1],
                            "voiceDub":  parts[2] if len(parts) > 2 else "—",
                        })
                season_data["cast"]   = cast_list
                raw_awards = data.get("mv_awards", "")
                season_data["awards"] = [a.strip() for a in raw_awards.split(",") if a.strip()]

            # ── Merge / Create ────────────────────────────────────────────────
            existing = next((a for a in self.db if a.get("id") == id_slug), None)
            if existing:
                wlog(f"Anime '{id_slug}' já existe — integrando T{s_num}...")
                if cover: existing["coverImage"] = cover
                existing["bannerImage"] = banner
                replaced = False
                for idx, s in enumerate(existing.get("seasons", [])):
                    if int(s.get("season",0)) == s_num:
                        existing["seasons"][idx] = season_data
                        replaced = True
                        wlog(f"  Substituída T{s_num}.")
                        break
                if not replaced:
                    existing.setdefault("seasons",[]).append(season_data)
                    wlog(f"  Adicionada T{s_num}.")
                existing["seasons"] = sorted(existing["seasons"], key=lambda x: int(x.get("season",0)))
            else:
                new_anime = {
                    "id": id_slug, "title": title_r, "titleRomaji": title_r,
                    "titleJapanese": title_j, "genre": genres, "studio": studio,
                    "recommended": False, "malId": mal_id,
                    "coverImage": cover, "bannerImage": banner,
                    "seasons": [season_data],
                }
                self.db.append(new_anime)
                wlog(f"✅ '{title_r}' criado com {total_eps} eps (T{s_num})!")
                log_event("add", f"Adicionado: {title_r}", f"T{s_num} · {total_eps} eps · {'Filme' if is_movie else 'Série'}")

            save_db(self.db)
            self.after(0, self._set_status, f"'{title_r}' salvo!")
        threading.Thread(target=_worker, daemon=True).start()

    # ── Edit ──────────────────────────────────────────────────────────────────
    def _open_edit(self, anime: dict):
        EditAnimeDialog(self, anime, lambda d: self._do_edit(anime, d))

    def _do_edit(self, anime: dict, data: dict):
        # Campos gerais
        anime["title"]         = anime["titleRomaji"] = data["title"]
        anime["titleJapanese"] = data["title_j"]
        anime["studio"]        = data["studio"]
        anime["genre"]         = data["genres"]
        anime["coverImage"]    = data["cover"]
        anime["bannerImage"]   = data["banner"]
        anime["recommended"]   = data["rec"]
        try: anime["malId"]    = int(data["mal_id"])
        except: pass

        # Campos por temporada
        for sd in data["seasons"]:
            s_num = sd["season_num"]
            season = next((s for s in anime.get("seasons",[]) if s.get("season") == s_num), None)
            if not season:
                continue

            season["seasonLabel"]     = sd["label"]
            season["status"]          = sd["status"]
            try: season["year"]       = int(sd["year"])
            except: pass
            try: season["episodes"]   = int(sd["episodes"])
            except: pass
            try: season["currentEpisode"] = int(sd["current_ep"])
            except: pass
            try: season["score"]      = float(sd["score"])
            except: pass
            season["synopsis"]        = sd["synopsis"]
            season["trailer"]         = sd["trailer"]

            # Áudios
            sub_ep = int(sd.get("sub_eps") or 0)
            dub_ep = int(sd.get("dub_eps") or 0)
            for aud in season.get("audios", []):
                if aud["type"] == "sub":
                    aud["available"]          = sd["has_sub"]
                    aud["episodesAvailable"]   = sub_ep
                if aud["type"] == "dub":
                    aud["available"]          = sd["has_dub"]
                    aud["episodesAvailable"]   = dub_ep

            # Campos extras de filme
            if sd["is_movie"]:
                season["movieTitle"]   = sd.get("movie_title", "")
                season["tagline"]      = sd.get("tagline", "")
                season["director"]     = sd.get("director", "")
                season["ageRating"]    = sd.get("age_rating", "")
                season["accentColor"]  = sd.get("accent", "#FF2E2E")
                season["posterImage"]  = sd.get("poster", "")
                season["stills"]       = sd.get("stills", [])
                season["awards"]       = sd.get("awards", [])
                try: season["runtime"] = int(sd.get("runtime") or 0)
                except: pass
                # Cast
                cast_list = []
                for line in sd.get("cast_raw","").strip().splitlines():
                    parts = [p.strip() for p in line.split("|")]
                    if len(parts) >= 2:
                        cast_list.append({
                            "character": parts[0],
                            "voice":     parts[1],
                            "voiceDub":  parts[2] if len(parts) > 2 else "—",
                        })
                season["cast"] = cast_list

        save_db(self.db)
        self._set_status(f"'{anime['title']}' salvo com sucesso!")
        self._navigate("list")

    # ── Delete ────────────────────────────────────────────────────────────────
    def _do_delete(self, anime: dict):
        self.db = [a for a in self.db if a.get("id") != anime.get("id")]
        fp = os.path.join(ANIMES_FOLDER, f"{anime['id']}.json")
        if os.path.exists(fp): os.remove(fp)
        save_db(self.db)
        log_event("delete", f"Removido: {anime.get('title','?')}", level="warning")
        self._set_status(f"'{anime['title']}' removido!", WARNING)
        self._navigate("list")

    # ── Update one ────────────────────────────────────────────────────────────
    def _do_update_one(self, anime: dict):
        self._navigate("update")
        def _worker():
            log  = self._log
            wlog = lambda m: self.after(0, log.write, m)
            wlog(f"▶  {anime['title']}")
            wlog("─" * 52)
            for info in get_audio_ep_counts(anime):
                parts = []
                if info["sub"] is not None: parts.append(f"LEG:{info['sub']:02d}")
                if info["dub"] is not None: parts.append(f"DUB:{info['dub']:02d}")
                max_s = f"/{info['max']}" if info["max"] else ""
                wlog(f"  [{info['label']}]  {' | '.join(parts)}{max_s}")
            wlog("")
            msgs = try_add_next_ep(anime)
            added_eps = [m for m in msgs if "✅" in m]
            for m in msgs: wlog(m)
            save_db(self.db)
            if added_eps:
                detail = " | ".join(re.sub(r"\s+", " ", m.strip()) for m in added_eps)
                log_event("update", f"Eps adicionados: {anime['title']}", detail)
            wlog("\n✅ Concluído!")
            self.after(0, self._set_status, f"'{anime['title']}' atualizado!")
        threading.Thread(target=_worker, daemon=True).start()

    # ── Import ────────────────────────────────────────────────────────────────
    def _do_import(self, path: str):
        if not path: return
        if not os.path.exists(path):
            self._set_status(f"Arquivo não encontrado: {path}", DANGER); return
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                for a in data:
                    self.db = [x for x in self.db if x.get("id") != a.get("id")]
                    self.db.append(a)
                count = len(data)
            else:
                self.db = [x for x in self.db if x.get("id") != data.get("id")]
                self.db.append(data)
                count = 1
            save_db(self.db)
            self._set_status(f"{count} anime(s) importado(s)!")
            self._navigate("list")
        except Exception as e:
            self._set_status(f"Erro import: {e}", DANGER)

    # ── Git ───────────────────────────────────────────────────────────────────
    def _do_push(self, msg: str):
        self._set_status("Fazendo push...", WARNING)
        def _worker():
            result = do_git_push(msg)
            log_event("git", f"Git Push: {msg[:60]}", result[:120])
            self.after(0, self._set_status, f"Git: {result[:100]}")
        threading.Thread(target=_worker, daemon=True).start()

    def _do_pull(self):
        self._set_status("Puxando do GitHub...", WARNING)
        def _worker():
            try:
                r = requests.get(GITHUB_RAW_URL, timeout=15)
                r.raise_for_status()
                self.db = r.json()
                save_db(self.db)
                self.after(0, self._set_status, f"{len(self.db)} animes carregados!")
                self.after(0, self._navigate, "dashboard")
            except Exception as e:
                self.after(0, self._set_status, f"Erro pull: {e}", DANGER)
        threading.Thread(target=_worker, daemon=True).start()


# ── Entry ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    AnimeAdminApp().mainloop()