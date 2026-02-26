#!/usr/bin/env python3
import re
import time
import json
import requests
from urllib.parse import urlparse, urljoin
from playwright.sync_api import sync_playwright

# Regex para detectar links de vídeo e IDs numéricos
VIDEO_EXT_RE = re.compile(r'\.(mp4|m3u8|mpd|mkv)(?:\?.*)?$', re.IGNORECASE)
ID_RE = re.compile(r'/(\d+)/?$')

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
    Se anime_name for fornecido, confere se o title do <a> contém esse nome (ajuda a diferenciar itens semelhantes).
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
        # fallback: procurar qualquer <a> com span 'Proximo episodio' (sem div.item)
        anchors = page.locator("a:has-text('Proximo episodio')")
        if anchors.count() > 0:
            href = anchors.first.get_attribute("href")
            return urljoin(page.url, href) if href else None
    except:
        pass
    return None
# --- FIM: animesonlinecc extras ---

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

def extract_for_episode(context, ep_url, desired_audio=None, is_animes_online=False, is_animesdigital=False, is_animesonlinecc=False):
    """
    desired_audio: 'dub' ou 'sub' quando aplicável (para sites com múltiplas opções).
    Handle cases:
      - is_animes_online: antigo animesonline (usa pembed)
      - is_animesdigital: animesdigital
      - is_animesonlinecc: novo site animesonlinecc.to (usa option-1/option-2)
      - fallback: escuta requests e procura mp4/m3u8 etc.
    """
    if not ep_url: return None
    page = context.new_page()
    try:
        page.set_extra_http_headers({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
        response = page.goto(ep_url, wait_until="domcontentloaded", timeout=30000)
        if response and response.status >= 400:
            print(f"   [!] Erro {response.status} ao carregar página: {ep_url}")
            return None

        # animesonline antigo (pembed)
        if is_animes_online:
            src = extract_anidrive_iframe(page)
            if src:
                return src

        # animesonlinecc específico
        if is_animesonlinecc:
            # pega os dois iframes possívels e decide qual retornar conforme desired_audio
            mapping = extract_animesonlinecc_iframes(page)
            if mapping:
                if desired_audio == "dub":
                    return mapping.get("dub") or mapping.get("sub")
                if desired_audio == "sub":
                    return mapping.get("sub") or mapping.get("dub")
                # se não especificado, retorna sub primeiro (mais comum)
                return mapping.get("sub") or mapping.get("dub")

            # se não encontrou, tenta pegar o próximo ep link (caso precise)
            next_ep = extract_next_episode_from_animesonline(page)
            if next_ep:
                # tentativa rápida: abrir next ep e extrair iframe
                try:
                    page.wait_for_timeout(500)
                    # seguimos para next_ep e tentamos extrair lá
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

        # animesdigital (player padrão)
        if is_animesdigital:
            src = extract_animesdigital_iframe(page)
            if src:
                return src

        # default: escutar requisições por mp4/m3u8 etc.
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

        # tenta clicar em possíveis botões play
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

        # fallback: procura iframes com m3u8/mp4 no src
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
    """
    Detecta se o URL é do animesonline, animesdigital ou animesonlinecc e devolve metadados úteis.
    """
    if not url: return None
    domain = urlparse(url).netloc.lower()
    is_ao = "animesonline" in domain  # cobre animesonlinecc.to também
    is_ad = "animesdigital" in domain
    is_ao_cc = "animesonlinecc" in domain or "animesonlinecc.to" in domain
    match = ID_RE.search(url)
    start_id = int(match.group(1)) if match else None
    base_site = None
    base_fire = None
    if is_ao and start_id is not None:
        base_site = url.split(str(start_id))[0]
    if not is_ao and not is_ad:
        base_fire = re.sub(r'/\d+/?$', '', url)
    return {
        "is_animesonline": is_ao,
        "is_animesdigital": is_ad,
        "is_animesonlinecc": is_ao_cc,
        "start_id": start_id,
        "base_site": base_site,
        "base_fire": base_fire
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

    try:
        total_seasons = int(prompt_nonempty("Quantas temporadas?: "))
    except ValueError: return

    seasons_input = []
    for s in range(1, total_seasons + 1):
        print(f"\n--- Configurando Temporada {s} ---")
        try:
            total_eps = int(prompt_nonempty(f"Total de episódios da Temporada {s}: "))
        except ValueError: return

        has_dub = normalize_yesno(input(f"Tem Dublado? (s/n): "))
        has_leg = normalize_yesno(input(f"Tem Legendado? (s/n): "))

        url_dub_base = None
        url_sub_base = None
        if not is_safe_mode:
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

        for s_data in seasons_input:
            s_num = s_data["season_num"]
            total_eps = s_data["total_eps"]
            
            dub_info = build_base_info_from_url(s_data["url_dub"]) if s_data["url_dub"] else None
            sub_info = build_base_info_from_url(s_data["url_sub"]) if s_data["url_sub"] else None
            
            # animesdigital lists
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
                else:
                    if dub_info and dub_info.get("is_animesdigital") and dub_episode_list:
                        current_url_dub = dub_episode_list[i-1] if i-1 < len(dub_episode_list) else None
                    else:
                        current_url_dub = (f'{dub_info["base_site"]}{dub_info["start_id"] + i - 1}/' if dub_info and dub_info.get("is_animesonline") else (f'{dub_info["base_fire"]}/{i}' if dub_info else None))
                    if sub_info and sub_info.get("is_animesdigital") and sub_episode_list:
                        current_url_sub = sub_episode_list[i-1] if i-1 < len(sub_episode_list) else None
                    else:
                        current_url_sub = (f'{sub_info["base_site"]}{sub_info["start_id"] + i - 1}/' if sub_info and sub_info.get("is_animesonline") else (f'{sub_info["base_fire"]}/{i}' if sub_info else None))

                    is_ao_dub = dub_info["is_animesonline"] if dub_info else False
                    is_ao_sub = sub_info["is_animesonline"] if sub_info else False
                    is_ad_dub = dub_info["is_animesdigital"] if dub_info else False
                    is_ad_sub = sub_info["is_animesdigital"] if sub_info else False
                    is_ao_cc_dub = dub_info["is_animesonlinecc"] if dub_info else False
                    is_ao_cc_sub = sub_info["is_animesonlinecc"] if sub_info else False

                # Extração Real (note: pass desired_audio)
                d_link = extract_for_episode(context, current_url_dub, desired_audio="dub", is_animes_online=is_ao_dub, is_animesdigital=is_ad_dub, is_animesonlinecc=is_ao_cc_dub) if current_url_dub else None
                s_link = extract_for_episode(context, current_url_sub, desired_audio="sub", is_animes_online=is_ao_sub, is_animesdigital=is_ad_sub, is_animesonlinecc=is_ao_cc_sub) if current_url_sub else None

                # Montagem do Embed
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
        "id": id_prefix, "title": title_romaji, "titleRomaji": title_romaji,
        "titleJapanese": title_japanese, "genre": genres, "studio": studio_name,
        "recommended": True, "malId": mal_id, "coverImage": cover_image, "bannerImage": cover_image,
        "seasons": all_seasons_data
    }

    with open(f"{id_prefix}_completo.json", "w", encoding="utf-8") as f:
        json.dump(final_json, f, ensure_ascii=False, indent=2)
    print(f"\n[Sucesso] Arquivo {id_prefix}_completo.json gerado!")

if __name__ == "__main__":
    main()