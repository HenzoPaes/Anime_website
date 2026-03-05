#!/usr/bin/env python3
"""
Anime Admin Panel — Web Edition
pip install flask requests
pip install playwright && playwright install chromium  (opcional)
"""

from __future__ import annotations
import re, os, sys, time, json, subprocess, threading, io, queue
from datetime import datetime
from urllib.parse import quote_plus, urljoin

try:
    from playwright.sync_api import sync_playwright as _sync_playwright
    PLAYWRIGHT_OK = True
except ImportError:
    PLAYWRIGHT_OK = False

import requests
from flask import Flask, jsonify, request, render_template, Response, stream_with_context

app = Flask(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
LOG_FILE        = "anime_admin_log.json"
GITHUB_RAW_URL  = "https://raw.githubusercontent.com/HenzoPaes/Anime_website/refs/heads/data/output.json"
GITHUB_REPO     = "https://github.com/HenzoPaes/Anime_website.git"
GIT_BRANCH      = "data"
ANIMES_FOLDER   = "./api/Animes"
OUTPUT_FILE     = "output.json"
ANIVIDEO_WRAP   = "https://api.anivideo.net/videohls.php"
ANIVIDEO_CDN    = "https://cdn-s01.mywallpaper-4k-image.net/stream"
AONLINECC_BASE  = "https://animesonlinecc.to"
PAGECONFIG_FILE = "pageconfig.json"

_DEFAULT_PAGECONFIG = {
    "featuredAnimeId":    "",
    "heroBadgeText":      "⭐ Melhor avaliado",
    "heroCtaText":        "Assistir agora",
    "siteTitle":          "AnimeVerse — Seu portal de animes",
    "catalogTitle":       "Todos os Animes",
    "showRandomButton":   True,
    "featuredBannerBlur": False,
    "pinnedGenres":       [],
    "announcement": {
        "enabled":    False,
        "text":       "",
        "type":       "info",
        "dismissible": True,
    },
    "lastUpdated": "",
}

# ── SSE stream registry ───────────────────────────────────────────────────────
_streams: dict[str, queue.Queue] = {}
_LOG_LOCK = threading.Lock()


# ═════════════════════════════════════════════════════════════════════════════
# BUSINESS LOGIC
# ═════════════════════════════════════════════════════════════════════════════

def make_iframe(src: str) -> str:
    return f'<iframe width="100%" height="100%" src="{src}" frameborder="0" allowfullscreen></iframe>'

# ── AniVideo ──────────────────────────────────────────────────────────────────

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

# ── AnimesOnlineCC ────────────────────────────────────────────────────────────

_AONLINECC_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "pt-BR,pt;q=0.9",
}

def aonlinecc_ep_url(slug: str, season: int, ep: int) -> str:
    """
    Temporada 1 → /episodio/{slug}-episodio-1/
    Temporada 2 → /episodio/{slug}-2-episodio-1/
    """
    if season <= 1:
        return f"{AONLINECC_BASE}/episodio/{slug}-episodio-{ep}/"
    return f"{AONLINECC_BASE}/episodio/{slug}-{season}-episodio-{ep}/"

def _normalize_iframe(raw: str) -> str:
    tag = raw.strip()
    if 'width=' not in tag:
        tag = tag.replace('<iframe', '<iframe width="100%" height="100%"', 1)
    if 'allowfullscreen' not in tag.lower():
        tag = re.sub(r'(/?>)$', ' allowfullscreen></iframe>', tag)
    if not tag.endswith('</iframe>'):
        tag = re.sub(r'\s*/?>$', '></iframe>', tag)
    return tag

def scrape_aonlinecc_ep(slug: str, season: int, ep: int) -> dict | None:
    """
    Retorna embeds do episódio ou None se não encontrado.

    Regra do site:
      • option-1 somente         → Legendado
      • option-1 + option-2      → option-1 = Dublado, option-2 = Legendado
    """
    url = aonlinecc_ep_url(slug, season, ep)
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
        else:
            return {"sub": _normalize_iframe(opt1)}

    except Exception:
        return None

def aonlinecc_ep_exists(slug: str, season: int, ep: int) -> bool:
    url = aonlinecc_ep_url(slug, season, ep)
    try:
        r = requests.head(url, timeout=8, headers=_AONLINECC_HEADERS, allow_redirects=True)
        return r.status_code < 400
    except Exception:
        return False

# ── MAL ───────────────────────────────────────────────────────────────────────

def fetch_mal_info(query: str) -> dict | None:
    url = f"https://api.jikan.moe/v4/anime?q={query}&limit=1"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        if data.get('data'):
            return data['data'][0]
    except:
        pass
    return None

def fetch_mal_by_id(mal_id: int) -> dict | None:
    try:
        r = requests.get(f"https://api.jikan.moe/v4/anime/{mal_id}", timeout=12)
        r.raise_for_status()
        return r.json().get("data")
    except:
        return None

def mal_to_season_data(mal: dict, s_num: int, is_movie=False) -> dict:
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
    _s = mal.get('status', '')
    if _s == "Finished Airing":
        status = "finished"
    elif _s == "Currently Airing":
        status = "ongoing"
    elif _s in ("Not yet aired", "On Hiatus"):
        status = "paused"
    else:
        status = "ongoing"
    dur_str = mal.get('duration') or "0 min"
    try:
        runtime = int(dur_str.split(" ")[0])
    except:
        runtime = 0
    rating = mal.get('rating') or ''
    return {
        "title_r": title_r, "title_j": title_j, "studio": studio,
        "genres": genres, "mal_id": mal_id, "cover": cover,
        "year": year, "status": status, "score": score,
        "eps_tot": eps_tot, "synopsis": synopsis, "trailer": trailer,
        "runtime": runtime, "rating": rating,
    }

# ── Crunchyroll Banner ────────────────────────────────────────────────────────

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
        except:
            return fallback
        series_href = page.locator("a[href*='/series/']").first.get_attribute("href")
        if not series_href:
            return fallback
        series_url = urljoin("https://www.crunchyroll.com", series_href)
        page.goto(series_url, wait_until="domcontentloaded", timeout=20000)
        try:
            page.wait_for_selector("source[srcset*='keyart']", timeout=8000)
        except:
            pass
        keyart_id = None
        for source in page.locator("source[srcset*='keyart']").all():
            srcset = source.get_attribute("srcset") or ""
            m = CR_KEYART_RE.search(srcset)
            if m:
                keyart_id = m.group(1)
                break
        if not keyart_id:
            html = page.content()
            m = CR_KEYART_RE.search(html)
            if m:
                keyart_id = m.group(1)
        if not keyart_id:
            return fallback
        return build_crunchyroll_banner_url(keyart_id)
    except:
        return fallback
    finally:
        try:
            page.close()
        except:
            pass

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
                except: pass
    except:
        return fallback

# ── DB ────────────────────────────────────────────────────────────────────────

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
        except:
            pass
    return dict(_DEFAULT_PAGECONFIG)

def save_pageconfig(cfg: dict):
    cfg["lastUpdated"] = datetime.now().strftime("%Y-%m-%d")
    with open(PAGECONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)

# ── Episodes ──────────────────────────────────────────────────────────────────

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
            "source": "aonlinecc" if season.get("aonlinecc_slug") else "anivideo",
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

        # AnimesOnlineCC path
        ao_slug = season.get("aonlinecc_slug", "").strip()
        if ao_slug:
            sub_cur = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "sub" and a.get("available")), 0)
            dub_cur = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "dub" and a.get("available")), 0)
            cur     = max(sub_cur, dub_cur)
            next_e  = cur + 1
            max_e   = season.get("episodes", 0)
            if max_e and next_e > max_e:
                continue
            results.append({
                "season": s_num, "label": season.get("seasonLabel", f"S{s_num}"),
                "source": "aonlinecc", "ao_slug": ao_slug,
                "current": cur, "next_ep": next_e, "max": max_e,
            })
            continue

        # AniVideo path
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
                                 "source": "anivideo", "audio": "sub", "audio_label": "Legendado",
                                 "current": cur, "next_ep": next_e, "max": max_e, "path": sub_path})
            if aud["type"] == "dub" and aud.get("available") and dub_path:
                cur = max(dub_cur, aud.get("episodesAvailable", dub_cur))
                next_e = cur + 1
                max_e  = season.get("episodes", 0)
                if max_e and next_e > max_e:
                    continue
                results.append({"season": s_num, "label": season.get("seasonLabel", f"S{s_num}"),
                                 "source": "anivideo", "audio": "dub", "audio_label": "Dublado",
                                 "current": cur, "next_ep": next_e, "max": max_e, "path": dub_path})
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

        ao_slug = season.get("aonlinecc_slug", "").strip()
        ep_map: dict[int, dict] = {int(ep["number"]): ep for ep in ep_list}

        # ── AnimesOnlineCC ─────────────────────────────────────────────
        if ao_slug:
            aud_sub = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "sub" and a.get("available")), 0)
            aud_dub = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "dub" and a.get("available")), 0)
            cur     = max(int(aud_sub or 0), int(aud_dub or 0))
            next_e  = cur + 1
            if max_e and next_e > max_e:
                continue

            logs.append(f"    [AONLINECC] slug={ao_slug} atual:{cur:02d} → Checando {next_e:02d}...")
            result = scrape_aonlinecc_ep(ao_slug, s_num, next_e)

            if result:
                has_sub = "sub" in result
                has_dub = "dub" in result
                tags = "/".join(t.upper() for t in result)
                logs.append(f"    [AONLINECC] ✅ Ep {next_e:02d} disponível! [{tags}]")

                if next_e in ep_map:
                    ep_map[next_e].setdefault("embeds", {})
                    if has_sub: ep_map[next_e]["embeds"]["sub"] = result["sub"]
                    if has_dub: ep_map[next_e]["embeds"]["dub"] = result["dub"]
                    ep_map[next_e]["embedCredit"] = "animesonlinecc.to"
                else:
                    ep_map[next_e] = {
                        "id":          f"{anime['id']}-s{s_num}-ep{next_e}",
                        "number":      next_e,
                        "title":       f"{anime.get('titleRomaji', anime['title'])} - T{s_num} Ep {next_e}",
                        "season":      str(s_num),
                        "embeds":      result,
                        "embedCredit": "animesonlinecc.to",
                    }

                for aud in audios:
                    if aud.get("type") == "sub" and has_sub:
                        aud["available"] = True
                        aud["episodesAvailable"] = next_e
                    if aud.get("type") == "dub" and has_dub:
                        aud["available"] = True
                        aud["episodesAvailable"] = next_e

                season["episodeList"] = sorted(ep_map.values(), key=lambda x: int(x["number"]))
                all_nums = [int(ep["number"]) for ep in season["episodeList"] if ep.get("embeds")]
                if all_nums:
                    season["currentEpisode"] = max(all_nums)

                sub_done = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "sub"), 0)
                dub_done = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "dub"), 0)
                if max_e and min(int(sub_done or 0), int(dub_done or 0)) >= max_e:
                    season["status"] = "finished"
                    logs.append(f"    🏁 Temporada {s_num} concluída!")
            else:
                logs.append(f"    [AONLINECC] ❌ Ep {next_e:02d} não disponível.")

            continue  # pula AniVideo para esta temporada

        # ── AniVideo ───────────────────────────────────────────────────
        last_sub_num = last_dub_num = 0
        last_sub_path = last_dub_path = None

        for ep in ep_list:
            num    = int(ep["number"])
            embeds = ep.get("embeds", {}) or {}
            if embeds.get("sub"):
                last_sub_num = max(last_sub_num, num)
                p = extract_av_path(embeds["sub"])
                if p: last_sub_path = p
            if embeds.get("dub"):
                last_dub_num = max(last_dub_num, num)
                p = extract_av_path(embeds["dub"])
                if p: last_dub_path = p

        aud_sub = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "sub" and a.get("available")), 0)
        aud_dub = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "dub" and a.get("available")), 0)
        sub_cur = max(last_sub_num, int(aud_sub or 0))
        dub_cur = max(last_dub_num, int(aud_dub or 0))
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
            if all_nums:
                season["currentEpisode"] = max(all_nums)
            sub_done = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "sub"), 0)
            dub_done = next((a.get("episodesAvailable", 0) for a in audios if a.get("type") == "dub"), 0)
            if max_e and min(int(sub_done or 0), int(dub_done or 0)) >= max_e:
                season["status"] = "finished"
                logs.append(f"    🏁 Temporada {s_num} concluída!")

    return logs

# ── Logs ──────────────────────────────────────────────────────────────────────

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
            json.dump(logs[-2000:], f, ensure_ascii=False, indent=2)
    except:
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


# ═════════════════════════════════════════════════════════════════════════════
# API ROUTES
# ═════════════════════════════════════════════════════════════════════════════

@app.route('/')
def index():
    return render_template('index.html')

# ── DB ────────────────────────────────────────────────────────────────────────

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
    db = load_db()
    for i, a in enumerate(db):
        if a.get("id") == anime_id:
            db[i] = data
            save_db(db)
            return jsonify({"ok": True})
    return jsonify({"ok": False, "error": "not found"}), 404

@app.route('/api/anime/<anime_id>', methods=['DELETE'])
def api_delete_anime(anime_id):
    db = load_db()
    title = next((a.get("title","?") for a in db if a.get("id") == anime_id), "?")
    db = [a for a in db if a.get("id") != anime_id]
    fp = os.path.join(ANIMES_FOLDER, f"{anime_id}.json")
    if os.path.exists(fp):
        os.remove(fp)
    save_db(db)
    log_event("delete", f"Removido: {title}", level="warning")
    return jsonify({"ok": True})

# ── Stats ─────────────────────────────────────────────────────────────────────

@app.route('/api/stats')
def api_stats():
    db = load_db()
    ongoing  = sum(1 for a in db if any(s.get("status")=="ongoing"  for s in a.get("seasons",[])))
    paused   = sum(1 for a in db if any(s.get("status")=="paused"   for s in a.get("seasons",[])))
    finished = len(db) - ongoing - paused
    total_ep = sum(s.get("currentEpisode",0) for a in db for s in a.get("seasons",[]))
    has_dub  = sum(1 for a in db if any(aud.get("available") and aud.get("type")=="dub"
                                         for s in a.get("seasons",[]) for aud in s.get("audios",[])))
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

# ── Logs ──────────────────────────────────────────────────────────────────────

@app.route('/api/logs')
def api_get_logs():
    kind = request.args.get("kind")
    logs = _load_logs()
    if kind and kind != "todos":
        logs = [l for l in logs if l.get("kind") == kind]
    return jsonify(list(reversed(logs[-200:])))

@app.route('/api/logs', methods=['DELETE'])
def api_clear_logs():
    with _LOG_LOCK:
        _save_logs([])
    return jsonify({"ok": True})

# ── Pageconfig ────────────────────────────────────────────────────────────────

@app.route('/api/pageconfig')
def api_get_pageconfig():
    return jsonify(load_pageconfig())

@app.route('/api/pageconfig', methods=['POST'])
def api_save_pageconfig():
    cfg = request.json
    save_pageconfig(cfg)
    log_event("git", "pageconfig.json salvo", f"featuredAnimeId={cfg.get('featuredAnimeId','')}")
    return jsonify({"ok": True})

# ── MAL ───────────────────────────────────────────────────────────────────────

@app.route('/api/mal/search')
def api_mal_search():
    q = request.args.get("q","")
    if not q:
        return jsonify({"error": "no query"}), 400
    mal = fetch_mal_info(q)
    if mal:
        return jsonify(mal)
    return jsonify({"error": "not found"}), 404

@app.route('/api/mal/by_id/<int:mal_id>')
def api_mal_by_id(mal_id):
    mal = fetch_mal_by_id(mal_id)
    if mal:
        return jsonify(mal)
    return jsonify({"error": "not found"}), 404

# ── Git ───────────────────────────────────────────────────────────────────────

@app.route('/api/git/push', methods=['POST'])
def api_git_push():
    msg = request.json.get("message","chore: update database")
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

# ── SSE Stream ────────────────────────────────────────────────────────────────

@app.route('/api/stream/<stream_id>')
def api_stream(stream_id):
    def generate():
        q = _streams.get(stream_id)
        if not q:
            yield "data: {\"type\":\"done\"}\n\n"
            return
        while True:
            try:
                msg = q.get(timeout=60)
                if msg is None:
                    yield "data: {\"type\":\"done\"}\n\n"
                    _streams.pop(stream_id, None)
                    break
                yield f"data: {json.dumps(msg)}\n\n"
            except queue.Empty:
                yield "data: {\"type\":\"ping\"}\n\n"
    return Response(
        stream_with_context(generate()),
        content_type='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'}
    )

# ── Update / Check ────────────────────────────────────────────────────────────

@app.route('/api/update', methods=['POST'])
def api_run_update():
    dry   = request.json.get("dry", False)
    sid   = str(time.time_ns())
    q: queue.Queue = queue.Queue()
    _streams[sid] = q

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
                if info["status"] == "finished" and info["type"] != "movie":
                    continue
                parts = []
                if info["sub"] is not None: parts.append(f"LEG: {info['sub']:02d}")
                if info["dub"] is not None: parts.append(f"DUB: {info['dub']:02d}")
                max_s  = f"/{info['max']}" if info["max"] else ""
                src_lbl = f" [{info.get('source','?').upper()}]"
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
                            tags = "/".join(t.upper() for t in result)
                            wlog(f"  [AONLINECC] ✅  Ep {chk['next_ep']:02d} DISPONÍVEL! [{tags}]", "success")
                            anime_changed = True
                        else:
                            wlog(f"  [AONLINECC] ❌  Ep {chk['next_ep']:02d} não disponível.", "error")
                    else:
                        tag = "LEG" if chk["audio"] == "sub" else "DUB"
                        wlog(f"  [{tag}] S{chk['season']} atual:{chk['current']:02d}{max_s} → ep {chk['next_ep']:02d}...", "dim")
                        if av_ep_exists(chk["path"], chk["next_ep"]):
                            wlog(f"  [{tag}] ✅  Ep {chk['next_ep']:02d} DISPONÍVEL!", "success")
                            anime_changed = True
                        else:
                            wlog(f"  [{tag}] ❌  Ep {chk['next_ep']:02d} não disponível.", "error")
                if anime_changed:
                    changed.append(title)
            else:
                msgs = try_add_next_ep(anime)
                added_eps  = [m for m in msgs if "✅" in m]
                error_msgs = [m for m in msgs if "sem stream_path" in m]
                for m in msgs:
                    lvl = "success" if "✅" in m else ("error" if ("❌" in m or "⚠️" in m) else "dim")
                    wlog(m, lvl)
                if added_eps:
                    detail = " | ".join(re.sub(r"\s+", " ", m.strip()) for m in added_eps)
                    log_event("update", f"Eps adicionados: {title}", detail)
                for e in error_msgs:
                    log_event("stream", title, e.strip(), level="error")
                if added_eps:
                    changed.append(title)

        if not dry and changed:
            save_db(db)

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

# ── Add anime (with source selection) ────────────────────────────────────────

@app.route('/api/add_anime', methods=['POST'])
def api_add_anime_full():
    data  = request.json
    sid   = str(time.time_ns())
    q: queue.Queue = queue.Queue()
    _streams[sid] = q

    def wlog(msg, lvl="info"):
        q.put({"type": "log", "msg": msg, "lvl": lvl})

    def _worker():
        name      = data["name"]
        id_slug   = data.get("slug") or re.sub(r"[^a-z0-9]+","-",name.lower()).strip("-")
        total_eps = int(data.get("eps",0) or 0)
        max_eps   = int(data.get("max_eps",0) or 0) or total_eps
        s_num     = int(data.get("season",1) or 1)
        source    = data.get("source", "anivideo")   # "anivideo" | "aonlinecc"
        has_sub   = data.get("has_sub", True)
        has_dub   = data.get("has_dub", False)
        is_movie  = data.get("is_movie", False)

        # Source-specific fields
        avslug    = (data.get("avslug") or "").strip()
        inc_s     = data.get("inc_season", True)
        ao_slug   = (data.get("ao_slug") or "").strip()

        wlog(f"[MAL] Buscando '{name}'...", "dim")
        mal = fetch_mal_info(name)
        if mal:
            md = mal_to_season_data(mal, s_num, is_movie)
            title_r    = name; title_j    = md["title_j"]
            genres     = md["genres"];   studio     = md["studio"]
            mal_id     = md["mal_id"];   cover      = md["cover"]
            score      = md["score"];    synopsis   = md["synopsis"]
            trailer    = md["trailer"];  year       = md["year"]
            status_api = md["status"];   runtime    = md["runtime"]
            rating     = md["rating"]
            wlog(f"[MAL] ✅ {title_r} ({year}) — {status_api} — ★{score}", "success")
        else:
            title_r = title_j = name; genres = []; studio = "Desconhecido"
            mal_id = 0; cover = ""; score = 0.0; synopsis = ""; trailer = ""
            year = datetime.now().year; status_api = "ongoing"; runtime = 0; rating = ""
            wlog("[MAL] ⚠️ Não encontrado. Usando defaults.", "error")

        if PLAYWRIGHT_OK:
            wlog(f"[CR] Buscando banner Crunchyroll para '{title_r}'...", "dim")
        else:
            wlog("[CR] ⚠️ Playwright não instalado.", "error")
        banner = fetch_crunchyroll_banner(title_r, fallback=cover)
        if banner and banner != cover:
            wlog("[CR] ✅ Banner encontrado!", "success")
        else:
            wlog("[CR] Banner não encontrado, usando cover como fallback.", "dim")
            banner = cover

        # ── Build episode list ────────────────────────────────────────
        ep_list = []

        if source == "aonlinecc" and ao_slug:
            wlog(f"[AONLINECC] Raspando {total_eps} ep(s) do slug '{ao_slug}'...", "dim")
            for ep_i in range(1, total_eps + 1):
                result = scrape_aonlinecc_ep(ao_slug, s_num, ep_i)
                embeds = result if result else {}
                tags   = "+".join(t.upper() for t in embeds) if embeds else "❌"
                wlog(f"  Ep {ep_i:02d}: [{tags}]", "success" if embeds else "error")
                ep_list.append({
                    "id":          f"{id_slug}-s{s_num}-ep{ep_i}",
                    "number":      ep_i,
                    "title":       f"{title_r} - T{s_num} Ep {ep_i}",
                    "season":      str(s_num),
                    "embeds":      embeds,
                    "embedCredit": "animesonlinecc.to",
                })
            # Recalcula disponibilidade com base no que foi raspado
            sub_avail = max((ep["number"] for ep in ep_list if ep.get("embeds", {}).get("sub")), default=0)
            dub_avail = max((ep["number"] for ep in ep_list if ep.get("embeds", {}).get("dub")), default=0)
            has_sub   = sub_avail > 0
            has_dub   = dub_avail > 0
            total_eps = max(sub_avail, dub_avail) or total_eps
            wlog(f"[AONLINECC] ✅ Raspagem concluída — LEG:{sub_avail} DUB:{dub_avail}", "success")

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

        # ── Build season ──────────────────────────────────────────────
        season_data: dict = {
            "season": s_num, "seasonLabel": f"{s_num}ª Temporada",
            "year": year, "episodes": max_eps, "currentEpisode": total_eps,
            "status": status_api, "score": score, "synopsis": synopsis, "trailer": trailer,
            "audios": [
                {"type":"sub","label":"Legendado","available": has_sub, "episodesAvailable": sub_avail},
                {"type":"dub","label":"Dublado",  "available": has_dub, "episodesAvailable": dub_avail},
            ],
            "episodeList": ep_list,
        }

        # Store aonlinecc slug for future auto-updates
        if source == "aonlinecc" and ao_slug:
            season_data["aonlinecc_slug"] = ao_slug

        if is_movie:
            season_data["type"]        = "movie"
            season_data["movieTitle"]  = data.get("mv_title") or title_r
            season_data["seasonLabel"] = data.get("mv_title") or title_r
            season_data["tagline"]     = data.get("mv_tag", "")
            season_data["runtime"]     = int(data.get("mv_rt","") or runtime or 0)
            season_data["director"]    = data.get("mv_dir", "")
            season_data["ageRating"]   = data.get("mv_age", "") or rating
            season_data["accentColor"] = data.get("mv_acc", "#FF2E2E")
            season_data["posterImage"] = data.get("mv_post", "") or cover
            raw_stills = data.get("mv_stills","")
            season_data["stills"] = [s.strip() for s in raw_stills.split(",") if s.strip()]
            cast_list = []
            for line in (data.get("mv_cast","") or "").strip().splitlines():
                parts = [p.strip() for p in line.split("|")]
                if len(parts) >= 2:
                    cast_list.append({"character": parts[0], "voice": parts[1],
                                       "voiceDub": parts[2] if len(parts) > 2 else "—"})
            season_data["cast"] = cast_list
            raw_awards = data.get("mv_awards","")
            season_data["awards"] = [a.strip() for a in raw_awards.split(",") if a.strip()]

        # ── Save to DB ────────────────────────────────────────────────
        db = load_db()
        existing = next((a for a in db if a.get("id") == id_slug), None)
        if existing:
            wlog(f"Anime '{id_slug}' já existe — integrando T{s_num}...", "dim")
            if cover: existing["coverImage"] = cover
            existing["bannerImage"] = banner
            replaced = False
            for idx, s in enumerate(existing.get("seasons", [])):
                if int(s.get("season",0)) == s_num:
                    existing["seasons"][idx] = season_data
                    replaced = True
                    wlog(f"  Substituída T{s_num}.", "success")
                    break
            if not replaced:
                existing.setdefault("seasons",[]).append(season_data)
                wlog(f"  Adicionada T{s_num}.", "success")
            existing["seasons"] = sorted(existing["seasons"], key=lambda x: int(x.get("season",0)))
        else:
            new_anime = {
                "id": id_slug, "title": title_r, "titleRomaji": title_r,
                "titleJapanese": title_j, "genre": genres, "studio": studio,
                "recommended": False, "malId": mal_id,
                "adultContent": data.get("adult", False),
                "coverImage": cover, "bannerImage": banner,
                "seasons": [season_data],
            }
            db.append(new_anime)
            src_label = f"AnimesOnlineCC ({ao_slug})" if source == "aonlinecc" else f"AniVideo ({avslug or 'sem slug'})"
            wlog(f"✅ '{title_r}' criado com {total_eps} eps (T{s_num}) via {src_label}!", "success")
            log_event("add", f"Adicionado: {title_r}",
                      f"T{s_num} · {total_eps} eps · {'Filme' if is_movie else 'Série'} · {src_label}")

        save_db(db)
        q.put({"type": "done", "anime_id": id_slug})
        q.put(None)

    threading.Thread(target=_worker, daemon=True).start()
    return jsonify({"stream_id": sid})

# ── Update single anime ───────────────────────────────────────────────────────

@app.route('/api/update_one/<anime_id>', methods=['POST'])
def api_update_one(anime_id):
    db = load_db()
    anime = next((a for a in db if a.get("id") == anime_id), None)
    if not anime:
        return jsonify({"error": "not found"}), 404

    sid = str(time.time_ns())
    q: queue.Queue = queue.Queue()
    _streams[sid] = q

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
            src_lbl = f" [{info.get('source','?').upper()}]"
            wlog(f"  [{info['label']}]  {' | '.join(parts)}{max_s}{src_lbl}", "dim")
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

# ── CR Banner ─────────────────────────────────────────────────────────────────

@app.route('/api/cr_banner')
def api_cr_banner():
    name     = request.args.get("name","")
    fallback = request.args.get("fallback","")
    banner   = fetch_crunchyroll_banner(name, fallback)
    return jsonify({"banner": banner, "found": banner != fallback})

# ── AnimesOnlineCC endpoints ──────────────────────────────────────────────────

@app.route('/api/aonlinecc/ep')
def api_aonlinecc_ep():
    slug   = request.args.get("slug", "").strip()
    season = int(request.args.get("season", 1))
    ep     = int(request.args.get("ep", 1))
    if not slug:
        return jsonify({"error": "slug obrigatório"}), 400
    url    = aonlinecc_ep_url(slug, season, ep)
    result = scrape_aonlinecc_ep(slug, season, ep)
    if result is None:
        return jsonify({"found": False, "url": url}), 404
    return jsonify({"found": True, "url": url, "has_sub": "sub" in result, "has_dub": "dub" in result, **result})

@app.route('/api/aonlinecc/set_slug', methods=['POST'])
def api_aonlinecc_set_slug():
    data     = request.json
    anime_id = data.get("anime_id", "")
    season_n = int(data.get("season", 1))
    slug     = data.get("slug", "").strip()
    if not anime_id or not slug:
        return jsonify({"error": "anime_id e slug são obrigatórios"}), 400
    db    = load_db()
    anime = next((a for a in db if a.get("id") == anime_id), None)
    if not anime:
        return jsonify({"error": "anime não encontrado"}), 404
    season_obj = next((s for s in anime.get("seasons", []) if int(s.get("season", 0)) == season_n), None)
    if not season_obj:
        return jsonify({"error": f"temporada {season_n} não encontrada"}), 404
    season_obj["aonlinecc_slug"] = slug
    save_db(db)
    log_event("source", f"AnimesOnlineCC slug definido: {anime['title']} T{season_n}", slug)
    return jsonify({"ok": True})

@app.route('/api/aonlinecc/bulk_scrape', methods=['POST'])
def api_aonlinecc_bulk_scrape():
    data = request.json
    sid  = str(time.time_ns())
    q: queue.Queue = queue.Queue()
    _streams[sid] = q

    def wlog(msg, lvl="info"):
        q.put({"type": "log", "msg": msg, "lvl": lvl})

    def _worker():
        anime_id  = data.get("anime_id", "").strip()
        season_n  = int(data.get("season", 1))
        ao_slug   = data.get("slug", "").strip()
        max_ep    = int(data.get("max_ep", 0) or 0)
        overwrite = bool(data.get("overwrite", False))

        if not anime_id or not ao_slug:
            wlog("❌ anime_id e slug são obrigatórios!", "error")
            q.put({"type": "done"}); q.put(None); return

        db    = load_db()
        anime = next((a for a in db if a.get("id") == anime_id), None)
        if not anime:
            wlog(f"❌ Anime '{anime_id}' não encontrado no DB!", "error")
            q.put({"type": "done"}); q.put(None); return

        season_obj = next((s for s in anime.get("seasons", []) if int(s.get("season", 0)) == season_n), None)
        if not season_obj:
            wlog(f"❌ Temporada {season_n} não encontrada no DB!", "error")
            q.put({"type": "done"}); q.put(None); return

        season_obj["aonlinecc_slug"] = ao_slug
        wlog(f"▶  {anime['title']} — T{season_n}", "title")
        wlog(f"   Slug: {ao_slug}  |  max_ep={max_ep or 'auto'}  |  overwrite={overwrite}", "dim")
        wlog("─" * 54)

        ep_map: dict[int, dict] = {int(ep["number"]): ep for ep in season_obj.get("episodeList", [])}
        added_count = skipped_count = 0
        ep_num = consecutive_fails = 1; consecutive_fails = 0

        while True:
            if max_ep and ep_num > max_ep:
                break
            if consecutive_fails >= 3:
                wlog("  3 falhas consecutivas — encerrando busca.", "dim")
                break
            if not overwrite and ep_num in ep_map:
                existing_embeds = ep_map[ep_num].get("embeds", {})
                if existing_embeds.get("sub") or existing_embeds.get("dub"):
                    wlog(f"  Ep {ep_num:02d}: ⏭  já tem embed, pulando.", "dim")
                    skipped_count += 1
                    consecutive_fails = 0
                    ep_num += 1
                    continue
            wlog(f"  Ep {ep_num:02d}: buscando...", "dim")
            result = scrape_aonlinecc_ep(ao_slug, season_n, ep_num)
            if result is None:
                wlog(f"  Ep {ep_num:02d}: ❌ não encontrado.", "error")
                consecutive_fails += 1
                ep_num += 1
                continue
            consecutive_fails = 0
            tags = []; 
            if "sub" in result: tags.append("LEG")
            if "dub" in result: tags.append("DUB")
            wlog(f"  Ep {ep_num:02d}: ✅ [{' + '.join(tags)}]", "success")
            if ep_num in ep_map:
                ep_map[ep_num].setdefault("embeds", {})
                if "sub" in result: ep_map[ep_num]["embeds"]["sub"] = result["sub"]
                if "dub" in result: ep_map[ep_num]["embeds"]["dub"] = result["dub"]
                ep_map[ep_num]["embedCredit"] = "animesonlinecc.to"
            else:
                ep_map[ep_num] = {
                    "id": f"{anime_id}-s{season_n}-ep{ep_num}", "number": ep_num,
                    "title": f"{anime.get('titleRomaji', anime['title'])} - T{season_n} Ep {ep_num}",
                    "season": str(season_n), "embeds": result, "embedCredit": "animesonlinecc.to",
                }
            added_count += 1
            ep_num += 1

        season_obj["episodeList"] = sorted(ep_map.values(), key=lambda x: int(x["number"]))
        all_sub = sorted(n for n, ep in ep_map.items() if ep.get("embeds", {}).get("sub"))
        all_dub = sorted(n for n, ep in ep_map.items() if ep.get("embeds", {}).get("dub"))
        for aud in season_obj.get("audios", []):
            if aud["type"] == "sub" and all_sub:
                aud["available"] = True; aud["episodesAvailable"] = all_sub[-1]
            if aud["type"] == "dub" and all_dub:
                aud["available"] = True; aud["episodesAvailable"] = all_dub[-1]
        if all_sub or all_dub:
            season_obj["currentEpisode"] = max(all_sub[-1] if all_sub else 0, all_dub[-1] if all_dub else 0)
        max_e    = season_obj.get("episodes", 0)
        sub_done = all_sub[-1] if all_sub else 0
        if max_e and sub_done >= max_e:
            season_obj["status"] = "finished"
            wlog("🏁 Temporada marcada como finalizada!", "success")
        save_db(db)
        wlog("", "dim")
        wlog(f"✅  {added_count} eps adicionados  |  {skipped_count} pulados.", "success")
        if all_sub: wlog(f"   Legendado: Ep 01–{all_sub[-1]:02d}", "success")
        if all_dub: wlog(f"   Dublado:   Ep 01–{all_dub[-1]:02d}", "success")
        wlog("══ Finalizado ══", "title")
        log_event("add", f"AnimesOnlineCC bulk: {anime['title']} T{season_n}",
                  f"{added_count} eps | sub:{all_sub[-1] if all_sub else 0} dub:{all_dub[-1] if all_dub else 0}")
        q.put({"type": "done", "added": added_count, "skipped": skipped_count})
        q.put(None)

    threading.Thread(target=_worker, daemon=True).start()
    return jsonify({"stream_id": sid})

# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("🎌 Anime Admin — Web Edition")
    print("   Acesse: http://localhost:5000")
    app.run(debug=True, port=5000, threaded=True)