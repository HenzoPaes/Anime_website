#!/usr/bin/env python3
import re
import time
import json
import requests
from urllib.parse import urlparse, urljoin, quote_plus
from playwright.sync_api import sync_playwright

# Regex para detectar links de vídeo e IDs numéricos
VIDEO_EXT_RE = re.compile(r'\.(mp4|m3u8|mpd|mkv)(?:\?.*)?$', re.IGNORECASE)
ID_RE = re.compile(r'/(\d+)/?$')

# ── AniVideo (animesdigital.org novo) ────────────────────────────────────────
# Extrai o stream_path do tipo "y/yofukashi-no-uta-2" de uma URL anivideo
ANIVIDEO_STREAM_RE = re.compile(
    r'cdn-s\d+\.mywallpaper-4k-image\.net/stream/([a-z]/[^/]+)/',
    re.IGNORECASE
)
ANIVIDEO_WRAPPER  = "https://api.anivideo.net/videohls.php"
ANIVIDEO_CDN_BASE = "https://cdn-s01.mywallpaper-4k-image.net/stream"

def build_anivideo_ep_url(stream_path: str, ep_num: int) -> str:
    """
    Monta a URL final do episódio para o player anivideo.net.

    stream_path: ex. "y/yofukashi-no-uta-2"  (letra/slug-temporada)
    ep_num     : numero do episodio (inteiro)

    URL gerada:
      https://api.anivideo.net/videohls.php
        ?d=https://cdn-s01.mywallpaper-4k-image.net/stream/y/yofukashi-no-uta-2/08.mp4/index.m3u8
        &nocache<timestamp>
    """
    ep_str  = f"{ep_num:02d}"               # 1 -> "01", 12 -> "12"
    cdn_url = f"{ANIVIDEO_CDN_BASE}/{stream_path}/{ep_str}.mp4/index.m3u8"
    nocache = int(time.time() * 1000)       # timestamp em ms como cache-buster
    return f"{ANIVIDEO_WRAPPER}?d={cdn_url}&nocache{nocache}"
def extract_av_base_slug(stream_path: str):
    """
    A partir de um stream_path completo, extrai a letra e o slug-base limpo.

    Exemplos:
      "j/jujutsu-kaisen-3-dublado" -> ("j", "jujutsu-kaisen")
      "y/yofukashi-no-uta-2"       -> ("y", "yofukashi-no-uta")
      "j/jujutsu-kaisen"           -> ("j", "jujutsu-kaisen")
      "j/jujutsu-kaisen-dublado"   -> ("j", "jujutsu-kaisen")
    """
    parts = stream_path.split("/", 1)
    letter = parts[0]
    slug   = parts[1] if len(parts) > 1 else ""
    slug   = re.sub(r"-dublado$", "", slug, flags=re.IGNORECASE)  # remove -dublado
    slug   = re.sub(r"-\d+$",     "", slug)                       # remove -N (numero da temporada)
    return letter.lower(), slug

def build_anivideo_stream_path(letter: str, base_slug: str, season_num: int, is_dub: bool = False) -> str:
    """
    Monta o stream_path para uma temporada e audio especificos.

    Regras:
      - T1 sub  ->  letter/base_slug
      - T1 dub  ->  letter/base_slug-dublado
      - T2 sub  ->  letter/base_slug-2
      - T2 dub  ->  letter/base_slug-2-dublado
      - T3 dub  ->  letter/base_slug-3-dublado
    """
    path = f"{letter}/{base_slug}"
    if season_num > 1:
        path += f"-{season_num}"
    if is_dub:
        path += "-dublado"
    return path
# ─────────────────────────────────────────────────────────────────────────────

# --- FUNÇÕES DE EXTRAÇÃO ---

def fetch_mal_info(query):
    print(f"\n[MAL] Buscando informações de '{query}' no MyAnimeList...")
    url = f"https://api.jikan.moe/v4/anime?q={query}&limit=1"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        if data.get('data'):
            print("[MAL] Anime encontrado com sucesso!")
            return data['data'][0]
    except Exception as e:
        print(f"[MAL] Erro ao buscar dados na API Jikan: {e}")
    return None


CR_KEYART_RE = re.compile(r'/keyart/([A-Z0-9]+)-', re.IGNORECASE)

def build_crunchyroll_banner_url(keyart_id, width=1920, quality=85, blur=0, variant="backdrop_wide"):
    """
    Monta a URL direta da CDN da Crunchyroll a partir do keyart ID.

    Parâmetros configuráveis:
      - width   : largura em px          (padrão 1920)
      - quality : qualidade 0-100        (padrão 85)
      - blur    : desfoque 0-100         (padrão 0  = nítido)
      - variant : sufixo do keyart       (padrão 'backdrop_wide')
                  outras opções: 'backdrop_tall', 'portrait', etc.

    Exemplo de URL gerada:
      https://imgsrv.crunchyroll.com/cdn-cgi/image/fit=cover,format=auto,
      quality=85,width=1920,blur=0/keyart/GT00365624-backdrop_wide
    """
    return (
        f"https://imgsrv.crunchyroll.com/cdn-cgi/image/"
        f"fit=cover,format=auto,quality={quality},width={width},blur={blur}"
        f"/keyart/{keyart_id}-{variant}"
    )

def fetch_crunchyroll_banner(anime_name, context, width=1920, quality=85, blur=0, variant="backdrop_wide"):
    """
    Busca o banner do anime na Crunchyroll extraindo o keyart ID da página
    e montando a URL direta da CDN com os parâmetros desejados.

    Retorna a URL do banner como string, ou None se não encontrar.
    """
    print(f"\n[CR] Buscando banner da Crunchyroll para '{anime_name}'...")
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
            print("[CR] Nenhum resultado de série encontrado na busca.")
            return None

        # 2) Acessa a página da série
        series_href = page.locator("a[href*='/series/']").first.get_attribute("href")
        if not series_href:
            print("[CR] href da série não encontrado.")
            return None
        series_url = urljoin("https://www.crunchyroll.com", series_href)
        print(f"[CR] Acessando: {series_url}")
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
            print("[CR] keyart ID não encontrado na página.")
            return None

        banner_url = build_crunchyroll_banner_url(keyart_id, width=width, quality=quality, blur=blur, variant=variant)
        print(f"[CR] Banner montado (ID={keyart_id}): {banner_url}")
        return banner_url

    except Exception as e:
        print(f"[CR] Erro ao buscar banner: {e}")
        return None
    finally:
        try:
            page.close()
        except Exception:
            pass


def extract_anidrive_iframe(page):
    try:
        page.wait_for_selector("#pembed iframe", timeout=8000)
        return page.locator("#pembed iframe").get_attribute("src")
    except:
        return None

def extract_animesdigital_iframe(page):
    try:
        if page.locator("#player1 iframe").count() > 0:
            return page.locator("#player1 iframe").get_attribute("src")
        if page.locator(".tab-video iframe").count() > 0:
            return page.locator(".tab-video iframe").first.get_attribute("src")
    except:
        return None
    return None

# --- NOVO: extração específica para animesonlinecc.to ---
def extract_animesonlinecc_iframes(page):
    """
    Retorna um dict com chaves 'dub' e 'sub' (valores podem ser None).
    Regras:
      - se existir #option-2 -> option-1 = Dublado, option-2 = Legendado
      - se NÃO existir option-2 -> option-1 = Legendado
    """
    try:
        src1 = None
        src2 = None
        if page.locator("div#option-1 iframe").count() > 0:
            src1 = page.locator("div#option-1 iframe").first.get_attribute("src")
        if page.locator("div#option-2 iframe").count() > 0:
            src2 = page.locator("div#option-2 iframe").first.get_attribute("src")

        # regra de mapeamento
        if src2:  # existe option-2 => option-1 = DUB, option-2 = SUB
            return {"dub": src1, "sub": src2}
        else:
            # somente option-1 => é legendado
            return {"dub": None, "sub": src1}
    except Exception:
        return {"dub": None, "sub": None}

def extract_next_episode_from_animesonline(page, anime_name=None):
    """
    Procura pelo link do 'Proximo episodio' entre os <div class="item">.
    """
    try:
        items = page.locator("div.item a")
        for i in range(items.count()):
            a = items.nth(i)
            try:
                span_text = a.locator("span").inner_text().strip().lower()
            except:
                span_text = ""
            title = (a.get_attribute("title") or "").lower()
            href = a.get_attribute("href")
            if "proximo episodio" in span_text:
                if anime_name:
                    if anime_name.lower() in title:
                        return urljoin(page.url, href) if href else None
                else:
                    return urljoin(page.url, href) if href else None
        anchors = page.locator("a:has-text('Proximo episodio')")
        if anchors.count() > 0:
            href = anchors.first.get_attribute("href")
            return urljoin(page.url, href) if href else None
    except:
        pass
    return None

def extract_episode_links_from_animesdigital(context, sample_ep_url):
    if not sample_ep_url:
        return []
    page = context.new_page()
    try:
        page.set_extra_http_headers({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
        resp = page.goto(sample_ep_url, wait_until="domcontentloaded", timeout=20000)
        if resp and resp.status >= 400:
            print(f"   [!] Erro {resp.status} ao carregar (lista eps): {sample_ep_url}")
            return []
        try:
            page.wait_for_selector(".sidebar_navigation_episodes a.episode_list_episodes_item", timeout=6000)
        except:
            pass
        anchors = page.locator(".sidebar_navigation_episodes a.episode_list_episodes_item")
        links = []
        for i in range(anchors.count()):
            href = anchors.nth(i).get_attribute("href")
            if href:
                href = urljoin(sample_ep_url, href)
                links.append(href)
        if not links:
            anchors2 = page.locator(".sidebar_navigation_episodes a")
            for i in range(anchors2.count()):
                href = anchors2.nth(i).get_attribute("href")
                if href:
                    href = urljoin(sample_ep_url, href)
                    links.append(href)
        return links
    except Exception as e:
        print(f"   [!] Erro ao extrair lista de episódios (animesdigital): {e}")
        return []
    finally:
        try: page.close()
        except: pass

def extract_for_episode(context, ep_url, desired_audio=None, is_animes_online=False, is_animesdigital=False, is_animesonlinecc=False, is_anivideo=False):
    if not ep_url: return None

    # AniVideo: URL ja e a URL final do player, sem necessidade de browser
    if is_anivideo:
        print(f"   [AV] URL direta (sem browser): {ep_url[:80]}...")
        return ep_url

    page = context.new_page()
    try:
        page.set_extra_http_headers({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
        response = page.goto(ep_url, wait_until="domcontentloaded", timeout=30000)
        if response and response.status >= 400:
            print(f"   [!] Erro {response.status} ao carregar página: {ep_url}")
            return None

        if is_animes_online:
            src = extract_anidrive_iframe(page)
            if src:
                return src

        if is_animesonlinecc:
            mapping = extract_animesonlinecc_iframes(page)
            if mapping:
                if desired_audio == "dub":
                    return mapping.get("dub") or mapping.get("sub")
                if desired_audio == "sub":
                    return mapping.get("sub") or mapping.get("dub")
                return mapping.get("sub") or mapping.get("dub")

            next_ep = extract_next_episode_from_animesonline(page)
            if next_ep:
                try:
                    page.wait_for_timeout(500)
                    page.goto(next_ep, wait_until="domcontentloaded", timeout=15000)
                    mapping = extract_animesonlinecc_iframes(page)
                    if mapping:
                        if desired_audio == "dub":
                            return mapping.get("dub") or mapping.get("sub")
                        if desired_audio == "sub":
                            return mapping.get("sub") or mapping.get("dub")
                        return mapping.get("sub") or mapping.get("dub")
                except:
                    pass

        if is_animesdigital:
            src = extract_animesdigital_iframe(page)
            if src:
                return src

        found_network = []
        def on_response(res):
            try:
                u = res.url
                if VIDEO_EXT_RE.search(u):
                    found_network.append(u)
            except:
                pass
        page.on("response", on_response)

        try:
            page.wait_for_load_state("networkidle", timeout=6000)
        except:
            pass

        possible_play_selectors = [
            "button.play", ".play-button", ".jw-play-btn", ".plyr__controls .play",
            ".vjs-big-play-button", ".play", "#play", ".watch-btn", ".btn-play"
        ]
        for sel in possible_play_selectors:
            try:
                if page.locator(sel).count() > 0:
                    page.click(sel)
                    page.wait_for_timeout(2000)
            except:
                pass

        if found_network:
            return found_network[0]

        if page.locator("iframe").count() > 0:
            for i in range(page.locator("iframe").count()):
                try:
                    src = page.locator("iframe").nth(i).get_attribute("src")
                    if src and VIDEO_EXT_RE.search(src):
                        return src
                    if src and "videohls.php" in src and "d=" in src:
                        m = re.search(r'd=([^&]+)', src)
                        if m:
                            return m.group(1)
                except:
                    pass

        return None
    except Exception as e:
        print(f"   [!] Erro na extração ({ep_url}): {e}")
        return None
    finally:
        try: page.close()
        except: pass

def build_base_info_from_url(url):
    if not url: return None
    domain = urlparse(url).netloc.lower()
    is_ao    = "animesonline" in domain
    is_ad    = "animesdigital" in domain
    is_ao_cc = "animesonlinecc" in domain or "animesonlinecc.to" in domain

    # AniVideo: detecta pela URL do CDN ou pelo wrapper anivideo.net
    is_av = "anivideo.net" in url or "mywallpaper-4k-image.net/stream" in url
    av_stream_path = None
    if is_av:
        m = ANIVIDEO_STREAM_RE.search(url)
        if m:
            av_stream_path = m.group(1)   # ex: "y/yofukashi-no-uta-2"
            print(f"   [AV] stream_path detectado: {av_stream_path}")
        else:
            print("   [AV] URL anivideo detectada mas stream_path nao encontrado.")
            is_av = False

    match = ID_RE.search(url)
    start_id = int(match.group(1)) if match else None
    base_site = None
    base_fire = None
    if is_ao and start_id is not None:
        base_site = url.split(str(start_id))[0]
    if not is_ao and not is_ad and not is_av:
        base_fire = re.sub(r'/\d+/?$', '', url)
    return {
        "is_animesonline":   is_ao,
        "is_animesdigital":  is_ad,
        "is_animesonlinecc": is_ao_cc,
        "is_anivideo":       is_av,
        "av_stream_path":    av_stream_path,
        "start_id":          start_id,
        "base_site":         base_site,
        "base_fire":         base_fire,
    }

def make_iframe_html(src):
    if not src: return ""
    return f'<iframe width="100%" height="100%" src="{src}" frameborder="0" allowfullscreen></iframe>'

def normalize_yesno(raw: str):
    return (raw or "").strip().lower() in ("s", "sim", "y", "yes", "true", "1")

def prompt_nonempty(prompt_text):
    v = ""
    while not v.strip():
        v = input(prompt_text).strip()
    return v

# --- FUNÇÃO PRINCIPAL ---

def main():
    print("--- Extrator Universal de Animes (Com Modo Seguro) ---")

    anime_name = prompt_nonempty("Nome do Anime (para MAL): ")
    id_prefix = prompt_nonempty("ID Slug para o JSON (ex: bleach): ")
    
    is_safe_mode = normalize_yesno(input("\n>>> ATIVAR MODO SEGURO? (Pede o link de CADA episódio manualmente) (s/n): "))

    # ── Detecção antecipada do AniVideo ──────────────────────────────────────
    is_anivideo_site = normalize_yesno(input("\nUsar animesdigital.org (anivideo)? (s/n): "))
    av_letter    = None
    av_base_slug = None
    if is_anivideo_site and not is_safe_mode:
        print("\n[AV] Cole a URL de qualquer episodio do anime (ex: ep 1 T1 sub ou dub).")
        print("     O slug-base e a letra serao extraidos automaticamente.")
        ref_url = prompt_nonempty("URL de referencia anivideo: ")
        m_av = ANIVIDEO_STREAM_RE.search(ref_url)
        if m_av:
            av_letter, av_base_slug = extract_av_base_slug(m_av.group(1))
            print(f"   [AV] Letra   : '{av_letter}'")
            print(f"   [AV] Slug-base: '{av_base_slug}'")
            print(f"   [AV] Exemplo T1 sub  : {build_anivideo_stream_path(av_letter, av_base_slug, 1, False)}")
            print(f"   [AV] Exemplo T1 dub  : {build_anivideo_stream_path(av_letter, av_base_slug, 1, True)}")
            print(f"   [AV] Exemplo T2 sub  : {build_anivideo_stream_path(av_letter, av_base_slug, 2, False)}")
            print(f"   [AV] Exemplo T2 dub  : {build_anivideo_stream_path(av_letter, av_base_slug, 2, True)}")
        else:
            print("[AV] AVISO: nao foi possivel extrair stream_path. Desativando anivideo.")
            is_anivideo_site = False
    # ─────────────────────────────────────────────────────────────────────────

    try:
        total_seasons = int(prompt_nonempty("Quantas temporadas?: "))
    except ValueError: return

    seasons_input = []
    for s in range(1, total_seasons + 1):
        print(f"\n--- Configurando Temporada {s} ---")
        try:
            total_eps = int(prompt_nonempty(f"Total de episodios da Temporada {s}: "))
        except ValueError: return

        has_dub = normalize_yesno(input(f"Tem Dublado? (s/n): "))
        has_leg = normalize_yesno(input(f"Tem Legendado? (s/n): "))

        url_dub_base = None
        url_sub_base = None
        if not is_safe_mode and not is_anivideo_site:
            # Sites normais: pede URL do ep 1 de cada temporada
            url_dub_base = prompt_nonempty(f"Link do Ep 1 Dublado: ") if has_dub else None
            url_sub_base = prompt_nonempty(f"Link do Ep 1 Legendado: ") if has_leg else None

        seasons_input.append({
            "season_num": s,
            "total_eps": total_eps,
            "has_dub": has_dub,
            "has_leg": has_leg,
            "url_dub": url_dub_base,
            "url_sub": url_sub_base
        })

    mal_data = fetch_mal_info(anime_name)
    if mal_data:
        title_romaji = mal_data.get('title', anime_name)
        title_japanese = mal_data.get('title_japanese', anime_name)
        genres = [g['name'] for g in mal_data.get('genres', [])]
        studios = [s['name'] for s in mal_data.get('studios', [])]
        studio_name = studios[0] if studios else "Desconhecido"
        mal_id = mal_data.get('mal_id', 0)
        cover_image = mal_data.get('images', {}).get('jpg', {}).get('large_image_url', '')
        score = mal_data.get('score', 0.0)
        synopsis = mal_data.get('synopsis', 'Sem sinopse disponível.')
        trailer_url = mal_data.get('trailer', {}).get('url', '')
        base_year = mal_data.get('year', 2024)
        status_api = "finished" if mal_data.get('status') == "Finished Airing" else "ongoing"
    else:
        title_romaji = title_japanese = anime_name
        genres = ["Ação"]; studio_name = "Desconhecido"; mal_id = 0
        cover_image = ""; score = 0.0; synopsis = ""; trailer_url = ""; base_year = 2024; status_api = "finished"

    all_seasons_data = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()

        # ── NOVO: busca o banner na Crunchyroll ──────────────────────────────
        banner_image = fetch_crunchyroll_banner(anime_name, context)
        if not banner_image:
            print("[CR] Banner não encontrado, usando coverImage como fallback.")
            banner_image = cover_image  # fallback para a capa do MAL
        # ─────────────────────────────────────────────────────────────────────

        for s_data in seasons_input:
            s_num = s_data["season_num"]
            total_eps = s_data["total_eps"]
            
            dub_info = build_base_info_from_url(s_data["url_dub"]) if s_data["url_dub"] else None
            sub_info = build_base_info_from_url(s_data["url_sub"]) if s_data["url_sub"] else None
            
            dub_episode_list = []
            sub_episode_list = []
            if not is_safe_mode:
                if dub_info and dub_info.get("is_animesdigital"):
                    dub_episode_list = extract_episode_links_from_animesdigital(context, s_data["url_dub"])
                    if dub_episode_list:
                        print(f"   [OK] Encontrados {len(dub_episode_list)} episódios (DUB) em animesdigital.")
                if sub_info and sub_info.get("is_animesdigital"):
                    sub_episode_list = extract_episode_links_from_animesdigital(context, s_data["url_sub"])
                    if sub_episode_list:
                        print(f"   [OK] Encontrados {len(sub_episode_list)} episódios (SUB) em animesdigital.")

            episodes_list = []

            for i in range(1, total_eps + 1):
                print(f"\n--- Preparando Episódio {i}/{total_eps} (T{s_num}) ---")
                
                if is_safe_mode:
                    current_url_dub = prompt_nonempty(f"Link DUB Ep {i}: ") if s_data["has_dub"] else None
                    current_url_sub = prompt_nonempty(f"Link LEG Ep {i}: ") if s_data["has_leg"] else None
                    is_ao_dub = "animesonline" in (current_url_dub or "")
                    is_ao_sub = "animesonline" in (current_url_sub or "")
                    is_ad_dub = "animesdigital" in (current_url_dub or "")
                    is_ad_sub = "animesdigital" in (current_url_sub or "")
                    is_ao_cc_dub = "animesonlinecc" in (current_url_dub or "")
                    is_ao_cc_sub = "animesonlinecc" in (current_url_sub or "")
                    is_av_dub    = "anivideo.net" in (current_url_dub or "") or "mywallpaper-4k-image.net" in (current_url_dub or "")
                    is_av_sub    = "anivideo.net" in (current_url_sub or "") or "mywallpaper-4k-image.net" in (current_url_sub or "")
                else:
                    # ── AniVideo: monta URL pelo slug-base + temporada + audio ───────
                    if is_anivideo_site and av_letter and av_base_slug:
                        if s_data["has_dub"]:
                            sp_dub = build_anivideo_stream_path(av_letter, av_base_slug, s_num, is_dub=True)
                            current_url_dub = build_anivideo_ep_url(sp_dub, i)
                        else:
                            current_url_dub = None
                        if s_data["has_leg"]:
                            sp_sub = build_anivideo_stream_path(av_letter, av_base_slug, s_num, is_dub=False)
                            current_url_sub = build_anivideo_ep_url(sp_sub, i)
                        else:
                            current_url_sub = None
                    # ── Outros sites: usa dub_info/sub_info como antes ───────────────
                    elif dub_info and dub_info.get("is_animesdigital") and dub_episode_list:
                        current_url_dub = dub_episode_list[i-1] if i-1 < len(dub_episode_list) else None
                    else:
                        current_url_dub = (f'{dub_info["base_site"]}{dub_info["start_id"] + i - 1}/' if dub_info and dub_info.get("is_animesonline") else (f'{dub_info["base_fire"]}/{i}' if dub_info else None))

                    if not is_anivideo_site:
                        if sub_info and sub_info.get("is_animesdigital") and sub_episode_list:
                            current_url_sub = sub_episode_list[i-1] if i-1 < len(sub_episode_list) else None
                        else:
                            current_url_sub = (f'{sub_info["base_site"]}{sub_info["start_id"] + i - 1}/' if sub_info and sub_info.get("is_animesonline") else (f'{sub_info["base_fire"]}/{i}' if sub_info else None))
                    # ─────────────────────────────────────────────────────────────────

                    is_ao_dub    = (dub_info["is_animesonline"]   if dub_info else False) if not is_anivideo_site else False
                    is_ao_sub    = (sub_info["is_animesonline"]   if sub_info else False) if not is_anivideo_site else False
                    is_ad_dub    = (dub_info["is_animesdigital"]  if dub_info else False) if not is_anivideo_site else False
                    is_ad_sub    = (sub_info["is_animesdigital"]  if sub_info else False) if not is_anivideo_site else False
                    is_ao_cc_dub = (dub_info["is_animesonlinecc"] if dub_info else False) if not is_anivideo_site else False
                    is_ao_cc_sub = (sub_info["is_animesonlinecc"] if sub_info else False) if not is_anivideo_site else False
                    is_av_dub    = is_anivideo_site and s_data["has_dub"]
                    is_av_sub    = is_anivideo_site and s_data["has_leg"]

                d_link = extract_for_episode(context, current_url_dub, desired_audio="dub", is_animes_online=is_ao_dub, is_animesdigital=is_ad_dub, is_animesonlinecc=is_ao_cc_dub, is_anivideo=is_av_dub) if current_url_dub else None
                s_link = extract_for_episode(context, current_url_sub, desired_audio="sub", is_animes_online=is_ao_sub, is_animesdigital=is_ad_sub, is_animesonlinecc=is_ao_cc_sub, is_anivideo=is_av_sub) if current_url_sub else None

                embeds = {}
                embed_credit = "animesonlinecc.to"
                if s_link:
                    embeds["sub"] = make_iframe_html(s_link)
                    try: embed_credit = urlparse(s_link).hostname or embed_credit
                    except: pass
                if d_link:
                    embeds["dub"] = make_iframe_html(d_link)
                    try: embed_credit = urlparse(d_link).hostname or embed_credit
                    except: pass

                episodes_list.append({
                    "id": f"{id_prefix}-s{s_num}-ep{i}",
                    "number": i,
                    "title": f"{title_romaji} - T{s_num} Episódio {i}",
                    "season": str(s_num),
                    "embeds": embeds,
                    "embedCredit": embed_credit.replace("www.", "") if embed_credit else ""
                })

            all_seasons_data.append({
                "season": s_num,
                "seasonLabel": f"{s_num}ª Temporada",
                "year": base_year,
                "episodes": total_eps,
                "currentEpisode": total_eps,
                "status": status_api if s_num == total_seasons else "finished",
                "score": score,
                "synopsis": synopsis,
                "trailer": trailer_url,
                "audios": [
                    {"type": "sub", "label": "Legendado", "available": s_data["has_leg"], "episodesAvailable": total_eps},
                    {"type": "dub", "label": "Dublado", "available": s_data["has_dub"], "episodesAvailable": total_eps}
                ],
                "episodeList": episodes_list
            })

        browser.close()

    final_json = {
        "id": id_prefix,
        "title": title_romaji,
        "titleRomaji": title_romaji,
        "titleJapanese": title_japanese,
        "genre": genres,
        "studio": studio_name,
        "recommended": True,
        "malId": mal_id,
        "coverImage": cover_image,
        # ── bannerImage agora vem da Crunchyroll ──
        "bannerImage": banner_image,
        "seasons": all_seasons_data
    }

    with open(f"{id_prefix}_completo.json", "w", encoding="utf-8") as f:
        json.dump(final_json, f, ensure_ascii=False, indent=2)
    print(f"\n[Sucesso] Arquivo {id_prefix}_completo.json gerado!")

if __name__ == "__main__":
    main()