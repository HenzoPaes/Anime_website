#!/usr/bin/env python3
"""
ANIME OPS — Admin Panel v2
pip install flask requests
pip install playwright && playwright install chromium  (opcional, para CR banner)
"""

from __future__ import annotations
import re, os, sys, time, json, subprocess, threading, io, queue, base64
from datetime import datetime, timedelta
from urllib.parse import quote_plus, urljoin

try:
    from playwright.sync_api import sync_playwright as _sync_playwright
    PLAYWRIGHT_OK = True
except ImportError:
    PLAYWRIGHT_OK = False

import requests
from flask import Flask, jsonify, request, render_template, Response, stream_with_context

app = Flask(__name__)

# ── Config ─────────────────────────────────────────────────────────────────────
LOG_FILE        = "anime_admin_log.json"
GITHUB_RAW_URL  = "https://raw.githubusercontent.com/HenzoPaes/Anime_website/refs/heads/data/output.json"
GITHUB_REPO     = "https://github.com/HenzoPaes/Anime_website.git"
GIT_BRANCH      = "data"
ANIMES_FOLDER   = "./api/Animes"
OUTPUT_FILE     = "output.json"
ANIVIDEO_WRAP   = "https://api.anivideo.net/videohls.php"
ANIVIDEO_CDN    = "https://cdn-s01.mywallpaper-4k-image.net/stream"
AONLINECC_BASE  = "https://animesonlinecc.to"
TOPANIMES_BASE  = "https://topanimes.net"
GOYABU_BASE     = "https://goyabu.io"              # domínio real confirmado via HTML2
GOYABU_AJAX     = f"{GOYABU_BASE}/wp-admin/admin-ajax.php"
PAGECONFIG_FILE = "pageconfig.json"
SETTINGS_FILE   = "animeops_settings.json"

_DEFAULT_SETTINGS = {
    "auto_update_enabled":   False,   # trigger periódico ativo?
    "auto_update_interval":  60,      # intervalo em minutos (0 = desligado)
    "auto_update_times":     [],      # ex: ["16:00", "23:00"]
    "auto_push_enabled":     False,   # git push após cada auto-update?
    "auto_verify_enabled":   False,   # verificar eps novos após update?
    "notify_log":            True,    # gravar eventos no log?
}

# Scheduler state (runtime only)
_scheduler_lock  = threading.Lock()
_scheduler_state = {
    "thread": None,
    "stop_event": threading.Event(),
    "last_run": None,
    "next_run": None,
    "running_now": False,
}

_DEFAULT_PAGECONFIG = {
    "featuredAnimeId": "",
    "heroBadgeText": "⭐ Melhor avaliado",
    "heroCtaText": "Assistir agora",
    "siteTitle": "AnimeVerse — Seu portal de animes",
    "catalogTitle": "Todos os Animes",
    "showRandomButton": True,
    "featuredBannerBlur": False,
    "pinnedGenres": [],
    "announcement": {
        "enabled": False,
        "text": "",
        "type": "info",
        "dismissible": True,
    },
    "lastUpdated": "",
}

# ── SSE registry ───────────────────────────────────────────────────────────────
_streams: dict[str, queue.Queue] = {}
_LOG_LOCK = threading.Lock()


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def make_iframe(src: str) -> str:
    return f'<iframe width="100%" height="100%" src="{src}" frameborder="0" allowfullscreen></iframe>'

def _normalize_iframe(raw: str) -> str:
    tag = raw.strip()
    if 'width=' not in tag:
        tag = tag.replace('<iframe', '<iframe width="100%" height="100%"', 1)
    if 'allowfullscreen' not in tag.lower():
        tag = re.sub(r'(/?>)$', ' allowfullscreen></iframe>', tag)
    if not tag.endswith('</iframe>'):
        tag = re.sub(r'\s*/?>$', '></iframe>', tag)
    return tag


# ═══════════════════════════════════════════════════════════════════════════════
# SOURCE: AniVideo
# ═══════════════════════════════════════════════════════════════════════════════

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
    except Exception:
        return False


# ═══════════════════════════════════════════════════════════════════════════════
# SOURCE: AnimesOnlineCC
# ═══════════════════════════════════════════════════════════════════════════════

_AONLINECC_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "pt-BR,pt;q=0.9",
}

def aonlinecc_ep_url(slug: str, season: int, ep: int, inc_season_num: bool = True) -> str:
    if inc_season_num and season > 1:
        return f"{AONLINECC_BASE}/episodio/{slug}-{season}-episodio-{ep}/"
    return f"{AONLINECC_BASE}/episodio/{slug}-episodio-{ep}/"

def scrape_aonlinecc_ep(slug: str, season: int, ep: int, inc_season_num: bool = True) -> dict | None:
    """
    Retorna embeds do episódio ou None se não encontrado.
    Regra: option-1 sozinha = LEG; option-1 + option-2 = DUB + LEG
    """
    url = aonlinecc_ep_url(slug, season, ep, inc_season_num)
    try:
        r = requests.get(url, timeout=15, headers=_AONLINECC_HEADERS, allow_redirects=True)
        if r.status_code >= 400:
            return None
        html = r.text
        playex_m = re.search(
            r'<div[^>]+class=["\'][^"\']*playex[^"\']*["\'][^>]*>(.*?)</div>\s*</div>\s*</div>',
            html, re.S
        )
        scope = playex_m.group(0) if playex_m else html

        def extract_option(opt_id: str, text: str):
            blk = re.search(rf'id="{opt_id}"[^>]*>(.*?)</div>', text, re.S)
            if not blk:
                return None
            ifr = re.search(r'(<iframe[^>]+src="([^"]+)"[^>]*/?>(?:</iframe>)?)', blk.group(1), re.S)
            return ifr.group(1) if ifr else None

        opt1 = extract_option("option-1", scope)
        opt2 = extract_option("option-2", scope)
        if not opt1:
            return None
        if opt2:
            return {"dub": _normalize_iframe(opt1), "sub": _normalize_iframe(opt2)}
        return {"sub": _normalize_iframe(opt1)}
    except Exception:
        return None

def aonlinecc_ep_exists(slug: str, season: int, ep: int, inc_season_num: bool = True) -> bool:
    url = aonlinecc_ep_url(slug, season, ep, inc_season_num)
    try:
        r = requests.head(url, timeout=8, headers=_AONLINECC_HEADERS, allow_redirects=True)
        return r.status_code < 400
    except Exception:
        return False


# ═══════════════════════════════════════════════════════════════════════════════
# SOURCE: TopAnimes
# ═══════════════════════════════════════════════════════════════════════════════

_TOPANIMES_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer":    "https://topanimes.net/",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

def topanimes_ep_url(slug: str, ep: int, is_dub: bool = False) -> str:
    if is_dub:
        return f"{TOPANIMES_BASE}/episodio/{slug}-dublado-episodio-{ep}/"
    return f"{TOPANIMES_BASE}/episodio/{slug}-episodio-{ep}/"

def scrape_topanimes_ep(slug: str, ep: int, is_dub: bool = False,
                        source_num: int | None = None) -> dict:
    url = topanimes_ep_url(slug, ep, is_dub)
    try:
        r = requests.get(url, timeout=15, headers=_TOPANIMES_HEADERS, allow_redirects=True)
        if r.status_code >= 400:
            return {}
        html = r.text
        names: dict[int, str] = {}
        for m in re.finditer(
            r'''<li[^>]+data-nume=['"](\d+)['"][^>]*>.*?<span class=['"]title['"]>([^<]+)</span>''',
            html, re.DOTALL
        ):
            names[int(m.group(1))] = m.group(2).strip()
        sources: dict[int, dict] = {}
        for m in re.finditer(
            r"""<div id=['"]source-player-(\d+)['"][^>]*>.*?<iframe[^>]+src=['"]([^'"]+)['"]""",
            html, re.DOTALL
        ):
            num = int(m.group(1))
            src = m.group(2).replace("&amp;", "&")
            sources[num] = {"name": names.get(num, f"Fonte {num}"), "src": src}
        if not sources:
            return {}
        if source_num is not None:
            if source_num in sources:
                return {source_num: sources[source_num]}
            first_k = sorted(sources)[0]
            sources[first_k]["_fallback"] = True
            sources[first_k]["_wanted"]   = source_num
            return {first_k: sources[first_k]}
        return sources
    except Exception:
        return {}

def topanimes_build_embeds(sub_sources: dict, dub_sources: dict) -> dict:
    embeds: dict = {}
    if sub_sources:
        v = sorted(sub_sources.items())[0][1]
        embeds["sub"] = f'<iframe src="{v["src"]}" frameborder="0" allowfullscreen></iframe>'
    if dub_sources:
        v = sorted(dub_sources.items())[0][1]
        embeds["dub"] = f'<iframe src="{v["src"]}" frameborder="0" allowfullscreen></iframe>'
    return embeds


# ═══════════════════════════════════════════════════════════════════════════════
# SOURCE: Goyabu  ← TODO: implementar quando o HTML2 chegar
# ═══════════════════════════════════════════════════════════════════════════════

_GOYABU_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "pt-BR,pt;q=0.9",
    "Referer": f"{GOYABU_BASE}/",
    "X-Requested-With": "XMLHttpRequest",
}

# ── Goyabu helpers ─────────────────────────────────────────────────────────────

def goyabu_get_anime_id(slug: str) -> str | None:
    """
    Busca o streamer_id (WordPress post ID do anime) a partir do slug.
    Ex: 'rezero-kara-hajimeru-isekai-seikatsu-dublado' → '41079'
    """
    url = f"{GOYABU_BASE}/anime/{slug}"
    try:
        r = requests.get(url, timeout=12, headers=_GOYABU_HEADERS)
        m = re.search(r'var streamer_id\s*=\s*Number\("(\d+)"\)', r.text)
        if m:
            return m.group(1)
        # fallback: buscar no HTML inline
        m2 = re.search(r"streamer_id\s*=\s*['\"]?(\d+)['\"]?", r.text)
        return m2.group(1) if m2 else None
    except Exception:
        return None

def goyabu_get_episodes(anime_id: str) -> list[dict]:
    """
    Retorna lista de episódios via AJAX do WordPress.
    Cada item: {"id": post_id, "episodio": "1", "link": "/41081/", ...}
    """
    try:
        r = requests.get(
            GOYABU_AJAX,
            params={"action": "get_anime_episodes", "anime_id": anime_id},
            timeout=12, headers=_GOYABU_HEADERS,
        )
        data = r.json()
        return data.get("data", []) if data.get("success") else []
    except Exception:
        return []

def goyabu_get_post_id(slug: str, ep: int | str) -> int | None:
    """
    Resolve slug + número do episódio → post_id do WordPress.
    """
    anime_id = goyabu_get_anime_id(slug)
    if not anime_id:
        return None
    episodes = goyabu_get_episodes(anime_id)
    for item in episodes:
        if str(item.get("episodio", "")).lstrip("0") == str(ep).lstrip("0"):
            return int(item["id"])
    return None

def _goyabu_decode_token(blogger_token: str) -> list[dict]:
    """
    Chama admin-ajax.php?action=decode_blogger_video e retorna lista de sources.
    Cada source: {"size": 720, "sizeText": "HD", "src": "https://...", "type": "video/mp4"}
    """
    try:
        r = requests.post(
            GOYABU_AJAX,
            data={"action": "decode_blogger_video", "token": blogger_token},
            timeout=20, headers=_GOYABU_HEADERS,
        )
        result = r.json()
        if result.get("success"):
            return result.get("data", {}).get("play", [])
    except Exception:
        pass
    return []

def _goyabu_decrypt_url(encrypted: str) -> str | None:
    """
    Decifra a URL criptografada do Player 2 (iframe):
    atob(encrypted).split('').reverse().join('')
    """
    try:
        decoded = base64.b64decode(encrypted + "==").decode("utf-8", errors="ignore")
        return decoded[::-1]
    except Exception:
        return None

def scrape_goyabu_ep(slug: str, ep: int | str) -> dict | None:
    """
    Raspa um episódio do Goyabu.io e retorna os embeds.

    Fluxo:
      1. slug → streamer_id (página do anime)
      2. streamer_id → post_id do episódio (AJAX get_anime_episodes)
      3. post_id → página do episódio → extrai blogger_token
      4. blogger_token → AJAX decode_blogger_video → URL do mp4
      5. Retorna {"dub": "<iframe ...>"} ou {"sub": "<iframe ...>"}
         (baseado em "dublado" no título)

    Retorna None se episódio não encontrado ou erro.
    """
    post_id = goyabu_get_post_id(slug, ep)
    if not post_id:
        return None

    try:
        r = requests.get(
            f"{GOYABU_BASE}/{post_id}",
            timeout=12, headers=_GOYABU_HEADERS,
        )
        if r.status_code >= 400:
            return None
        html = r.text
    except Exception:
        return None

    # Detectar DUB/SUB pelo título da página
    title_m = re.search(r'<b[^>]*class="title-post[^"]*"[^>]*>(.*?)</b>', html, re.DOTALL)
    title_txt = (title_m.group(1) if title_m else "").lower()
    audio_key = "dub" if "dublado" in title_txt else "sub"

    # ── Estratégia 1: blogger_token no playersData ───────────────────────────
    token_m = re.search(r'"blogger_token"\s*:\s*"([^"]+)"', html)
    if token_m:
        sources = _goyabu_decode_token(token_m.group(1))
        if sources:
            sources.sort(key=lambda x: x.get("size", 0), reverse=True)
            # Preferir 720p+, senão melhor disponível
            best = next((s for s in sources if s.get("size", 0) >= 720), sources[0])
            video_url = best.get("src", "")
            if video_url:
                iframe = (
                    f'<video src="{video_url}" controls width="100%" '
                    f'style="width:100%;height:100%;max-height:480px;background:#000" '
                    f'preload="metadata"></video>'
                )
                return {audio_key: iframe}

    # ── Estratégia 2: URL cifrada do Player HD (iframe) ──────────────────────
    enc_m = re.search(r'data-blogger-url-encrypted="([^"]+)"', html)
    if enc_m:
        url = _goyabu_decrypt_url(enc_m.group(1))
        if url and url.startswith("http"):
            iframe = (
                f'<iframe src="{url}" frameborder="0" scrolling="no" '
                f'allowfullscreen width="100%" height="100%" '
                f'style="width:100%;height:100%"></iframe>'
            )
            return {audio_key: iframe}

    # ── Estratégia 3: qualquer iframe de vídeo na página ────────────────────
    iframe_m = re.search(
        r'<iframe[^>]+src="(https?://(?:www\.blogger\.com|e7cod\.com|21wiz\.com)[^"]+)"',
        html,
    )
    if iframe_m:
        iframe = (
            f'<iframe src="{iframe_m.group(1)}" frameborder="0" '
            f'allowfullscreen width="100%" height="100%" '
            f'style="width:100%;height:100%"></iframe>'
        )
        return {audio_key: iframe}

    return None

def goyabu_build_ep_list(slug: str, total_eps: int) -> list[dict]:
    """
    Raspa lista completa de episódios do Goyabu e retorna no formato
    compatível com o sistema de animes do projeto.
    """
    anime_id = goyabu_get_anime_id(slug)
    if not anime_id:
        raise ValueError(f"Anime '{slug}' não encontrado no Goyabu.")

    all_episodes = goyabu_get_episodes(anime_id)
    # Limitar ao total pedido, ordenado por número
    all_episodes.sort(key=lambda x: float(str(x.get("episodio", 0)) or 0))
    results = []

    for item in all_episodes[:total_eps]:
        ep_num = int(str(item.get("episodio", 0)).lstrip("0") or "0")
        embed = scrape_goyabu_ep(slug, ep_num)
        results.append({
            "episode":  ep_num,
            "embeds":   embed or {},
            "post_id":  item.get("id"),
        })

    return results

def goyabu_ep_exists(slug: str, ep: int) -> bool:
    """Verifica rapidamente se um episódio existe (resolve post_id)."""
    try:
        return goyabu_get_post_id(slug, ep) is not None
    except Exception:
        return False




# ═══════════════════════════════════════════════════════════════════════════════
# SOURCE: AniList
# ═══════════════════════════════════════════════════════════════════════════════

ANILIST_URL = "https://graphql.anilist.co"

_ANILIST_FIELDS = """
  id
  title { romaji english native }
  genres
  studios(isMain: true) { nodes { name } }
  coverImage { extraLarge large }
  bannerImage
  averageScore
  description(asHtml: false)
  trailer { id site }
  startDate { year }
  episodes
  duration
  status
  isAdult
  format
"""

def _anilist_gql(query: str, variables: dict) -> dict | None:
    try:
        r = requests.post(
            ANILIST_URL,
            json={"query": query, "variables": variables},
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            timeout=12,
        )
        r.raise_for_status()
        data = r.json()
        if data.get("errors"):
            return None
        return data.get("data")
    except Exception:
        return None

def fetch_anilist_info(query: str) -> dict | None:
    gql = f"""
    query ($search: String) {{
      Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {{
        {_ANILIST_FIELDS}
      }}
    }}
    """
    data = _anilist_gql(gql, {"search": query})
    return data["Media"] if data and data.get("Media") else None

def fetch_anilist_by_id(al_id: int) -> dict | None:
    gql = f"""
    query ($id: Int) {{
      Media(id: $id, type: ANIME) {{
        {_ANILIST_FIELDS}
      }}
    }}
    """
    data = _anilist_gql(gql, {"id": al_id})
    return data["Media"] if data and data.get("Media") else None

def fetch_anilist_search_multi(query: str, per_page: int = 8) -> list[dict]:
    gql = f"""
    query ($search: String, $perPage: Int) {{
      Page(perPage: $perPage) {{
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) {{
          {_ANILIST_FIELDS}
        }}
      }}
    }}
    """
    data = _anilist_gql(gql, {"search": query, "perPage": per_page})
    if data and data.get("Page", {}).get("media"):
        return data["Page"]["media"]
    return []

def _al_status(status: str) -> str:
    return {
        "FINISHED":         "finished",
        "RELEASING":        "ongoing",
        "NOT_YET_RELEASED": "paused",
        "CANCELLED":        "paused",
        "HIATUS":           "paused",
    }.get(status or "", "ongoing")

def anilist_to_season_data(media: dict, s_num: int, is_movie: bool = False) -> dict:
    titles    = media.get("title") or {}
    title_r   = titles.get("romaji") or titles.get("english") or ""
    title_j   = titles.get("native") or title_r
    genres    = media.get("genres") or []
    nodes     = (media.get("studios") or {}).get("nodes") or []
    studio    = nodes[0]["name"] if nodes else "Desconhecido"
    al_id     = media.get("id") or 0
    cover     = (media.get("coverImage") or {}).get("extraLarge") or \
                (media.get("coverImage") or {}).get("large") or ""
    banner    = media.get("bannerImage") or ""
    raw_score = media.get("averageScore") or 0
    score     = round(raw_score / 10, 1)
    synopsis_raw = media.get("description") or "Sem sinopse disponível."
    synopsis  = re.sub(r'<[^>]+>', '', synopsis_raw).strip()
    trailer_data = media.get("trailer") or {}
    if trailer_data.get("site") == "youtube" and trailer_data.get("id"):
        trailer = f"https://www.youtube.com/watch?v={trailer_data['id']}"
    else:
        trailer = ""
    year    = (media.get("startDate") or {}).get("year") or datetime.now().year
    eps_tot = int(media.get("episodes") or 1)
    status  = _al_status(media.get("status") or "")
    runtime = int(media.get("duration") or 0)
    is_adult = bool(media.get("isAdult"))
    return {
        "title_r": title_r, "title_j": title_j, "studio": studio,
        "genres": genres, "al_id": al_id, "cover": cover, "banner": banner,
        "year": year, "status": status, "score": score,
        "eps_tot": eps_tot, "synopsis": synopsis, "trailer": trailer,
        "runtime": runtime, "is_adult": is_adult,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# SOURCE: Crunchyroll Banner (Playwright)
# ═══════════════════════════════════════════════════════════════════════════════

CR_KEYART_RE = re.compile(r'/keyart/([A-Z0-9]+)-', re.IGNORECASE)

def build_crunchyroll_banner_url(keyart_id, width=1920, quality=85, blur=0, variant="backdrop_wide"):
    return (
        f"https://imgsrv.crunchyroll.com/cdn-cgi/image/"
        f"fit=cover,format=auto,quality={quality},width={width},blur={blur}"
        f"/keyart/{keyart_id}-{variant}"
    )

def _fetch_cr_banner_with_context(anime_name, context, fallback=""):
    search_url = f"https://www.crunchyroll.com/pt-br/search?q={quote_plus(anime_name)}"
    page = context.new_page()
    try:
        page.set_extra_http_headers({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
        page.goto(search_url, wait_until="domcontentloaded", timeout=20000)
        try:
            page.wait_for_selector("a[href*='/series/']", timeout=10000)
        except Exception:
            return fallback
        series_href = page.locator("a[href*='/series/']").first.get_attribute("href")
        if not series_href:
            return fallback
        page.goto(urljoin("https://www.crunchyroll.com", series_href), wait_until="domcontentloaded", timeout=20000)
        try:
            page.wait_for_selector("source[srcset*='keyart']", timeout=8000)
        except Exception:
            pass
        keyart_id = None
        for source in page.locator("source[srcset*='keyart']").all():
            srcset = source.get_attribute("srcset") or ""
            m = CR_KEYART_RE.search(srcset)
            if m:
                keyart_id = m.group(1)
                break
        if not keyart_id:
            m = CR_KEYART_RE.search(page.content())
            if m:
                keyart_id = m.group(1)
        if not keyart_id:
            return fallback
        return build_crunchyroll_banner_url(keyart_id)
    except Exception:
        return fallback
    finally:
        try: page.close()
        except Exception: pass

def fetch_crunchyroll_banner(anime_name: str, fallback: str = "") -> str:
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
                except Exception: pass
    except Exception:
        return fallback


# ═══════════════════════════════════════════════════════════════════════════════
# DATABASE
# ═══════════════════════════════════════════════════════════════════════════════

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
                with open(fp, "w", encoding="utf-8") as f2:
                    json.dump(anime, f2, ensure_ascii=False, indent=2)

def load_pageconfig() -> dict:
    if os.path.exists(PAGECONFIG_FILE):
        try:
            with open(PAGECONFIG_FILE, encoding="utf-8") as f:
                cfg = json.load(f)
            return {**_DEFAULT_PAGECONFIG, **cfg}
        except Exception:
            pass
    return dict(_DEFAULT_PAGECONFIG)

def save_pageconfig(cfg: dict):
    cfg["lastUpdated"] = datetime.now().strftime("%Y-%m-%d")
    with open(PAGECONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


# ── Settings ───────────────────────────────────────────────────────────────────

def load_settings() -> dict:
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, encoding="utf-8") as f:
                stored = json.load(f)
            return {**_DEFAULT_SETTINGS, **stored}
        except Exception:
            pass
    return dict(_DEFAULT_SETTINGS)

def save_settings(cfg: dict):
    merged = {**_DEFAULT_SETTINGS, **cfg}
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
    return merged


# ── Scheduler ──────────────────────────────────────────────────────────────────

def _scheduler_do_auto_update():
    """Executa o ciclo de auto-update + git push se configurado."""
    settings = load_settings()
    _scheduler_state["running_now"] = True
    _scheduler_state["last_run"]    = datetime.now().isoformat()

    try:
        if settings.get("notify_log"):
            log_event("scheduler", "Auto-update iniciado", "agendado")

        # Verifica episódios novos
        if settings.get("auto_verify_enabled"):
            with app.test_request_context():
                api_check_next_ep()   # reutiliza lógica existente

        # Git push
        if settings.get("auto_push_enabled"):
            subprocess.run(
                ["git", "add", "-A"],
                capture_output=True, text=True, cwd=os.getcwd(),
            )
            subprocess.run(
                ["git", "commit", "-m",
                 f"auto-update {datetime.now().strftime('%Y-%m-%d %H:%M')}"],
                capture_output=True, text=True, cwd=os.getcwd(),
            )
            subprocess.run(
                ["git", "push", "origin", GIT_BRANCH],
                capture_output=True, text=True, cwd=os.getcwd(),
            )
            if settings.get("notify_log"):
                log_event("scheduler", "Git push automático realizado", "auto-push")

    except Exception as exc:
        if settings.get("notify_log"):
            log_event("scheduler", f"Erro no auto-update: {exc}", "error")
    finally:
        _scheduler_state["running_now"] = False


def _compute_next_run(settings: dict) -> datetime | None:
    """Calcula o próximo momento de execução com base nas configurações."""
    now = datetime.now()
    candidates = []

    # Intervalo periódico
    interval = int(settings.get("auto_update_interval", 0) or 0)
    if settings.get("auto_update_enabled") and interval > 0:
        last = _scheduler_state.get("last_run")
        if last:
            try:
                nxt = datetime.fromisoformat(last) + timedelta(minutes=interval)
                candidates.append(nxt)
            except Exception:
                candidates.append(now + timedelta(minutes=interval))
        else:
            candidates.append(now + timedelta(minutes=interval))

    # Horários fixos
    for t in settings.get("auto_update_times", []):
        try:
            hh, mm = map(int, t.strip().split(":"))
            candidate = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
            if candidate <= now:
                candidate += timedelta(days=1)
            candidates.append(candidate)
        except Exception:
            pass

    return min(candidates) if candidates else None


def _scheduler_loop(stop_event: threading.Event):
    """Thread principal do scheduler."""
    while not stop_event.is_set():
        settings = load_settings()

        if not (settings.get("auto_update_enabled") or settings.get("auto_update_times")):
            stop_event.wait(60)
            continue

        now = datetime.now()
        nxt = _compute_next_run(settings)

        if nxt is None:
            stop_event.wait(60)
            continue

        _scheduler_state["next_run"] = nxt.isoformat()

        wait_secs = max(0, (nxt - now).total_seconds())

        # Checar a cada segundo se o evento chegou ou o stop foi pedido
        slept = 0.0
        while slept < wait_secs and not stop_event.is_set():
            stop_event.wait(1)
            slept += 1

        if stop_event.is_set():
            break

        # Re-checar configurações antes de executar
        settings = load_settings()
        if settings.get("auto_update_enabled") or settings.get("auto_update_times"):
            _scheduler_do_auto_update()


def scheduler_start():
    with _scheduler_lock:
        if _scheduler_state["thread"] and _scheduler_state["thread"].is_alive():
            return  # já rodando
        _scheduler_state["stop_event"].clear()
        t = threading.Thread(
            target=_scheduler_loop,
            args=(_scheduler_state["stop_event"],),
            daemon=True,
            name="animeops-scheduler",
        )
        _scheduler_state["thread"] = t
        t.start()


def scheduler_stop():
    with _scheduler_lock:
        _scheduler_state["stop_event"].set()
        _scheduler_state["next_run"] = None


def scheduler_restart():
    scheduler_stop()
    time.sleep(0.2)
    settings = load_settings()
    if settings.get("auto_update_enabled") or settings.get("auto_update_times"):
        scheduler_start()


# ═══════════════════════════════════════════════════════════════════════════════

def get_audio_ep_counts(anime: dict) -> list[dict]:
    result = []
    for season in anime.get("seasons", []):
        audios    = season.get("audios", [])
        has_sub   = next((a.get("available", False) for a in audios if a["type"] == "sub"), False)
        has_dub   = next((a.get("available", False) for a in audios if a["type"] == "dub"), False)
        sub_count = next((a.get("episodesAvailable", 0) for a in audios if a["type"] == "sub"), 0)
        dub_count = next((a.get("episodesAvailable", 0) for a in audios if a["type"] == "dub"), 0)

        # Determine source
        if season.get("aonlinecc_slug"):
            source = "aonlinecc"
        elif season.get("topanimes_slug_sub"):
            source = "topanimes"
        elif season.get("goyabu_slug"):
            source = "goyabu"
        else:
            source = "anivideo"

        result.append({
            "season": season.get("season", "?"),
            "label":  season.get("seasonLabel", f"S{season.get('season','?')}"),
            "type":   season.get("type", "series"),
            "sub":    sub_count if has_sub else None,
            "dub":    dub_count if has_dub else None,
            "max":    season.get("episodes", 0),
            "status": season.get("status", "?"),
            "source": source,
        })
    return result


def check_next_ep_per_audio(anime: dict) -> list[dict]:
    """Dry-run: returns what would be added without modifying anything."""
    results = []
    for season in anime.get("seasons", []):
        if season.get("status") == "finished" and season.get("type") != "movie":
            continue
        ep_list = season.get("episodeList", [])
        if not ep_list:
            continue
        s_num  = season["season"]
        audios = season.get("audios", [])
        max_e  = season.get("episodes", 0)

        # AnimesOnlineCC
        ao_slug = season.get("aonlinecc_slug", "").strip()
        if ao_slug:
            sub_cur = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "sub" and a.get("available")), 0)
            dub_cur = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "dub" and a.get("available")), 0)
            cur     = max(sub_cur, dub_cur)
            next_e  = cur + 1
            if max_e and next_e > max_e:
                continue
            results.append({
                "season": s_num, "label": season.get("seasonLabel", f"S{s_num}"),
                "source": "aonlinecc", "ao_slug": ao_slug,
                "current": cur, "next_ep": next_e, "max": max_e,
            })
            continue

        # TopAnimes
        ta_slug_sub = season.get("topanimes_slug_sub", "").strip()
        if ta_slug_sub:
            sub_cur = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "sub" and a.get("available")), 0)
            dub_cur = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "dub" and a.get("available")), 0)
            cur     = max(sub_cur, dub_cur)
            next_e  = cur + 1
            if max_e and next_e > max_e:
                continue
            results.append({
                "season": s_num, "label": season.get("seasonLabel", f"S{s_num}"),
                "source": "topanimes", "ta_slug_sub": ta_slug_sub,
                "ta_slug_dub": season.get("topanimes_slug_dub", ta_slug_sub + "-dublado"),
                "ta_sub_src": season.get("topanimes_sub_src"),
                "ta_dub_src": season.get("topanimes_dub_src"),
                "current": cur, "next_ep": next_e, "max": max_e,
            })
            continue

        # Goyabu — TODO: implementar após HTML2
        gb_slug = season.get("goyabu_slug", "").strip()
        if gb_slug:
            sub_cur = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "sub" and a.get("available")), 0)
            cur     = sub_cur
            next_e  = cur + 1
            if max_e and next_e > max_e:
                continue
            results.append({
                "season": s_num, "label": season.get("seasonLabel", f"S{s_num}"),
                "source": "goyabu", "gb_slug": gb_slug,
                "current": cur, "next_ep": next_e, "max": max_e,
            })
            continue

        # AniVideo
        sub_path = dub_path = None
        sub_cur = dub_cur = 0
        for ep in reversed(ep_list):
            embeds = ep.get("embeds", {}) or {}
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
                cur    = max(sub_cur, aud.get("episodesAvailable", sub_cur))
                next_e = cur + 1
                if max_e and next_e > max_e:
                    continue
                results.append({"season": s_num, "label": season.get("seasonLabel", f"S{s_num}"),
                                 "source": "anivideo", "audio": "sub", "audio_label": "Legendado",
                                 "current": cur, "next_ep": next_e, "max": max_e, "path": sub_path})
            if aud["type"] == "dub" and aud.get("available") and dub_path:
                cur    = max(dub_cur, aud.get("episodesAvailable", dub_cur))
                next_e = cur + 1
                if max_e and next_e > max_e:
                    continue
                results.append({"season": s_num, "label": season.get("seasonLabel", f"S{s_num}"),
                                 "source": "anivideo", "audio": "dub", "audio_label": "Dublado",
                                 "current": cur, "next_ep": next_e, "max": max_e, "path": dub_path})
    return results


def try_add_next_ep(anime: dict) -> list[str]:
    """Full mode: modifies anime in-place and returns log lines."""
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

        # ── AnimesOnlineCC ─────────────────────────────────────────────
        ao_slug = season.get("aonlinecc_slug", "").strip()
        if ao_slug:
            ao_inc_s = bool(season.get("aonlinecc_inc_season", True))
            aud_sub  = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "sub" and a.get("available")), 0)
            aud_dub  = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "dub" and a.get("available")), 0)
            cur      = max(int(aud_sub or 0), int(aud_dub or 0))
            next_e   = cur + 1
            if max_e and next_e > max_e:
                continue
            logs.append(f"    [AONLINECC] slug={ao_slug} atual:{cur:02d} → Checando {next_e:02d}...")
            result = scrape_aonlinecc_ep(ao_slug, s_num, next_e, ao_inc_s)
            if result:
                has_sub = "sub" in result; has_dub = "dub" in result
                tags = "/".join(t.upper() for t in result)
                logs.append(f"    [AONLINECC] ✅ Ep {next_e:02d} disponível! [{tags}]")
                if next_e in ep_map:
                    ep_map[next_e].setdefault("embeds", {})
                    if has_sub: ep_map[next_e]["embeds"]["sub"] = result["sub"]
                    if has_dub: ep_map[next_e]["embeds"]["dub"] = result["dub"]
                    ep_map[next_e]["embedCredit"] = "animesonlinecc.to"
                else:
                    ep_map[next_e] = {
                        "id": f"{anime['id']}-s{s_num}-ep{next_e}", "number": next_e,
                        "title": f"{anime.get('titleRomaji', anime['title'])} - T{s_num} Ep {next_e}",
                        "season": str(s_num), "embeds": result, "embedCredit": "animesonlinecc.to",
                    }
                for aud in audios:
                    if aud.get("type") == "sub" and has_sub:
                        aud["available"] = True; aud["episodesAvailable"] = next_e
                    if aud.get("type") == "dub" and has_dub:
                        aud["available"] = True; aud["episodesAvailable"] = next_e
                season["episodeList"] = sorted(ep_map.values(), key=lambda x: int(x["number"]))
                all_nums = [int(ep["number"]) for ep in season["episodeList"] if ep.get("embeds")]
                if all_nums: season["currentEpisode"] = max(all_nums)
                sub_done = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "sub"), 0)
                dub_done = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "dub"), 0)
                if max_e and min(int(sub_done or 0), int(dub_done or 0)) >= max_e:
                    season["status"] = "finished"
                    logs.append(f"    🏁 Temporada {s_num} concluída!")
            else:
                logs.append(f"    [AONLINECC] ❌ Ep {next_e:02d} não disponível.")
            continue

        # ── TopAnimes ──────────────────────────────────────────────────
        ta_slug_sub = season.get("topanimes_slug_sub", "").strip()
        if ta_slug_sub:
            ta_slug_dub = season.get("topanimes_slug_dub", ta_slug_sub + "-dublado")
            ta_sub_src  = season.get("topanimes_sub_src")
            ta_dub_src  = season.get("topanimes_dub_src")
            aud_sub     = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "sub" and a.get("available")), 0)
            aud_dub     = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "dub" and a.get("available")), 0)
            cur         = max(int(aud_sub or 0), int(aud_dub or 0))
            next_e      = cur + 1
            if max_e and next_e > max_e:
                continue
            logs.append(f"    [TOPANIMES] slug={ta_slug_sub} atual:{cur:02d} → Checando {next_e:02d}...")
            sub_raw = scrape_topanimes_ep(ta_slug_sub, next_e, is_dub=False, source_num=ta_sub_src)
            dub_raw = scrape_topanimes_ep(ta_slug_dub, next_e, is_dub=False, source_num=ta_dub_src) if aud_dub > 0 or sub_raw else {}
            embeds  = topanimes_build_embeds(sub_raw, dub_raw)
            if embeds:
                has_sub = "sub" in embeds; has_dub = "dub" in embeds
                logs.append(f"    [TOPANIMES] ✅ Ep {next_e:02d} disponível!")
                if next_e in ep_map:
                    ep_map[next_e].setdefault("embeds", {}).update(embeds)
                    ep_map[next_e]["embedCredit"] = "topanimes.net"
                else:
                    ep_map[next_e] = {
                        "id": f"{anime['id']}-s{s_num}-ep{next_e}", "number": next_e,
                        "title": f"{anime.get('titleRomaji', anime['title'])} - T{s_num} Ep {next_e}",
                        "season": str(s_num), "embeds": embeds, "embedCredit": "topanimes.net",
                    }
                for aud in audios:
                    if aud.get("type") == "sub" and has_sub:
                        aud["available"] = True; aud["episodesAvailable"] = next_e
                    if aud.get("type") == "dub" and has_dub:
                        aud["available"] = True; aud["episodesAvailable"] = next_e
                season["episodeList"] = sorted(ep_map.values(), key=lambda x: int(x["number"]))
                all_nums = [int(ep["number"]) for ep in season["episodeList"] if ep.get("embeds")]
                if all_nums: season["currentEpisode"] = max(all_nums)
                sub_done = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "sub"), 0)
                dub_done = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "dub"), 0)
                if max_e and min(int(sub_done or 0), int(dub_done or 0)) >= max_e:
                    season["status"] = "finished"
                    logs.append(f"    🏁 Temporada {s_num} concluída!")
            else:
                logs.append(f"    [TOPANIMES] ❌ Ep {next_e:02d} não disponível.")
            continue

        # ── Goyabu — TODO após HTML2 ───────────────────────────────────
        gb_slug = season.get("goyabu_slug", "").strip()
        if gb_slug:
            logs.append(f"    [GOYABU] ⚠️ Scraper não implementado ainda. Aguardando HTML2.")
            continue

        # ── AniVideo ───────────────────────────────────────────────────
        last_sub_num = last_dub_num = 0
        last_sub_path = last_dub_path = None
        for ep in ep_list:
            num = int(ep["number"]); embeds = ep.get("embeds", {}) or {}
            if embeds.get("sub"):
                last_sub_num = max(last_sub_num, num)
                p = extract_av_path(embeds["sub"])
                if p: last_sub_path = p
            if embeds.get("dub"):
                last_dub_num = max(last_dub_num, num)
                p = extract_av_path(embeds["dub"])
                if p: last_dub_path = p

        aud_sub  = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "sub" and a.get("available")), 0)
        aud_dub  = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "dub" and a.get("available")), 0)
        sub_cur  = max(last_sub_num, int(aud_sub or 0))
        dub_cur  = max(last_dub_num, int(aud_dub or 0))
        any_added = False

        if last_sub_path:
            sub_next = sub_cur + 1
            if not (max_e and sub_next > max_e):
                logs.append(f"    [LEG] Atual: {sub_cur:02d} → Checando {sub_next:02d}...")
                if av_ep_exists(last_sub_path, sub_next):
                    logs.append(f"    [LEG] ✅ Ep {sub_next:02d} disponível!")
                    if sub_next in ep_map:
                        ep_map[sub_next].setdefault("embeds", {})["sub"] = make_iframe(anivideo_url(last_sub_path, sub_next))
                    else:
                        ep_map[sub_next] = {
                            "id": f"{anime['id']}-s{s_num}-ep{sub_next}", "number": sub_next,
                            "title": f"{anime.get('titleRomaji', anime['title'])} - T{s_num} Ep {sub_next}",
                            "season": str(s_num),
                            "embeds": {"sub": make_iframe(anivideo_url(last_sub_path, sub_next))},
                            "embedCredit": "api.anivideo.net",
                        }
                    for aud in audios:
                        if aud.get("type") == "sub": aud["episodesAvailable"] = sub_next
                    any_added = True
                else:
                    logs.append(f"    [LEG] ❌ Ep {sub_next:02d} não disponível.")
        else:
            logs.append(f"    [LEG] ⚠️ sem stream_path.")

        if last_dub_path:
            dub_next = dub_cur + 1
            if not (max_e and dub_next > max_e):
                logs.append(f"    [DUB] Atual: {dub_cur:02d} → Checando {dub_next:02d}...")
                if av_ep_exists(last_dub_path, dub_next):
                    logs.append(f"    [DUB] ✅ Ep {dub_next:02d} disponível!")
                    if dub_next in ep_map:
                        ep_map[dub_next].setdefault("embeds", {})["dub"] = make_iframe(anivideo_url(last_dub_path, dub_next))
                    else:
                        ep_map[dub_next] = {
                            "id": f"{anime['id']}-s{s_num}-ep{dub_next}", "number": dub_next,
                            "title": f"{anime.get('titleRomaji', anime['title'])} - T{s_num} Ep {dub_next}",
                            "season": str(s_num),
                            "embeds": {"dub": make_iframe(anivideo_url(last_dub_path, dub_next))},
                            "embedCredit": "api.anivideo.net",
                        }
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
            if all_nums: season["currentEpisode"] = max(all_nums)
            sub_done = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "sub"), 0)
            dub_done = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "dub"), 0)
            if max_e and min(int(sub_done or 0), int(dub_done or 0)) >= max_e:
                season["status"] = "finished"
                logs.append(f"    🏁 Temporada {s_num} concluída!")
    return logs


# ═══════════════════════════════════════════════════════════════════════════════
# LOGS
# ═══════════════════════════════════════════════════════════════════════════════

def _load_logs() -> list[dict]:
    if os.path.exists(LOG_FILE):
        try:
            with open(LOG_FILE, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return []

def _save_logs(logs: list[dict]):
    try:
        with open(LOG_FILE, "w", encoding="utf-8") as f:
            json.dump(logs[-2000:], f, ensure_ascii=False, indent=2)
    except Exception:
        pass

def log_event(kind: str, title: str, detail: str = "", level: str = "info"):
    entry = {
        "ts": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "kind": kind, "title": title, "detail": detail, "level": level,
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


# ═══════════════════════════════════════════════════════════════════════════════
# ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/')
def index():
    return render_template('index.html')

# ── DB ─────────────────────────────────────────────────────────────────────────

@app.route('/api/db')
def api_get_db():
    return jsonify(load_db())

@app.route('/api/db', methods=['POST'])
def api_save_db():
    db = request.json
    save_db(db)
    return jsonify({"ok": True})

@app.route('/api/anime', methods=['POST'])
def api_add_anime():
    anime = request.json
    db = load_db()
    db = [a for a in db if a.get("id") != anime.get("id")]
    db.append(anime)
    save_db(db)
    return jsonify({"ok": True})

@app.route('/api/anime/<anime_id>', methods=['PUT'])
def api_update_anime(anime_id):
    data = request.json
    db   = load_db()
    for i, a in enumerate(db):
        if a.get("id") == anime_id:
            db[i] = data
            save_db(db)
            return jsonify({"ok": True})
    return jsonify({"ok": False, "error": "not found"}), 404

@app.route('/api/anime/<anime_id>', methods=['DELETE'])
def api_delete_anime(anime_id):
    db    = load_db()
    title = next((a.get("title","?") for a in db if a.get("id") == anime_id), "?")
    db    = [a for a in db if a.get("id") != anime_id]
    fp    = os.path.join(ANIMES_FOLDER, f"{anime_id}.json")
    if os.path.exists(fp): os.remove(fp)
    save_db(db)
    log_event("delete", f"Removido: {title}", level="warning")
    return jsonify({"ok": True})

# ── Stats ──────────────────────────────────────────────────────────────────────

@app.route('/api/stats')
def api_stats():
    db       = load_db()
    ongoing  = sum(1 for a in db if any(s.get("status")=="ongoing"  for s in a.get("seasons",[])))
    paused   = sum(1 for a in db if any(s.get("status")=="paused"   for s in a.get("seasons",[])))
    finished = len(db) - ongoing - paused
    total_ep = sum(s.get("currentEpisode",0) for a in db for s in a.get("seasons",[]))
    has_dub  = sum(1 for a in db if any(
        aud.get("available") and aud.get("type")=="dub"
        for s in a.get("seasons",[]) for aud in s.get("audios",[])
    ))
    genres: dict[str,int] = {}
    for a in db:
        for g in a.get("genre",[]): genres[g] = genres.get(g,0)+1
    top_genres = sorted(genres.items(), key=lambda x:-x[1])[:10]
    ongoing_list = [
        {"title": a.get("title",""), "id": a.get("id",""),
         "seasons": len(a.get("seasons",[])),
         "cur": a.get("seasons",[{}])[-1].get("currentEpisode","?"),
         "tot": a.get("seasons",[{}])[-1].get("episodes","?")}
        for a in db if any(s.get("status")=="ongoing" for s in a.get("seasons",[]))
    ]
    return jsonify({
        "total": len(db), "ongoing": ongoing, "paused": paused, "finished": finished,
        "total_ep": total_ep, "has_dub": has_dub,
        "top_genres": top_genres, "ongoing_list": ongoing_list[:20],
    })

# ── Logs ───────────────────────────────────────────────────────────────────────

@app.route('/api/logs')
def api_get_logs():
    kind = request.args.get("kind")
    logs = _load_logs()
    if kind and kind != "todos":
        logs = [l for l in logs if l.get("kind") == kind]
    return jsonify(list(reversed(logs[-200:])))

@app.route('/api/logs', methods=['DELETE'])
def api_clear_logs():
    with _LOG_LOCK: _save_logs([])
    return jsonify({"ok": True})

# ── Pageconfig ─────────────────────────────────────────────────────────────────

@app.route('/api/pageconfig')
def api_get_pageconfig():
    return jsonify(load_pageconfig())

@app.route('/api/pageconfig', methods=['POST'])
def api_save_pageconfig():
    cfg = request.json
    save_pageconfig(cfg)
    log_event("git", "pageconfig.json salvo", f"featuredAnimeId={cfg.get('featuredAnimeId','')}")
    return jsonify({"ok": True})

# ── AniList ────────────────────────────────────────────────────────────────────

@app.route('/api/anilist/search')
def api_anilist_search():
    q = request.args.get("q","").strip()
    if not q:
        return jsonify({"error": "no query"}), 400
    if request.args.get("multi","0") == "1":
        return jsonify(fetch_anilist_search_multi(q))
    media = fetch_anilist_info(q)
    if media:
        return jsonify(media)
    return jsonify({"error": "not found"}), 404

@app.route('/api/anilist/by_id/<int:al_id>')
def api_anilist_by_id(al_id):
    media = fetch_anilist_by_id(al_id)
    if media: return jsonify(media)
    return jsonify({"error": "not found"}), 404

# ── TopAnimes ──────────────────────────────────────────────────────────────────

@app.route('/api/topanimes/sources')
def api_topanimes_sources():
    slug = request.args.get("slug","").strip()
    ep   = int(request.args.get("ep",1) or 1)
    if not slug:
        return jsonify({"error": "no slug"}), 400
    sub_raw = scrape_topanimes_ep(slug, ep, is_dub=False)
    dub_raw = scrape_topanimes_ep(slug, ep, is_dub=True)
    def fmt(d):
        return [{"num": k, "name": v["name"], "src": v["src"]} for k,v in sorted(d.items())]
    return jsonify({
        "sub": fmt(sub_raw), "dub": fmt(dub_raw),
        "sub_url": topanimes_ep_url(slug, ep, False),
        "dub_url": topanimes_ep_url(slug, ep, True),
    })

# ── Goyabu ─────────────────────────────────────────────────────────────────────

@app.route('/api/goyabu/ep')
def api_goyabu_ep():
    """Raspa embed de um episódio do Goyabu.io."""
    slug = request.args.get("slug", "").strip()
    ep   = request.args.get("ep", "1").strip()
    if not slug:
        return jsonify({"error": "slug obrigatório"}), 400
    try:
        result = scrape_goyabu_ep(slug, ep)
        if result is None:
            return jsonify({"error": "Episódio não encontrado no Goyabu"}), 404
        return jsonify({"ok": True, "embeds": result})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

@app.route('/api/goyabu/anime_id')
def api_goyabu_anime_id():
    """Retorna o streamer_id (WP post ID do anime) a partir do slug."""
    slug = request.args.get("slug", "").strip()
    if not slug:
        return jsonify({"error": "slug obrigatório"}), 400
    anime_id = goyabu_get_anime_id(slug)
    if not anime_id:
        return jsonify({"error": "Anime não encontrado"}), 404
    return jsonify({"ok": True, "anime_id": anime_id})

@app.route('/api/goyabu/episodes')
def api_goyabu_episodes():
    """Retorna lista de episódios de um anime via AJAX do Goyabu."""
    slug = request.args.get("slug", "").strip()
    if not slug:
        return jsonify({"error": "slug obrigatório"}), 400
    anime_id = goyabu_get_anime_id(slug)
    if not anime_id:
        return jsonify({"error": "Anime não encontrado"}), 404
    episodes = goyabu_get_episodes(anime_id)
    return jsonify({"ok": True, "anime_id": anime_id, "count": len(episodes), "episodes": episodes})

# ── Settings ────────────────────────────────────────────────────────────────────

@app.route('/api/settings')
def api_get_settings():
    cfg = load_settings()
    st  = _scheduler_state
    return jsonify({
        **cfg,
        "_scheduler": {
            "running":   st.get("thread") is not None and st["thread"].is_alive() if st.get("thread") else False,
            "last_run":  st.get("last_run"),
            "next_run":  st.get("next_run"),
            "busy":      st.get("running_now", False),
        }
    })

@app.route('/api/settings', methods=['POST'])
def api_save_settings_route():
    cfg = request.json or {}
    saved = save_settings(cfg)
    log_event("settings", "Configurações salvas", json.dumps({
        k: v for k, v in saved.items()
        if k in ("auto_update_enabled", "auto_update_interval",
                  "auto_update_times", "auto_push_enabled")
    }))
    scheduler_restart()
    return jsonify({"ok": True, "settings": saved})

@app.route('/api/settings/run_now', methods=['POST'])
def api_settings_run_now():
    """Dispara o auto-update manualmente (para testar)."""
    t = threading.Thread(target=_scheduler_do_auto_update, daemon=True)
    t.start()
    return jsonify({"ok": True, "message": "Auto-update iniciado em background"})

@app.route('/api/settings/scheduler/status')
def api_scheduler_status():
    st = _scheduler_state
    return jsonify({
        "running":  st.get("thread") is not None and st["thread"].is_alive() if st.get("thread") else False,
        "last_run": st.get("last_run"),
        "next_run": st.get("next_run"),
        "busy":     st.get("running_now", False),
    })



# ── Git ────────────────────────────────────────────────────────────────────────

@app.route('/api/git/push', methods=['POST'])
def api_git_push():
    msg    = request.json.get("message","chore: update database")
    result = do_git_push(msg)
    log_event("git", f"Git Push: {msg[:60]}", result[:120])
    return jsonify({"ok": True, "output": result})

@app.route('/api/git/pull', methods=['POST'])
def api_git_pull():
    try:
        r = requests.get(GITHUB_RAW_URL, timeout=15)
        r.raise_for_status()
        db = r.json()
        save_db(db)
        return jsonify({"ok": True, "count": len(db)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

# ── CR Banner ──────────────────────────────────────────────────────────────────

@app.route('/api/cr_banner')
def api_cr_banner():
    name     = request.args.get("name","")
    fallback = request.args.get("fallback","")
    banner   = fetch_crunchyroll_banner(name, fallback)
    return jsonify({"banner": banner, "found": banner != fallback})

# ── SSE ────────────────────────────────────────────────────────────────────────

@app.route('/api/stream/<stream_id>')
def api_stream(stream_id):
    def generate():
        q = _streams.get(stream_id)
        if not q:
            yield 'data: {"type":"done"}\n\n'; return
        while True:
            try:
                msg = q.get(timeout=60)
                if msg is None:
                    yield 'data: {"type":"done"}\n\n'
                    _streams.pop(stream_id, None); break
                yield f"data: {json.dumps(msg)}\n\n"
            except queue.Empty:
                yield 'data: {"type":"ping"}\n\n'
    return Response(
        stream_with_context(generate()),
        content_type='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'}
    )

# ── Update all ─────────────────────────────────────────────────────────────────

@app.route('/api/update', methods=['POST'])
def api_run_update():
    dry = request.json.get("dry", False)
    sid = str(time.time_ns())
    q: queue.Queue = queue.Queue()
    _streams[sid]  = q

    def wlog(msg: str, lvl="info"):
        q.put({"type": "log", "msg": msg, "lvl": lvl})

    def _worker():
        db = load_db()
        changed = []
        for anime in db:
            if not any(s.get("status") in ("ongoing","paused") for s in anime.get("seasons",[])):
                continue
            title = anime["title"]
            wlog(f"▶  {title}", "title")
            wlog("─" * 50)
            for info in get_audio_ep_counts(anime):
                if info["status"] == "finished" and info["type"] != "movie": continue
                parts = []
                if info["sub"] is not None: parts.append(f"LEG: {info['sub']:02d}")
                if info["dub"] is not None: parts.append(f"DUB: {info['dub']:02d}")
                max_s  = f"/{info['max']}" if info["max"] else ""
                src_lbl= f" [{info.get('source','?').upper()}]"
                wlog(f"  [{info['label']}]  {' | '.join(parts)}{max_s}{src_lbl}", "dim")

            if dry:
                checks = check_next_ep_per_audio(anime)
                if not checks:
                    wlog("  (sem temporadas em andamento)", "dim"); continue
                anime_changed = False
                for chk in checks:
                    max_s = f"/{chk['max']}" if chk["max"] else ""
                    if chk["source"] == "aonlinecc":
                        wlog(f"  [AONLINECC] S{chk['season']} atual:{chk['current']:02d}{max_s} → ep {chk['next_ep']:02d}...", "dim")
                        result = scrape_aonlinecc_ep(chk["ao_slug"], chk["season"], chk["next_ep"])
                        if result:
                            wlog(f"  [AONLINECC] ✅ Ep {chk['next_ep']:02d} DISPONÍVEL!", "success")
                            anime_changed = True
                        else:
                            wlog(f"  [AONLINECC] ❌ Ep {chk['next_ep']:02d} não disponível.", "error")
                    elif chk["source"] == "goyabu":
                        wlog(f"  [GOYABU] ⚠️ Scraper não implementado ainda.", "warn")
                    elif chk["source"] in ("anivideo",):
                        tag = "LEG" if chk.get("audio") == "sub" else "DUB"
                        wlog(f"  [{tag}] S{chk['season']} atual:{chk['current']:02d}{max_s} → ep {chk['next_ep']:02d}...", "dim")
                        if av_ep_exists(chk["path"], chk["next_ep"]):
                            wlog(f"  [{tag}] ✅ Ep {chk['next_ep']:02d} DISPONÍVEL!", "success")
                            anime_changed = True
                        else:
                            wlog(f"  [{tag}] ❌ Ep {chk['next_ep']:02d} não disponível.", "error")
                if anime_changed: changed.append(title)
            else:
                msgs = try_add_next_ep(anime)
                added_eps  = [m for m in msgs if "✅" in m]
                error_msgs = [m for m in msgs if "sem stream_path" in m]
                for m in msgs:
                    lvl = "success" if "✅" in m else ("error" if ("❌" in m or "⚠️" in m) else "dim")
                    wlog(m, lvl)
                if added_eps:
                    detail = " | ".join(re.sub(r"\s+"," ",m.strip()) for m in added_eps)
                    log_event("update", f"Eps adicionados: {title}", detail)
                for e in error_msgs:
                    log_event("stream", title, e.strip(), level="error")
                if added_eps: changed.append(title)

        if not dry and changed: save_db(db)
        wlog("")
        if changed:
            wlog(f"✅  {len(changed)} anime(s) com novos eps:", "success")
            for c in changed: wlog(f"  ✓  {c}", "success")
        else:
            wlog("ℹ️  Nenhum episódio novo encontrado.", "info")
        wlog("══ Finalizado ══", "title")
        q.put({"type": "done", "changed": changed})
        q.put(None)

    threading.Thread(target=_worker, daemon=True).start()
    return jsonify({"stream_id": sid})

# ── Add anime ──────────────────────────────────────────────────────────────────

@app.route('/api/add_anime', methods=['POST'])
def api_add_anime_full():
    data = request.json
    sid  = str(time.time_ns())
    q: queue.Queue = queue.Queue()
    _streams[sid]  = q

    def wlog(msg, lvl="info"):
        q.put({"type": "log", "msg": msg, "lvl": lvl})

    def _worker():
        name       = data["name"]
        id_slug    = data.get("slug") or re.sub(r"[^a-z0-9]+","-",name.lower()).strip("-")
        total_eps  = int(data.get("eps",0) or 0)
        max_eps    = int(data.get("max_eps",0) or 0) or total_eps
        s_num      = int(data.get("season",1) or 1)
        source     = data.get("source","anivideo")
        has_sub    = data.get("has_sub", True)
        has_dub    = data.get("has_dub", False)
        is_movie   = data.get("is_movie", False)
        avslug     = (data.get("avslug") or "").strip()
        inc_s      = data.get("inc_season", True)
        ao_slug    = (data.get("ao_slug") or "").strip()
        ao_inc_s   = bool(data.get("ao_inc_season", True))
        ta_slug_sub= (data.get("ta_slug_sub") or "").strip()
        ta_slug_dub= (data.get("ta_slug_dub") or "").strip()
        ta_sub_src = int(data["ta_sub_source"]) if str(data.get("ta_sub_source","")).isdigit() else None
        ta_dub_src = int(data["ta_dub_source"]) if str(data.get("ta_dub_source","")).isdigit() else None
        gb_slug    = (data.get("goyabu_slug") or "").strip()

        wlog(f"[ANILIST] Buscando '{name}'...", "dim")
        prefill = data.get("_al_prefill")
        media   = prefill if prefill else fetch_anilist_info(name)
        if media:
            md = anilist_to_season_data(media, s_num, is_movie)
            title_r = name; title_j = md["title_j"]
            genres  = md["genres"];  studio  = md["studio"]
            al_id   = md["al_id"];   cover   = md["cover"]
            score   = md["score"];   synopsis= md["synopsis"]
            trailer = md["trailer"]; year    = md["year"]
            status_api = md["status"]; runtime = md["runtime"]
            al_banner  = md["banner"]
            src = "prefill" if prefill else "busca"
            wlog(f"[ANILIST] ✅ {title_r} ({year}) via {src} — {status_api} — ★{score}", "success")
        else:
            title_r = title_j = name; genres = []; studio = "Desconhecido"
            al_id = 0; cover = ""; score = 0.0; synopsis = ""; trailer = ""
            year = datetime.now().year; status_api = "ongoing"; runtime = 0; al_banner = ""
            wlog("[ANILIST] ⚠️ Não encontrado. Usando defaults.", "error")

        # Banner
        if al_banner:
            wlog("[ANILIST] ✅ Banner via AniList.", "success")
            banner = al_banner
        elif PLAYWRIGHT_OK:
            wlog(f"[CR] Buscando banner Crunchyroll para '{title_r}'...", "dim")
            cr_banner = fetch_crunchyroll_banner(title_r, fallback="")
            banner = cr_banner if cr_banner else cover
            if cr_banner: wlog("[CR] ✅ Banner encontrado!", "success")
            else:         wlog("[CR] Não encontrado, usando cover.", "dim")
        else:
            wlog("[CR] ⚠️ Playwright não instalado, usando cover.", "dim")
            banner = cover

        # Build episode list
        ep_list = []

        if source == "aonlinecc" and ao_slug:
            wlog(f"[AONLINECC] Raspando {total_eps} ep(s)...", "dim")
            for ep_i in range(1, total_eps + 1):
                result = scrape_aonlinecc_ep(ao_slug, s_num, ep_i, ao_inc_s)
                embeds = result if result else {}
                tags   = "+".join(t.upper() for t in embeds) if embeds else "❌"
                wlog(f"  Ep {ep_i:02d}: [{tags}]", "success" if embeds else "error")
                ep_list.append({
                    "id": f"{id_slug}-s{s_num}-ep{ep_i}", "number": ep_i,
                    "title": f"{title_r} - T{s_num} Ep {ep_i}",
                    "season": str(s_num), "embeds": embeds, "embedCredit": "animesonlinecc.to",
                })
            sub_avail = max((ep["number"] for ep in ep_list if ep.get("embeds",{}).get("sub")), default=0)
            dub_avail = max((ep["number"] for ep in ep_list if ep.get("embeds",{}).get("dub")), default=0)
            has_sub   = sub_avail > 0; has_dub = dub_avail > 0
            total_eps = max(sub_avail, dub_avail) or total_eps
            wlog(f"[AONLINECC] ✅ LEG:{sub_avail} DUB:{dub_avail}", "success")

        elif source == "topanimes" and ta_slug_sub:
            wlog(f"[TOPANIMES] Raspando {total_eps} ep(s)...", "dim")
            for ep_i in range(1, total_eps + 1):
                result_sub = scrape_topanimes_ep(ta_slug_sub, ep_i, is_dub=False, source_num=ta_sub_src)
                result_dub = scrape_topanimes_ep(ta_slug_dub or ta_slug_sub+"-dublado", ep_i, is_dub=False, source_num=ta_dub_src) if has_dub else {}
                embeds = topanimes_build_embeds(result_sub, result_dub)
                wlog(f"  Ep {ep_i:02d}: [{'LEG' if 'sub' in embeds else ''}{'|DUB' if 'dub' in embeds else ''or'❌'}]",
                     "success" if embeds else "error")
                ep_list.append({
                    "id": f"{id_slug}-s{s_num}-ep{ep_i}", "number": ep_i,
                    "title": f"{title_r} - T{s_num} Ep {ep_i}",
                    "season": str(s_num), "embeds": embeds, "embedCredit": "topanimes.net",
                })
            sub_avail = max((ep["number"] for ep in ep_list if "sub" in ep.get("embeds",{})), default=0)
            dub_avail = max((ep["number"] for ep in ep_list if "dub" in ep.get("embeds",{})), default=0)
            has_sub   = sub_avail > 0; has_dub = dub_avail > 0
            total_eps = max(sub_avail, dub_avail) or total_eps
            wlog(f"[TOPANIMES] ✅ LEG:{sub_avail} DUB:{dub_avail}", "success")

        elif source == "goyabu" and gb_slug:
            # TODO: implementar após HTML2
            wlog("[GOYABU] ⚠️ Scraper não implementado ainda. Aguardando HTML2.", "warn")
            wlog("[GOYABU] Criando placeholders de episódios sem embed...", "dim")
            for ep_i in range(1, total_eps + 1):
                ep_list.append({
                    "id": f"{id_slug}-s{s_num}-ep{ep_i}", "number": ep_i,
                    "title": f"{title_r} - T{s_num} Ep {ep_i}",
                    "season": str(s_num), "embeds": {}, "embedCredit": "",
                })
            sub_avail = dub_avail = 0
            wlog(f"[GOYABU] Placeholders criados — embed a ser preenchido após HTML2.", "warn")

        else:
            # AniVideo
            av_sub = av_dub = None
            if avslug:
                letter = avslug[0].lower()
                av_sub = f"{letter}/{avslug}"
                if not is_movie and inc_s and s_num > 1:
                    av_sub += f"-{s_num}"
                av_dub = av_sub + "-dublado"
                wlog(f"[ANIVIDEO] sub: {av_sub}", "dim")
                wlog(f"[ANIVIDEO] dub: {av_dub}", "dim")
            for ep_i in range(1, total_eps + 1):
                embeds = {}
                if av_sub and has_sub: embeds["sub"] = make_iframe(anivideo_url(av_sub, ep_i))
                if av_dub and has_dub: embeds["dub"] = make_iframe(anivideo_url(av_dub, ep_i))
                ep_list.append({
                    "id": f"{id_slug}-s{s_num}-ep{ep_i}", "number": ep_i,
                    "title": f"{title_r} - T{s_num} Ep {ep_i}",
                    "season": str(s_num), "embeds": embeds,
                    "embedCredit": "api.anivideo.net" if (av_sub or av_dub) else "",
                })
            sub_avail = total_eps if has_sub else 0
            dub_avail = total_eps if has_dub else 0

        # Build season
        _label  = data.get("season_label","").strip() or f"{s_num}ª Temporada"
        _year   = int(data.get("season_year") or year or datetime.now().year)
        _score  = float(data.get("season_score") or score or 0.0)
        _status = data.get("season_status") or status_api

        season_data: dict = {
            "season": s_num, "seasonLabel": _label,
            "year": _year, "episodes": max_eps, "currentEpisode": total_eps,
            "status": _status, "score": _score, "synopsis": synopsis, "trailer": trailer,
            "audios": [
                {"type":"sub","label":"Legendado","available": has_sub, "episodesAvailable": sub_avail},
                {"type":"dub","label":"Dublado",  "available": has_dub, "episodesAvailable": dub_avail},
            ],
            "episodeList": ep_list,
        }

        if source == "aonlinecc" and ao_slug:
            season_data["aonlinecc_slug"] = ao_slug
            season_data["aonlinecc_inc_season"] = ao_inc_s
        if source == "topanimes" and ta_slug_sub:
            season_data["topanimes_slug_sub"] = ta_slug_sub
            season_data["topanimes_slug_dub"] = ta_slug_dub or (ta_slug_sub + "-dublado")
            season_data["topanimes_sub_src"]  = ta_sub_src
            season_data["topanimes_dub_src"]  = ta_dub_src
        if source == "goyabu" and gb_slug:
            season_data["goyabu_slug"] = gb_slug   # stored for future auto-update

        if is_movie:
            season_data["type"]       = "movie"
            season_data["movieTitle"] = data.get("mv_title") or title_r
            season_data["seasonLabel"]= data.get("mv_title") or title_r
            season_data["tagline"]    = data.get("mv_tag","")
            season_data["runtime"]    = int(data.get("mv_rt","") or runtime or 0)
            season_data["director"]   = data.get("mv_dir","")
            season_data["ageRating"]  = data.get("mv_age","")
            season_data["accentColor"]= data.get("mv_acc","#FF2E2E")
            season_data["posterImage"]= data.get("mv_post","") or cover
            season_data["stills"]     = [s.strip() for s in (data.get("mv_stills","")).split(",") if s.strip()]
            cast_list = []
            for line in (data.get("mv_cast","") or "").strip().splitlines():
                parts = [p.strip() for p in line.split("|")]
                if len(parts) >= 2:
                    cast_list.append({"character":parts[0],"voice":parts[1],"voiceDub":parts[2] if len(parts)>2 else "—"})
            season_data["cast"]   = cast_list
            season_data["awards"] = [a.strip() for a in (data.get("mv_awards","")).split(",") if a.strip()]

        # Save
        db       = load_db()
        existing = next((a for a in db if a.get("id") == id_slug), None)
        if existing:
            wlog(f"Anime '{id_slug}' já existe — integrando T{s_num}...", "dim")
            if cover: existing["coverImage"] = cover
            existing["bannerImage"] = banner
            replaced = False
            for idx, s in enumerate(existing.get("seasons",[])):
                if int(s.get("season",0)) == s_num:
                    existing["seasons"][idx] = season_data
                    replaced = True
                    wlog(f"  T{s_num} substituída.", "success")
                    break
            if not replaced:
                existing.setdefault("seasons",[]).append(season_data)
                wlog(f"  T{s_num} adicionada.", "success")
            existing["seasons"] = sorted(existing["seasons"], key=lambda x: int(x.get("season",0)))
        else:
            src_label = (
                f"AnimesOnlineCC ({ao_slug})" if source=="aonlinecc" else
                f"TopAnimes ({ta_slug_sub})"  if source=="topanimes" else
                f"Goyabu ({gb_slug})"         if source=="goyabu" and gb_slug else
                f"AniVideo ({avslug or 'sem slug'})"
            )
            db.append({
                "id": id_slug, "title": title_r, "titleRomaji": title_r,
                "titleJapanese": title_j, "genre": genres, "studio": studio,
                "recommended": False, "anilistId": al_id,
                "adultContent": data.get("adult", False),
                "coverImage": cover, "bannerImage": banner,
                "seasons": [season_data],
            })
            wlog(f"✅ '{title_r}' criado com {total_eps} ep(s) (T{s_num}) via {src_label}!", "success")
            log_event("add", f"Adicionado: {title_r}",
                      f"T{s_num} · {total_eps} eps · {'Filme' if is_movie else 'Série'} · {src_label}")

        save_db(db)
        q.put({"type": "done", "anime_id": id_slug})
        q.put(None)

    threading.Thread(target=_worker, daemon=True).start()
    return jsonify({"stream_id": sid})

# ── Update one ─────────────────────────────────────────────────────────────────

@app.route('/api/update_one/<anime_id>', methods=['POST'])
def api_update_one(anime_id):
    db    = load_db()
    anime = next((a for a in db if a.get("id") == anime_id), None)
    if not anime:
        return jsonify({"error": "not found"}), 404
    sid = str(time.time_ns())
    q: queue.Queue = queue.Queue()
    _streams[sid]  = q

    def wlog(msg, lvl="info"):
        q.put({"type": "log", "msg": msg, "lvl": lvl})

    def _worker():
        wlog(f"▶  {anime['title']}", "title")
        wlog("─" * 50)
        for info in get_audio_ep_counts(anime):
            parts = []
            if info["sub"] is not None: parts.append(f"LEG:{info['sub']:02d}")
            if info["dub"] is not None: parts.append(f"DUB:{info['dub']:02d}")
            max_s = f"/{info['max']}" if info["max"] else ""
            wlog(f"  [{info['label']}]  {' | '.join(parts)}{max_s}  [{info.get('source','?').upper()}]", "dim")
        wlog("")
        msgs = try_add_next_ep(anime)
        added_eps = [m for m in msgs if "✅" in m]
        for m in msgs:
            lvl = "success" if "✅" in m else ("error" if ("❌" in m or "⚠️" in m) else "dim")
            wlog(m, lvl)
        save_db(db)
        if added_eps:
            detail = " | ".join(re.sub(r"\s+"," ",m.strip()) for m in added_eps)
            log_event("update", f"Eps adicionados: {anime['title']}", detail)
        wlog("\n✅ Concluído!", "success")
        q.put({"type": "done"})
        q.put(None)

    threading.Thread(target=_worker, daemon=True).start()
    return jsonify({"stream_id": sid})

# ── AnimesOnlineCC bulk ────────────────────────────────────────────────────────

@app.route('/api/aonlinecc/bulk_scrape', methods=['POST'])
def api_aonlinecc_bulk_scrape():
    data = request.json
    sid  = str(time.time_ns())
    q: queue.Queue = queue.Queue()
    _streams[sid]  = q

    def wlog(msg, lvl="info"):
        q.put({"type": "log", "msg": msg, "lvl": lvl})

    def _worker():
        anime_id  = data.get("anime_id","").strip()
        season_n  = int(data.get("season",1))
        ao_slug   = data.get("slug","").strip()
        max_ep    = int(data.get("max_ep",0) or 0)
        overwrite = bool(data.get("overwrite",False))

        if not anime_id or not ao_slug:
            wlog("❌ anime_id e slug são obrigatórios!", "error")
            q.put({"type":"done"}); q.put(None); return

        db    = load_db()
        anime = next((a for a in db if a.get("id") == anime_id), None)
        if not anime:
            wlog(f"❌ Anime '{anime_id}' não encontrado!", "error")
            q.put({"type":"done"}); q.put(None); return
        season_obj = next((s for s in anime.get("seasons",[]) if int(s.get("season",0)) == season_n), None)
        if not season_obj:
            wlog(f"❌ Temporada {season_n} não encontrada!", "error")
            q.put({"type":"done"}); q.put(None); return

        season_obj["aonlinecc_slug"] = ao_slug
        wlog(f"▶  {anime['title']} — T{season_n}", "title")
        wlog(f"   Slug: {ao_slug}  max_ep={max_ep or 'auto'}  overwrite={overwrite}", "dim")
        wlog("─" * 54)

        ep_map: dict[int,dict] = {int(ep["number"]): ep for ep in season_obj.get("episodeList",[])}
        added_count = skipped_count = 0
        ep_num      = 1
        consecutive_fails = 0

        while True:
            if max_ep and ep_num > max_ep: break
            if consecutive_fails >= 3:
                wlog("  3 falhas consecutivas — encerrando.", "dim"); break
            if not overwrite and ep_num in ep_map:
                ex = ep_map[ep_num].get("embeds",{})
                if ex.get("sub") or ex.get("dub"):
                    wlog(f"  Ep {ep_num:02d}: ⏭ já existe, pulando.", "dim")
                    skipped_count += 1; consecutive_fails = 0; ep_num += 1; continue
            wlog(f"  Ep {ep_num:02d}: buscando...", "dim")
            result = scrape_aonlinecc_ep(ao_slug, season_n, ep_num)
            if result is None:
                wlog(f"  Ep {ep_num:02d}: ❌ não encontrado.", "error")
                consecutive_fails += 1; ep_num += 1; continue
            consecutive_fails = 0
            tags = []; 
            if "sub" in result: tags.append("LEG")
            if "dub" in result: tags.append("DUB")
            wlog(f"  Ep {ep_num:02d}: ✅ [{' + '.join(tags)}]", "success")
            if ep_num in ep_map:
                ep_map[ep_num].setdefault("embeds",{})
                if "sub" in result: ep_map[ep_num]["embeds"]["sub"] = result["sub"]
                if "dub" in result: ep_map[ep_num]["embeds"]["dub"] = result["dub"]
                ep_map[ep_num]["embedCredit"] = "animesonlinecc.to"
            else:
                ep_map[ep_num] = {
                    "id": f"{anime_id}-s{season_n}-ep{ep_num}", "number": ep_num,
                    "title": f"{anime.get('titleRomaji',anime['title'])} - T{season_n} Ep {ep_num}",
                    "season": str(season_n), "embeds": result, "embedCredit": "animesonlinecc.to",
                }
            added_count += 1; ep_num += 1

        season_obj["episodeList"] = sorted(ep_map.values(), key=lambda x: int(x["number"]))
        all_sub = sorted(n for n,ep in ep_map.items() if ep.get("embeds",{}).get("sub"))
        all_dub = sorted(n for n,ep in ep_map.items() if ep.get("embeds",{}).get("dub"))
        for aud in season_obj.get("audios",[]):
            if aud["type"]=="sub" and all_sub: aud["available"]=True; aud["episodesAvailable"]=all_sub[-1]
            if aud["type"]=="dub" and all_dub: aud["available"]=True; aud["episodesAvailable"]=all_dub[-1]
        if all_sub or all_dub:
            season_obj["currentEpisode"] = max(all_sub[-1] if all_sub else 0, all_dub[-1] if all_dub else 0)
        max_e    = season_obj.get("episodes",0)
        sub_done = all_sub[-1] if all_sub else 0
        if max_e and sub_done >= max_e:
            season_obj["status"] = "finished"
            wlog("🏁 Temporada marcada como finalizada!", "success")
        save_db(db)
        wlog(""); wlog(f"✅ {added_count} eps adicionados · {skipped_count} pulados.", "success")
        if all_sub: wlog(f"   Legendado: Ep 01–{all_sub[-1]:02d}", "success")
        if all_dub: wlog(f"   Dublado:   Ep 01–{all_dub[-1]:02d}", "success")
        wlog("══ Finalizado ══", "title")
        log_event("add", f"AnimesOnlineCC bulk: {anime['title']} T{season_n}",
                  f"{added_count} eps | sub:{all_sub[-1] if all_sub else 0} dub:{all_dub[-1] if all_dub else 0}")
        q.put({"type":"done","added":added_count,"skipped":skipped_count})
        q.put(None)

    threading.Thread(target=_worker, daemon=True).start()
    return jsonify({"stream_id": sid})


# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("⛩  ANIME OPS — Admin Panel v2")
    print("   Acesse: http://localhost:5000")
    # Iniciar scheduler se configurado
    _s = load_settings()
    if _s.get("auto_update_enabled") or _s.get("auto_update_times"):
        scheduler_start()
        print("   ⏱  Scheduler iniciado")
    app.run(debug=True, port=5000, threaded=True)