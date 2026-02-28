#!/usr/bin/env python3
"""
Anime Admin Panel — GUI Edition
Requires: pip install customtkinter pillow requests
"""

from __future__ import annotations
import re, os, sys, time, json, subprocess, threading, io
from datetime import datetime
from urllib.parse import quote_plus
from Banner import fetch_crunchyroll_banner
from playwright.sync_api import sync_playwright

# ── Dependency check ──────────────────────────────────────────────────────────
missing = []
try:
    import customtkinter as ctk
except ImportError:
    missing.append("customtkinter")
try:
    from PIL import Image, ImageTk, ImageDraw, ImageFilter, ImageFont
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
BG        = "#0a0a14"
BG2       = "#0f0f1e"
BG3       = "#161628"
SIDEBAR   = "#0c0c1a"
ACCENT    = "#7c3aed"
ACCENT2   = "#a855f7"
SUCCESS   = "#10b981"
DANGER    = "#ef4444"
WARNING   = "#f59e0b"
TEXT      = "#e2e8f0"
TEXT_DIM  = "#64748b"
TEXT_MUTED= "#374151"
BORDER    = "#1e1e3f"
CARD      = "#111126"
ONLINE    = "#22c55e"
MOVIE     = "#f59e0b"

# ── Business Logic ────────────────────────────────────────────────────────────
def make_iframe(src):
    return f'<iframe width="100%" height="100%" src="{src}" frameborder="0" allowfullscreen></iframe>'

def anivideo_url(path, ep):
    ep_s = f"{ep:02d}"
    cdn  = f"{ANIVIDEO_CDN}/{path}/{ep_s}.mp4/index.m3u8"
    nc   = int(time.time() * 1000)
    return f"{ANIVIDEO_WRAP}?d={cdn}&nocache{nc}"

def extract_av_path(iframe_html):
    m = re.search(r'/stream/([a-z]/[^/]+)/\d{2}\.mp4', iframe_html or "", re.I)
    return m.group(1) if m else None

def av_ep_exists(path, ep):
    ep_s = f"{ep:02d}"
    url  = f"{ANIVIDEO_CDN}/{path}/{ep_s}.mp4/index.m3u8"
    try:
        r = requests.head(url, timeout=8, allow_redirects=True)
        return r.status_code < 400
    except:
        return False

def fetch_mal(query):
    try:
        r = requests.get(f"https://api.jikan.moe/v4/anime?q={quote_plus(query)}&limit=1", timeout=10)
        r.raise_for_status()
        d = r.json()
        return d["data"][0] if d.get("data") else None
    except:
        return None

def load_db():
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, encoding="utf-8") as f:
            return json.load(f)
    return []

def save_db(db):
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    if os.path.exists(ANIMES_FOLDER):
        for anime in db:
            aid = anime.get("id")
            if aid:
                fp = os.path.join(ANIMES_FOLDER, f"{aid}.json")
                with open(fp, "w", encoding="utf-8") as f:
                    json.dump(anime, f, ensure_ascii=False, indent=2)

def find_anime(db, q):
    ql = q.lower().strip()
    for a in db:
        if a.get("id","").lower() == ql or ql in a.get("title","").lower():
            return a
    return None

def get_audio_ep_counts(anime: dict) -> list[dict]:
    """
    Retorna a contagem atual de episódios por áudio para cada temporada.
    Ex: [{"season": 1, "label": "1ª Temporada", "sub": 12, "dub": 10, "max": 24}]
    """
    result = []
    for season in anime.get("seasons", []):
        audios = season.get("audios", [])
        sub_count = next((a.get("episodesAvailable", 0) for a in audios if a["type"] == "sub"), 0)
        dub_count = next((a.get("episodesAvailable", 0) for a in audios if a["type"] == "dub"), 0)
        has_sub   = next((a.get("available", False) for a in audios if a["type"] == "sub"), False)
        has_dub   = next((a.get("available", False) for a in audios if a["type"] == "dub"), False)
        result.append({
            "season":   season.get("season", "?"),
            "label":    season.get("seasonLabel", f"S{season.get('season','?')}"),
            "type":     season.get("type", "series"),
            "sub":      sub_count if has_sub else None,
            "dub":      dub_count if has_dub else None,
            "max":      season.get("episodes", 0),
            "status":   season.get("status", "?"),
        })
    return result

def check_next_ep_per_audio(anime: dict) -> list[dict]:
    """
    Verifica CDN para sub e dub SEPARADAMENTE.
    Retorna lista de resultados por temporada/audio.
    Ex: [{"season":1, "audio":"sub", "next_ep":13, "available":True, "path":"s/..."}]
    """
    results = []
    for season in anime.get("seasons", []):
        if season.get("status") == "finished" and season.get("type") != "movie":
            continue
        ep_list = season.get("episodeList", [])
        if not ep_list:
            continue
        audios = season.get("audios", [])
        s_num  = season["season"]

        # Busca o path de sub e dub no último episódio que tiver cada um
        sub_path = None
        dub_path = None
        sub_cur  = 0
        dub_cur  = 0

        # Percorre a lista de episódios de trás pra frente para achar o último com sub/dub
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

        # Usa episodesAvailable dos audios como referência mais confiável
        for aud in audios:
            if aud["type"] == "sub" and aud.get("available") and sub_path:
                cur    = aud.get("episodesAvailable", sub_cur)
                next_e = cur + 1
                max_e  = season.get("episodes", 0)
                if max_e and next_e > max_e:
                    continue
                results.append({
                    "season":    s_num,
                    "label":     season.get("seasonLabel", f"S{s_num}"),
                    "audio":     "sub",
                    "audio_label": "Legendado",
                    "current":   cur,
                    "next_ep":   next_e,
                    "max":       max_e,
                    "path":      sub_path,
                    "available": None,   # será preenchido ao checar CDN
                })
            if aud["type"] == "dub" and aud.get("available") and dub_path:
                cur    = aud.get("episodesAvailable", dub_cur)
                next_e = cur + 1
                max_e  = season.get("episodes", 0)
                if max_e and next_e > max_e:
                    continue
                results.append({
                    "season":    s_num,
                    "label":     season.get("seasonLabel", f"S{s_num}"),
                    "audio":     "dub",
                    "audio_label": "Dublado",
                    "current":   cur,
                    "next_ep":   next_e,
                    "max":       max_e,
                    "path":      dub_path,
                    "available": None,
                })
    return results

def try_add_next_ep(anime: dict) -> list[str]:
    """
    Verifica e adiciona próximo episódio para SUB e DUB de forma independente.
    Cada áudio pode estar em episódios diferentes.
    """
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

        # Monta mapa ep_num -> embeds existentes
        ep_map: dict[int, dict] = {ep["number"]: ep for ep in ep_list}

        # Acha path e contagem atual para sub e dub separadamente
        sub_path = dub_path = None
        sub_cur  = dub_cur  = 0

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

        # Usa episodesAvailable como referência
        for aud in audios:
            if aud["type"] == "sub" and aud.get("available"):
                sub_cur = max(sub_cur, aud.get("episodesAvailable", sub_cur))
            if aud["type"] == "dub" and aud.get("available"):
                dub_cur = max(dub_cur, aud.get("episodesAvailable", dub_cur))

        any_added = False

        # ── Verifica e adiciona SUB independentemente ──
        if sub_path:
            sub_next = sub_cur + 1
            if not (max_e and sub_next > max_e):
                logs.append(f"    [LEG] Atual: ep {sub_cur:02d} → Checando ep {sub_next:02d}...")
                if av_ep_exists(sub_path, sub_next):
                    logs.append(f"    [LEG] ✅ Ep {sub_next:02d} disponível!")
                    # Adiciona ou atualiza embed no ep correspondente
                    if sub_next in ep_map:
                        ep_map[sub_next]["embeds"]["sub"] = make_iframe(anivideo_url(sub_path, sub_next))
                    else:
                        ep_map[sub_next] = {
                            "id":     f"{anime['id']}-s{s_num}-ep{sub_next}",
                            "number": sub_next,
                            "title":  f"{anime.get('titleRomaji', anime['title'])} - T{s_num} Ep {sub_next}",
                            "season": str(s_num),
                            "embeds": {"sub": make_iframe(anivideo_url(sub_path, sub_next))},
                            "embedCredit": "api.anivideo.net",
                        }
                    # Atualiza contagem de áudio
                    for aud in audios:
                        if aud["type"] == "sub":
                            aud["episodesAvailable"] = sub_next
                    any_added = True
                else:
                    logs.append(f"    [LEG] ❌ Ep {sub_next:02d} não disponível.")
        else:
            logs.append(f"    [LEG] ⚠️  sem stream_path — pulando.")

        # ── Verifica e adiciona DUB independentemente ──
        if dub_path:
            dub_next = dub_cur + 1
            if not (max_e and dub_next > max_e):
                logs.append(f"    [DUB] Atual: ep {dub_cur:02d} → Checando ep {dub_next:02d}...")
                if av_ep_exists(dub_path, dub_next):
                    logs.append(f"    [DUB] ✅ Ep {dub_next:02d} disponível!")
                    if dub_next in ep_map:
                        ep_map[dub_next]["embeds"]["dub"] = make_iframe(anivideo_url(dub_path, dub_next))
                    else:
                        ep_map[dub_next] = {
                            "id":     f"{anime['id']}-s{s_num}-ep{dub_next}",
                            "number": dub_next,
                            "title":  f"{anime.get('titleRomaji', anime['title'])} - T{s_num} Ep {dub_next}",
                            "season": str(s_num),
                            "embeds": {"dub": make_iframe(anivideo_url(dub_path, dub_next))},
                            "embedCredit": "api.anivideo.net",
                        }
                    for aud in audios:
                        if aud["type"] == "dub":
                            aud["episodesAvailable"] = dub_next
                    any_added = True
                else:
                    logs.append(f"    [DUB] ❌ Ep {dub_next:02d} não disponível.")
        else:
            logs.append(f"    [DUB] ⚠️  sem stream_path — pulando.")

        if any_added:
            # Reconstrói ep_list ordenada por número
            season["episodeList"] = sorted(ep_map.values(), key=lambda x: x["number"])
            # Atualiza currentEpisode = maior ep que tem qualquer embed
            all_nums = [ep["number"] for ep in season["episodeList"] if ep.get("embeds")]
            if all_nums:
                season["currentEpisode"] = max(all_nums)
            # Verifica se finalizou
            sub_done = next((a.get("episodesAvailable",0) for a in audios if a["type"]=="sub"), 0)
            dub_done = next((a.get("episodesAvailable",0) for a in audios if a["type"]=="dub"), 0)
            if max_e and min(sub_done, dub_done) >= max_e:
                season["status"] = "finished"
                logs.append(f"    🏁 Temporada {s_num} concluída!")

    return logs

def do_git_push(msg):
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
        result = (r.stdout + r.stderr).strip()
        return result or f"Push para '{GIT_BRANCH}' concluido!"
    except subprocess.CalledProcessError as e:
        return f"Erro git: {e}"

# ── Image helpers (Pillow) ────────────────────────────────────────────────────
_img_cache: dict[str, ImageTk.PhotoImage] = {}

def fetch_cover(url: str, size=(90, 128)) -> ImageTk.PhotoImage | None:
    """Busca e redimensiona capa do anime via Pillow."""
    if not url:
        return make_placeholder(size)
    key = f"{url}_{size}"
    if key in _img_cache:
        return _img_cache[key]
    try:
        r = requests.get(url, timeout=8)
        r.raise_for_status()
        img = Image.open(io.BytesIO(r.content)).convert("RGBA")
        img = img.resize(size, Image.LANCZOS)
        # rounded corners via mask
        mask = Image.new("L", size, 0)
        draw = ImageDraw.Draw(mask)
        draw.rounded_rectangle([0, 0, size[0]-1, size[1]-1], radius=8, fill=255)
        img.putalpha(mask)
        photo = ImageTk.PhotoImage(img)
        _img_cache[key] = photo
        return photo
    except:
        ph = make_placeholder(size)
        _img_cache[key] = ph
        return ph

def make_placeholder(size=(90, 128)) -> ImageTk.PhotoImage:
    img  = Image.new("RGBA", size, (22, 22, 45, 255))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([0, 0, size[0]-1, size[1]-1], radius=8, fill=(22, 22, 45, 255), outline=(60, 60, 100, 200), width=1)
    # draw a simple film icon
    cx, cy = size[0]//2, size[1]//2
    draw.rectangle([cx-12, cy-16, cx+12, cy+16], fill=(50, 50, 90))
    draw.text((cx-4, cy-6), "?", fill=(120, 120, 180))
    return ImageTk.PhotoImage(img)

def make_badge_image(text: str, color: str, size=(60, 22)) -> ImageTk.PhotoImage:
    """Cria um badge colorido com Pillow."""
    img  = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    r, g, b = int(color[1:3],16), int(color[3:5],16), int(color[5:7],16)
    draw.rounded_rectangle([0, 0, size[0]-1, size[1]-1], radius=6, fill=(r, g, b, 40), outline=(r, g, b, 180), width=1)
    draw.text((size[0]//2 - len(text)*3, 5), text, fill=(r+80, g+80, b+80, 255))
    return ImageTk.PhotoImage(img)

def hex_to_rgb(hex_color: str):
    h = hex_color.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

# ── Custom Widgets ────────────────────────────────────────────────────────────
class Sidebar(ctk.CTkFrame):
    NAV_ITEMS = [
        ("🏠", "Dashboard",      "dashboard"),
        ("📋", "Lista Animes",   "list"),
        ("➕", "Adicionar",      "add"),
        ("📂", "Importar JSON",  "import"),
        ("🔄", "Auto-Update",    "update"),
        ("🔍", "Verificar Eps",  "check"),
        ("📊", "Estatísticas",   "stats"),
        ("─",  "",               "sep"),
        ("☁️", "Push GitHub",    "push"),
        ("⬇️", "Pull GitHub",    "pull"),
    ]

    def __init__(self, master, on_nav, **kw):
        super().__init__(master, fg_color=SIDEBAR, corner_radius=0, width=220, **kw)
        self._on_nav = on_nav
        self._btns: dict[str, ctk.CTkButton] = {}
        self._active = "dashboard"
        self._build()

    def _build(self):
        # Logo
        logo_frame = ctk.CTkFrame(self, fg_color="#12082a", corner_radius=0, height=80)
        logo_frame.pack(fill="x")
        logo_frame.pack_propagate(False)
        ctk.CTkLabel(logo_frame, text="🎌", font=("Segoe UI Emoji", 28)).pack(pady=(14, 0))
        ctk.CTkLabel(logo_frame, text="ANIME ADMIN", font=("Segoe UI", 11, "bold"),
                     text_color=ACCENT2).pack()

        # Separator label
        ctk.CTkLabel(self, text="  MENU", font=("Segoe UI", 9, "bold"),
                     text_color=TEXT_MUTED, anchor="w").pack(fill="x", padx=12, pady=(18, 4))

        for icon, label, key in self.NAV_ITEMS:
            if key == "sep":
                ctk.CTkFrame(self, height=1, fg_color=BORDER).pack(fill="x", padx=16, pady=8)
                ctk.CTkLabel(self, text="  GIT", font=("Segoe UI", 9, "bold"),
                             text_color=TEXT_MUTED, anchor="w").pack(fill="x", padx=12, pady=(0, 4))
                continue
            btn = ctk.CTkButton(
                self,
                text=f"  {icon}  {label}",
                anchor="w",
                height=40,
                corner_radius=8,
                font=("Segoe UI", 13),
                fg_color="transparent",
                hover_color=BG3,
                text_color=TEXT_DIM,
                command=lambda k=key: self._nav(k),
            )
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
    """Card de anime na lista com capa, título, badges."""
    def __init__(self, master, anime: dict, on_select, on_edit, on_delete, on_update, **kw):
        super().__init__(master, fg_color=CARD, corner_radius=12,
                         border_width=1, border_color=BORDER, **kw)
        self._anime = anime
        self._img_ref = None
        self._build(anime, on_select, on_edit, on_delete, on_update)

    def _build(self, anime, on_select, on_edit, on_delete, on_update):
        self.bind("<Button-1>", lambda e: on_select(anime))

        # ── Cover (Pillow async) ──
        img_frame = ctk.CTkFrame(self, fg_color="transparent", width=72, height=102)
        img_frame.pack(side="left", padx=(12, 8), pady=10)
        img_frame.pack_propagate(False)
        self._cover_label = ctk.CTkLabel(img_frame, text="", width=72, height=102)
        self._cover_label.pack()

        # Load image in background
        url = anime.get("coverImage", "")
        def _load():
            photo = fetch_cover(url, (72, 102))
            self._img_ref = photo
            try:
                self._cover_label.configure(image=photo, text="")
            except:
                pass
        threading.Thread(target=_load, daemon=True).start()

        # ── Info ──
        info = ctk.CTkFrame(self, fg_color="transparent")
        info.pack(side="left", fill="both", expand=True, pady=10)

        seasons = anime.get("seasons", [])
        last    = seasons[-1] if seasons else {}
        status  = last.get("status", "?")
        is_movie= last.get("type") == "movie"
        cur     = last.get("currentEpisode", "?")
        tot     = last.get("episodes", "?")
        score   = last.get("score", 0) or 0

        # Title
        ctk.CTkLabel(info, text=anime.get("title","?")[:40],
                     font=("Segoe UI", 14, "bold"), text_color=TEXT,
                     anchor="w").pack(anchor="w")

        # Studio + year
        studio = anime.get("studio","?")
        year   = last.get("year","?")
        ctk.CTkLabel(info, text=f"{studio}  •  {year}",
                     font=("Segoe UI", 11), text_color=TEXT_DIM,
                     anchor="w").pack(anchor="w", pady=(2,4))

        # Badges row
        badges = ctk.CTkFrame(info, fg_color="transparent")
        badges.pack(anchor="w", pady=(0,6))

        # Status badge
        if is_movie:
            self._badge(badges, "🎬 FILME", MOVIE)
        elif status == "ongoing":
            self._badge(badges, "● ONGOING", ONLINE)
        else:
            self._badge(badges, "✓ FINALIZADO", ACCENT)

        # Season count
        self._badge(badges, f"S{len(seasons)}", "#3b82f6")

        # Episodes
        self._badge(badges, f"EP {cur}/{tot}", "#6b7280")

        # Score
        if score:
            self._badge(badges, f"★ {score}", WARNING)

        # Audios
        audios = [a["type"].upper() for s in seasons for a in s.get("audios",[]) if a.get("available")]
        for aud in set(audios):
            self._badge(badges, aud, "#8b5cf6")

        # ── Action buttons ──
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
        self._text = ctk.CTkTextbox(self, fg_color="transparent", text_color="#86efac",
                                    font=("Consolas", 12), state="disabled", wrap="word")
        self._text.pack(fill="both", expand=True, padx=4, pady=4)

    def write(self, msg: str):
        self._text.configure(state="normal")
        self._text.insert("end", msg + "\n")
        self._text.see("end")
        self._text.configure(state="disabled")

    def clear(self):
        self._text.configure(state="normal")
        self._text.delete("1.0", "end")
        self._text.configure(state="disabled")


class StatCard(ctk.CTkFrame):
    def __init__(self, master, label, value, color=ACCENT, icon="", **kw):
        super().__init__(master, fg_color=CARD, corner_radius=12,
                         border_width=1, border_color=BORDER, **kw)
        ctk.CTkLabel(self, text=icon, font=("Segoe UI Emoji", 20)).pack(pady=(12,0))
        ctk.CTkLabel(self, text=str(value), font=("Segoe UI", 26, "bold"),
                     text_color=color).pack()
        ctk.CTkLabel(self, text=label, font=("Segoe UI", 11),
                     text_color=TEXT_DIM).pack(pady=(0,12))


# ── Dialogs ───────────────────────────────────────────────────────────────────
class Dialog(ctk.CTkToplevel):
    def __init__(self, master, title, width=500, height=400):
        super().__init__(master)
        self.title(title)
        self.geometry(f"{width}x{height}")
        self.configure(fg_color=BG2)
        self.resizable(False, False)
        self.grab_set()
        self.lift()
        self.focus_force()
        self.result = None

    def _header(self, text):
        ctk.CTkLabel(self, text=text, font=("Segoe UI", 16, "bold"),
                     text_color=ACCENT2).pack(pady=(20, 4), padx=24, anchor="w")
        ctk.CTkFrame(self, height=1, fg_color=BORDER).pack(fill="x", padx=20, pady=(0,12))

    def _field(self, parent, label, default="", placeholder=""):
        ctk.CTkLabel(parent, text=label, font=("Segoe UI", 12),
                     text_color=TEXT_DIM).pack(anchor="w")
        var = ctk.StringVar(value=str(default))
        entry = ctk.CTkEntry(parent, textvariable=var, height=36, corner_radius=8,
                              fg_color=BG3, border_color=BORDER, text_color=TEXT,
                              placeholder_text=placeholder)
        entry.pack(fill="x", pady=(2, 10))
        return var

    def _switch(self, parent, label, default=True):
        row = ctk.CTkFrame(parent, fg_color="transparent")
        row.pack(fill="x", pady=4)
        ctk.CTkLabel(row, text=label, font=("Segoe UI", 12), text_color=TEXT_DIM).pack(side="left")
        var = ctk.BooleanVar(value=default)
        sw  = ctk.CTkSwitch(row, variable=var, text="", onvalue=True, offvalue=False,
                             progress_color=ACCENT)
        sw.pack(side="right")
        return var

    def _buttons(self, parent, ok_text="Confirmar", ok_color=ACCENT, cancel_cb=None, ok_cb=None):
        row = ctk.CTkFrame(parent, fg_color="transparent")
        row.pack(fill="x", pady=(8,0))
        ctk.CTkButton(row, text="Cancelar", fg_color=BG3, hover_color=BORDER,
                      text_color=TEXT_DIM, command=cancel_cb or self.destroy).pack(side="left")
        ctk.CTkButton(row, text=ok_text, fg_color=ok_color, hover_color=ACCENT2,
                      command=ok_cb).pack(side="right")


class AddAnimeDialog(Dialog):
    def __init__(self, master, on_submit):
        super().__init__(master, "Adicionar Anime", 520, 560)
        self._on_submit = on_submit
        self._build()

    def _build(self):
        self._header("➕  Adicionar Anime")
        scroll = ctk.CTkScrollableFrame(self, fg_color="transparent")
        scroll.pack(fill="both", expand=True, padx=20)

        self._name    = self._field(scroll, "Nome do anime (busca MAL)", placeholder="ex: Jujutsu Kaisen")
        self._slug    = self._field(scroll, "ID Slug (vazio = auto)", placeholder="ex: jujutsu-kaisen")
        self._eps     = self._field(scroll, "Episódios disponíveis", "0")
        self._max_eps = self._field(scroll, "Máx episódios (0 = igual disponível)", "0")
        self._season  = self._field(scroll, "Número da temporada", "1")
        self._avslug  = self._field(scroll, "AniVideo slug base (vazio = pular)", placeholder="ex: jujutsu-kaisen")

        row = ctk.CTkFrame(scroll, fg_color="transparent")
        row.pack(fill="x")
        ctk.CTkLabel(row, text="Tipo:", text_color=TEXT_DIM, font=("Segoe UI",12)).pack(side="left")
        self._type = ctk.CTkSegmentedButton(row, values=["Serie", "Filme"],
                                             selected_color=ACCENT, font=("Segoe UI",12))
        self._type.set("Serie")
        self._type.pack(side="right")

        self._has_sub = self._switch(scroll, "Tem Legendado?", True)
        self._has_dub = self._switch(scroll, "Tem Dublado?", False)

        self._buttons(scroll, "Adicionar", ACCENT, self.destroy, self._submit)

    def _submit(self):
        self._on_submit({
            "name":    self._name.get().strip(),
            "slug":    self._slug.get().strip(),
            "eps":     self._eps.get().strip(),
            "max_eps": self._max_eps.get().strip(),
            "season":  self._season.get().strip(),
            "avslug":  self._avslug.get().strip(),
            "is_movie":self._type.get() == "Filme",
            "has_sub": self._has_sub.get(),
            "has_dub": self._has_dub.get(),
        })
        self.destroy()


class EditAnimeDialog(Dialog):
    def __init__(self, master, anime: dict, on_submit):
        super().__init__(master, "Editar Anime", 520, 520)
        self._anime = anime
        self._on_submit = on_submit
        self._build()

    def _build(self):
        self._header(f"✏️  {self._anime.get('title','')}")
        scroll = ctk.CTkScrollableFrame(self, fg_color="transparent")
        scroll.pack(fill="both", expand=True, padx=20)

        a = self._anime
        last_s = a.get("seasons", [{}])[-1]
        self._title    = self._field(scroll, "Título", a.get("title",""))
        self._title_jp = self._field(scroll, "Título Japonês", a.get("titleJapanese",""))
        self._studio   = self._field(scroll, "Estúdio", a.get("studio",""))
        self._cover    = self._field(scroll, "Cover URL", a.get("coverImage",""))
        self._banner   = self._field(scroll, "Banner URL", a.get("bannerImage",""))

        # Status
        ctk.CTkLabel(scroll, text="Status última temporada:", text_color=TEXT_DIM,
                     font=("Segoe UI",12)).pack(anchor="w")
        self._status = ctk.CTkSegmentedButton(scroll, values=["ongoing", "finished"],
                                               selected_color=ACCENT, font=("Segoe UI",12))
        self._status.set(last_s.get("status","ongoing"))
        self._status.pack(fill="x", pady=(2,10))

        self._rec = self._switch(scroll, "Recomendado?", bool(a.get("recommended",False)))
        self._buttons(scroll, "Salvar", SUCCESS, self.destroy, self._submit)

    def _submit(self):
        self._on_submit({
            "title":    self._title.get(),
            "title_jp": self._title_jp.get(),
            "studio":   self._studio.get(),
            "cover":    self._cover.get(),
            "banner":   self._banner.get(),
            "status":   self._status.get(),
            "rec":      self._rec.get(),
        })
        self.destroy()


class ConfirmDialog(Dialog):
    def __init__(self, master, message, on_confirm, title="Confirmar"):
        super().__init__(master, title, 400, 200)
        self._build(message, on_confirm)

    def _build(self, message, on_confirm):
        self._header("⚠️  Confirmar ação")
        ctk.CTkLabel(self, text=message, font=("Segoe UI",13),
                     text_color=TEXT, wraplength=340).pack(pady=16, padx=24)
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
        super().__init__(master, "Git Push", 480, 220)
        self._on_push = on_push
        self._build()

    def _build(self):
        self._header(f"☁️  Push → branch '{GIT_BRANCH}'")
        inner = ctk.CTkFrame(self, fg_color="transparent")
        inner.pack(fill="x", padx=20)
        default = f"chore: update database [{datetime.now().strftime('%d/%m/%Y %H:%M')}]"
        self._msg = self._field(inner, "Mensagem do commit:", default)
        self._buttons(inner, "🚀 Push", ACCENT, self.destroy, self._submit)

    def _submit(self):
        msg = self._msg.get().strip() or "chore: update database"
        self._on_push(msg)
        self.destroy()


class ImportDialog(Dialog):
    def __init__(self, master, on_import):
        super().__init__(master, "Importar JSON", 480, 200)
        self._on_import = on_import
        self._build()

    def _build(self):
        self._header("📂  Importar Anime via JSON")
        inner = ctk.CTkFrame(self, fg_color="transparent")
        inner.pack(fill="x", padx=20)
        self._path = self._field(inner, "Caminho do arquivo:", placeholder="./meu-anime.json")

        def _browse():
            from tkinter import filedialog
            path = filedialog.askopenfilename(filetypes=[("JSON","*.json")])
            if path:
                self._path.set(path)

        ctk.CTkButton(inner, text="Procurar...", width=100, fg_color=BG3,
                      hover_color=BORDER, command=_browse).pack(anchor="w", pady=(0,8))
        self._buttons(inner, "Importar", SUCCESS, self.destroy, self._submit)

    def _submit(self):
        path = self._path.get().strip().strip('"')
        self._on_import(path)
        self.destroy()


# ── Main App ──────────────────────────────────────────────────────────────────
class AnimeAdminApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("dark-blue")
        self.title("🎌 Anime Admin Panel — HenzoPaes")
        self.geometry("1200x750")
        self.minsize(900, 600)
        self.configure(fg_color=BG)
        self.db: list = []
        self._selected_anime: dict | None = None
        self._content_frames: dict[str, ctk.CTkFrame] = {}
        self._log: LogBox | None = None
        self.current_page: str = "dashboard"
        self._build_ui()
        self.after(200, self._on_mount)

    def _build_ui(self):
        # Sidebar
        self._sidebar = Sidebar(self, on_nav=self._navigate)
        self._sidebar.pack(side="left", fill="y")

        # Main area
        self._main = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        self._main.pack(side="left", fill="both", expand=True)

        # Topbar
        self._topbar = ctk.CTkFrame(self._main, fg_color=BG2, height=52, corner_radius=0)
        self._topbar.pack(fill="x")
        self._topbar.pack_propagate(False)
        self._page_title_lbl = ctk.CTkLabel(
            self._topbar, text="Dashboard",
            font=("Segoe UI", 16, "bold"), text_color=TEXT
        )
        self._page_title_lbl.pack(side="left", padx=24, pady=14)
        self._status_lbl = ctk.CTkLabel(
            self._topbar, text="", font=("Segoe UI", 11), text_color=SUCCESS
        )
        self._status_lbl.pack(side="right", padx=24)

        # Content stack
        self._content = ctk.CTkFrame(self._main, fg_color=BG, corner_radius=0)
        self._content.pack(fill="both", expand=True, padx=0, pady=0)

    def _set_status(self, msg, color=SUCCESS):
        self._status_lbl.configure(text=msg, text_color=color)

    def _on_mount(self):
        self.db = load_db()
        self._navigate("dashboard")
        if not self.db:
            self._set_status("Database vazia — use Pull ou Importar JSON", WARNING)

    # ── Navigation ────────────────────────────────────────────────────────────
    def _navigate(self, page: str):
        # Clear content
        for w in self._content.winfo_children():
            w.destroy()
        self.current_page = page

        titles = {
            "dashboard": "🏠  Dashboard",
            "list":      "📋  Lista de Animes",
            "update":    "🔄  Auto-Update",
            "check":     "🔍  Verificar Episódios",
            "stats":     "📊  Estatísticas",
            "add":       "➕  Adicionar Anime",
            "import":    "📂  Importar JSON",
            "push":      "☁️  Git Push",
            "pull":      "⬇️  Pull GitHub",
        }
        self._page_title_lbl.configure(text=titles.get(page, page))

        if page == "dashboard": self._page_dashboard()
        elif page == "list":    self._page_list()
        elif page == "update":  self._page_update(dry=False)
        elif page == "check":   self._page_update(dry=True)
        elif page == "stats":   self._page_stats()
        elif page == "add":     AddAnimeDialog(self, self._do_add_anime)
        elif page == "import":  ImportDialog(self, self._do_import)
        elif page == "push":    PushDialog(self, self._do_push)
        elif page == "pull":    self._do_pull()

    # ── Dashboard ─────────────────────────────────────────────────────────────
    def _page_dashboard(self):
        db     = self.db
        ongoing = sum(1 for a in db if any(s.get("status")=="ongoing" for s in a.get("seasons",[])))
        finished= len(db) - ongoing
        total_ep= sum(s.get("currentEpisode",0) for a in db for s in a.get("seasons",[]))
        has_dub = sum(1 for a in db if any(
            aud.get("available") and aud.get("type")=="dub"
            for s in a.get("seasons",[]) for aud in s.get("audios",[])))
        movies  = sum(1 for a in db for s in a.get("seasons",[]) if s.get("type")=="movie")

        f = ctk.CTkFrame(self._content, fg_color="transparent")
        f.pack(fill="both", expand=True, padx=28, pady=28)

        # Stats grid
        cards_row = ctk.CTkFrame(f, fg_color="transparent")
        cards_row.pack(fill="x", pady=(0,20))
        stats = [
            ("Total Animes",   len(db),    ACCENT,   "📦"),
            ("Em Andamento",   ongoing,    ONLINE,   "🟢"),
            ("Finalizados",    finished,   "#3b82f6","✅"),
            ("Com Dublagem",   has_dub,    ACCENT2,  "🎙️"),
            ("Episódios",      total_ep,   WARNING,  "🎬"),
            ("Filmes",         movies,     MOVIE,    "🎥"),
        ]
        for label, val, color, icon in stats:
            card = StatCard(cards_row, label, val, color, icon)
            card.pack(side="left", padx=6, pady=4, ipadx=8)

        # Info banner
        info = ctk.CTkFrame(f, fg_color=CARD, corner_radius=12, border_width=1, border_color=BORDER)
        info.pack(fill="x", pady=(0,16))
        ctk.CTkLabel(info, text="Repositório & Branch",
                     font=("Segoe UI",13,"bold"), text_color=ACCENT2).pack(anchor="w", padx=16, pady=(14,2))
        ctk.CTkLabel(info, text=f"  Repo   : {GITHUB_REPO}",
                     font=("Consolas",12), text_color=TEXT_DIM).pack(anchor="w", padx=16)
        ctk.CTkLabel(info, text=f"  Branch : {GIT_BRANCH}",
                     font=("Consolas",12), text_color=TEXT_DIM).pack(anchor="w", padx=16, pady=(0,14))

        # Quick actions
        ctk.CTkLabel(f, text="Ações Rápidas", font=("Segoe UI",14,"bold"),
                     text_color=TEXT).pack(anchor="w", pady=(4,8))
        row = ctk.CTkFrame(f, fg_color="transparent")
        row.pack(fill="x")
        actions = [
            ("➕ Adicionar Anime",    ACCENT,   lambda: self._navigate("add")),
            ("🔄 Auto-Update Todos",  SUCCESS,  lambda: self._navigate("update")),
            ("🔍 Verificar Eps",      "#3b82f6",lambda: self._navigate("check")),
            ("☁️  Push GitHub",       "#6366f1", lambda: self._navigate("push")),
            ("⬇️  Pull GitHub",       BG3,       lambda: self._navigate("pull")),
        ]
        for txt, color, cmd in actions:
            ctk.CTkButton(row, text=txt, fg_color=color, hover_color=ACCENT2,
                          height=38, corner_radius=8, font=("Segoe UI",13),
                          command=cmd).pack(side="left", padx=6)

    # ── List ──────────────────────────────────────────────────────────────────
    def _page_list(self):
        f = ctk.CTkFrame(self._content, fg_color="transparent")
        f.pack(fill="both", expand=True)

        # Searchbar
        top = ctk.CTkFrame(f, fg_color="transparent")
        top.pack(fill="x", padx=20, pady=(16,8))
        self._search_var = ctk.StringVar()
        search = ctk.CTkEntry(top, textvariable=self._search_var, placeholder_text="🔍 Buscar anime...",
                               height=38, corner_radius=10, fg_color=BG3, border_color=BORDER,
                               text_color=TEXT, font=("Segoe UI",13), width=300)
        search.pack(side="left")
        self._search_var.trace_add("write", lambda *_: self._refresh_list())
        ctk.CTkButton(top, text="➕ Adicionar", fg_color=ACCENT, height=38, corner_radius=8,
                      command=lambda: AddAnimeDialog(self, self._do_add_anime)).pack(side="right")
        ctk.CTkButton(top, text="📂 Importar", fg_color=BG3, height=38, corner_radius=8,
                      hover_color=BORDER, command=lambda: ImportDialog(self, self._do_import)
                      ).pack(side="right", padx=8)

        # Scrollable list
        self._list_scroll = ctk.CTkScrollableFrame(f, fg_color="transparent",
                                                    scrollbar_button_color=BG3)
        self._list_scroll.pack(fill="both", expand=True, padx=12, pady=(0,12))
        self._refresh_list()

    def _refresh_list(self):
        q = self._search_var.get().lower().strip() if hasattr(self, "_search_var") else ""
        for w in self._list_scroll.winfo_children():
            w.destroy()
        filtered = [a for a in self.db if q in a.get("title","").lower() or q in a.get("id","").lower()] if q else self.db

        if not filtered:
            ctk.CTkLabel(self._list_scroll, text="Nenhum anime encontrado.",
                         text_color=TEXT_DIM, font=("Segoe UI",14)).pack(pady=40)
            return

        for anime in filtered:
            card = AnimeCard(
                self._list_scroll, anime,
                on_select = lambda a: None,
                on_edit   = self._open_edit,
                on_delete = lambda a: ConfirmDialog(self, f"Remover '{a['title']}'?",
                                                    lambda x=a: self._do_delete(x)),
                on_update = self._do_update_one_anime,
            )
            card.pack(fill="x", padx=8, pady=5)

    # ── Update / Check ────────────────────────────────────────────────────────
    def _page_update(self, dry=False):
        f = ctk.CTkFrame(self._content, fg_color="transparent")
        f.pack(fill="both", expand=True, padx=20, pady=20)

        title  = "Verificar Novos Episódios (Dry Run)" if dry else "Auto-Update Todos os Animes"
        subtitle = "Apenas verifica, não salva nada." if dry else "Verifica e adiciona novos eps no AniVideo CDN."

        ctk.CTkLabel(f, text=title, font=("Segoe UI",16,"bold"), text_color=ACCENT2).pack(anchor="w")
        ctk.CTkLabel(f, text=subtitle, font=("Segoe UI",12), text_color=TEXT_DIM).pack(anchor="w", pady=(2,12))

        btn_row = ctk.CTkFrame(f, fg_color="transparent")
        btn_row.pack(fill="x", pady=(0,12))
        label_btn = "🔍 Verificar Agora" if dry else "🚀 Iniciar Update"
        ctk.CTkButton(btn_row, text=label_btn, fg_color=ACCENT, height=40, corner_radius=8,
                      font=("Segoe UI",13), command=lambda: self._run_update(log, dry=dry)).pack(side="left")
        ctk.CTkButton(btn_row, text="🗑️ Limpar Log", fg_color=BG3, height=40, corner_radius=8,
                      hover_color=BORDER, command=lambda: log.clear()).pack(side="left", padx=10)

        log = LogBox(f)
        log.pack(fill="both", expand=True)
        log.write("Pronto. Pressione o botão acima para iniciar.")
        self._log = log

    def _run_update(self, log: LogBox, dry=False):
        log.clear()
        mode = "VERIFICAÇÃO (dry run)" if dry else "UPDATE COMPLETO"
        log.write(f"╔══ {mode} ══╗\n")
        def _worker():
            changed = []
            for anime in self.db:
                seasons = anime.get("seasons", [])
                has_ongoing = any(s.get("status") == "ongoing" for s in seasons)
                if not has_ongoing:
                    continue

                title = anime["title"]
                self.after(0, log.write, f"\n▶  {title}")
                self.after(0, log.write,  "─" * 50)

                # Mostra situação atual por temporada/áudio
                for info in get_audio_ep_counts(anime):
                    if info["status"] == "finished" and info["type"] != "movie":
                        continue
                    parts = []
                    if info["sub"] is not None:
                        parts.append(f"LEG: {info['sub']:02d} eps")
                    if info["dub"] is not None:
                        parts.append(f"DUB: {info['dub']:02d} eps")
                    max_str = f"/{info['max']}" if info["max"] else ""
                    self.after(0, log.write,
                        f"  [{info['label']}]  {' | '.join(parts)}{max_str}")

                if dry:
                    # Verifica SUB e DUB separadamente no CDN
                    checks = check_next_ep_per_audio(anime)
                    if not checks:
                        self.after(0, log.write, "  (sem temporadas em andamento)")
                        continue

                    anime_changed = False
                    for chk in checks:
                        audio_tag  = "LEG" if chk["audio"] == "sub" else "DUB"
                        cur        = chk["current"]
                        next_e     = chk["next_ep"]
                        max_e      = chk["max"]
                        max_str    = f"/{max_e}" if max_e else ""
                        self.after(0, log.write,
                            f"  [{audio_tag}] S{chk['season']} — atual: {cur:02d}{max_str} → checando {next_e:02d}...")
                        exists = av_ep_exists(chk["path"], next_e)
                        if exists:
                            self.after(0, log.write,
                                f"  [{audio_tag}] ✅  Ep {next_e:02d} DISPONÍVEL!")
                            anime_changed = True
                        else:
                            self.after(0, log.write,
                                f"  [{audio_tag}] ❌  Ep {next_e:02d} não disponível.")

                    if anime_changed:
                        changed.append(title)
                else:
                    # Update real
                    msgs = try_add_next_ep(anime)
                    for m in msgs:
                        self.after(0, log.write, m)
                    if any("✅" in m or "[OK]" in m for m in msgs):
                        changed.append(title)

            if not dry and changed:
                save_db(self.db)
                self.after(0, self._refresh_list_if_open)

            self.after(0, log.write, "")
            if changed:
                self.after(0, log.write, f"╔══ ✅  {len(changed)} anime(s) com novos eps ══╗")
                for c in changed:
                    self.after(0, log.write, f"  ✓  {c}")
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

        # Genre chart
        genres: dict[str,int] = {}
        for a in self.db:
            for g in a.get("genre",[]):
                genres[g] = genres.get(g,0) + 1
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
            pct = count / max_n
            bar = ctk.CTkProgressBar(row, height=16, corner_radius=6,
                                      progress_color=ACCENT, fg_color=BG3, width=260)
            bar.set(pct)
            bar.pack(side="left", padx=8)
            ctk.CTkLabel(row, text=str(count), font=("Segoe UI",12,"bold"),
                         text_color=ACCENT2).pack(side="left")

        # Ongoing list
        ctk.CTkLabel(f, text="Em andamento", font=("Segoe UI",15,"bold"),
                     text_color=ACCENT2).pack(anchor="w", pady=(8,8))
        ongoing = [a for a in self.db if any(s.get("status")=="ongoing" for s in a.get("seasons",[]))]
        for a in ongoing[:15]:
            last = a.get("seasons",[{}])[-1]
            row  = ctk.CTkFrame(f, fg_color=CARD, corner_radius=8, border_width=1, border_color=BORDER)
            row.pack(fill="x", pady=3)
            ctk.CTkLabel(row, text=a.get("title","")[:35],
                         font=("Segoe UI",13), text_color=TEXT, anchor="w").pack(side="left", padx=12, pady=8)
            ctk.CTkLabel(row, text=f"S{len(a.get('seasons',[]))} · Ep {last.get('currentEpisode','?')}/{last.get('episodes','?')}",
                         font=("Segoe UI",12), text_color=TEXT_DIM).pack(side="right", padx=12)

    # ── CRUD actions ──────────────────────────────────────────────────────────
    def _do_add_anime(self, data: dict):
        if not data.get("name"):
            return
        self._navigate("update")
        def _worker():
            log = self._log
            def wlog(m): self.after(0, log.write, m)
            name     = data["name"]
            id_slug  = data["slug"] or re.sub(r"[^a-z0-9]+","-",name.lower()).strip("-")
            total_eps= int(data["eps"]    or 0)
            max_eps  = int(data["max_eps"] or 0) or total_eps
            s_num    = int(data["season"] or 1)
            avslug   = data["avslug"].strip()
            has_sub  = data["has_sub"]
            has_dub  = data["has_dub"]
            is_movie = data.get("is_movie", False)

            wlog(f"Buscando '{name}' no MAL...")
            mal = fetch_mal(name)
            if mal:
                title_r = mal.get("title", name)
                title_j = mal.get("title_japanese", name)
                genres  = [g["name"] for g in mal.get("genres",[])]
                studios = [s["name"] for s in mal.get("studios",[])]
                studio  = studios[0] if studios else "Desconhecido"
                mal_id  = mal.get("mal_id",0)
                cover   = mal.get("images",{}).get("jpg",{}).get("large_image_url","")
                score   = mal.get("score",0.0) or 0.0
                synopsis= mal.get("synopsis","")
                trailer = mal.get("trailer",{}).get("url","") or ""
                year    = mal.get("year") or datetime.now().year
                status_api = "finished" if mal.get("status")=="Finished Airing" else "ongoing"
                wlog(f"✅ MAL: {title_r} ({year})")
            else:
                title_r=title_j=name; genres=[]; studio="Desconhecido"; mal_id=0
                cover=""; score=0.0; synopsis=""; trailer=""; year=datetime.now().year
                status_api="ongoing"
                wlog("⚠️ MAL não encontrado. Usando defaults.")

            av_sub = av_dub = None
            if avslug:
                letter = avslug[0].lower()
                av_sub = f"{letter}/{avslug}" + (f"-{s_num}" if s_num > 1 else "")
                av_dub = av_sub + "-dublado"
                wlog(f"AniVideo sub: {av_sub}")
                wlog(f"AniVideo dub: {av_dub}")

            ep_list = []
            for ep_i in range(1, total_eps+1):
                embeds = {}
                if av_sub and has_sub: embeds["sub"] = make_iframe(anivideo_url(av_sub, ep_i))
                if av_dub and has_dub: embeds["dub"] = make_iframe(anivideo_url(av_dub, ep_i))
                ep_list.append({
                    "id": f"{id_slug}-s{s_num}-ep{ep_i}",
                    "number": ep_i,
                    "title": f"{title_r} - T{s_num} Ep {ep_i}",
                    "season": str(s_num),
                    "embeds": embeds,
                    "embedCredit": "api.anivideo.net" if (av_sub or av_dub) else "",
                })

            season_data = {
                "season": s_num, "seasonLabel": f"{s_num}ª Temporada",
                "year": year, "episodes": max_eps, "currentEpisode": total_eps,
                "status": status_api, "score": score, "synopsis": synopsis,
                "trailer": trailer,
                "audios": [
                    {"type":"sub","label":"Legendado","available":has_sub,"episodesAvailable":total_eps if has_sub else 0},
                    {"type":"dub","label":"Dublado",  "available":has_dub,"episodesAvailable":total_eps if has_dub else 0},
                ],
                "episodeList": ep_list,
            }
            if is_movie:
                season_data["type"] = "movie"
                season_data["movieTitle"] = title_r
                season_data["seasonLabel"] = title_r

            new_anime = {
                "id": id_slug, "title": title_r, "titleRomaji": title_r,
                "titleJapanese": title_j, "genre": genres, "studio": studio,
                "recommended": False, "malId": mal_id, "coverImage": cover,
                "bannerImage": cover, "seasons": [season_data],
            }
            self.db = [a for a in self.db if a.get("id") != id_slug]
            self.db.append(new_anime)
            save_db(self.db)
            wlog(f"✅ '{title_r}' adicionado com {total_eps} eps!")
            self.after(0, self._set_status, f"'{title_r}' adicionado!")

        threading.Thread(target=_worker, daemon=True).start()

    def _open_edit(self, anime: dict):
        EditAnimeDialog(self, anime, lambda d: self._do_edit(anime, d))

    def _do_edit(self, anime: dict, data: dict):
        anime["title"] = anime["titleRomaji"] = data["title"]
        anime["titleJapanese"] = data["title_jp"]
        anime["studio"]        = data["studio"]
        anime["coverImage"]    = data["cover"]
        anime["bannerImage"]   = data["banner"]
        anime["recommended"]   = data["rec"]
        if anime.get("seasons"):
            anime["seasons"][-1]["status"] = data["status"]
        save_db(self.db)
        self._set_status(f"'{anime['title']}' atualizado!")
        self._navigate("list")

    def _do_delete(self, anime: dict):
        self.db = [a for a in self.db if a.get("id") != anime.get("id")]
        fp = os.path.join(ANIMES_FOLDER, f"{anime['id']}.json")
        if os.path.exists(fp): os.remove(fp)
        save_db(self.db)
        self._set_status(f"'{anime['title']}' removido!", WARNING)
        self._navigate("list")

    def _refresh_list_if_open(self):
        """Atualiza a lista de animes se a página de lista estiver ativa."""
        if self.current_page == "list":
            self._refresh_list()

    def _do_update_one_anime(self, anime: dict):
        self._navigate("update")
        def _worker():
            log = self._log
            def wlog(m): self.after(0, log.write, m)

            wlog(f"▶  Atualizando: {anime['title']}")
            wlog("─" * 50)

            # Mostra estado atual por áudio
            for info in get_audio_ep_counts(anime):
                parts = []
                if info["sub"] is not None: parts.append(f"LEG: {info['sub']:02d} eps")
                if info["dub"] is not None: parts.append(f"DUB: {info['dub']:02d} eps")
                max_str = f"/{info['max']}" if info["max"] else ""
                wlog(f"  [{info['label']}]  {' | '.join(parts)}{max_str}")

            wlog("")
            msgs = try_add_next_ep(anime)
            for m in msgs:
                wlog(m)

            save_db(self.db)
            wlog("\n✅ Concluído!")
            self.after(0, self._set_status, f"'{anime['title']}' atualizado!")

        threading.Thread(target=_worker, daemon=True).start()

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

    def _do_push(self, msg: str):
        self._set_status("Fazendo push...", WARNING)
        def _worker():
            result = do_git_push(msg)
            self.after(0, self._set_status, f"Git: {result[:80]}")
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
    app = AnimeAdminApp()
    app.mainloop()