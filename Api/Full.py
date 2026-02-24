#!/usr/bin/env python3
import re
import time
import json
import requests
from urllib.parse import urlparse
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

def extract_for_episode(context, ep_url, is_animes_online=False):
    if not ep_url: return None
    page = context.new_page()
    try:
        page.set_extra_http_headers({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
        response = page.goto(ep_url, wait_until="domcontentloaded", timeout=30000)
        if response and response.status >= 400:
            print(f"   [!] Erro {response.status} ao carregar página: {ep_url}")
            return None

        if is_animes_online:
            src = extract_anidrive_iframe(page)
            if src: return src
            
        found_network = []
        page.on("response", lambda res: found_network.append(res.url) if VIDEO_EXT_RE.search(res.url) else None)
        try:
            page.wait_for_load_state("networkidle", timeout=6000)
        except:
            pass
        return found_network[0] if found_network else None
    except Exception as e:
        print(f"   [!] Erro na extração ({ep_url}): {e}")
        return None
    finally:
        try: page.close()
        except: pass

def build_base_info_from_url(url):
    if not url: return None
    domain = urlparse(url).netloc.lower()
    is_ao = "animesonline" in domain
    match = ID_RE.search(url) if is_ao else None
    start_id = int(match.group(1)) if match else None
    base_site = url.split(str(start_id))[0] if (is_ao and start_id is not None) else None
    base_fire = re.sub(r'/\d+/?$', '', url) if not is_ao else None
    return {
        "is_animesonline": is_ao,
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
    
    # Pergunta sobre o Modo Seguro
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

        # No modo seguro, não pedimos o link aqui, pediremos dentro do loop de extração
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
    # ... (Extração de metadados do MAL permanece a mesma do seu código)
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
            
            # Se não for modo seguro, calcula as bases
            dub_info = build_base_info_from_url(s_data["url_dub"]) if s_data["url_dub"] else None
            sub_info = build_base_info_from_url(s_data["url_sub"]) if s_data["url_sub"] else None
            
            episodes_list = []

            for i in range(1, total_eps + 1):
                print(f"\n--- Preparando Episódio {i}/{total_eps} (T{s_num}) ---")
                
                # Definição das URLs
                if is_safe_mode:
                    current_url_dub = prompt_nonempty(f"Link DUB Ep {i}: ") if s_data["has_dub"] else None
                    current_url_sub = prompt_nonempty(f"Link LEG Ep {i}: ") if s_data["has_leg"] else None
                    # Para modo seguro, assumimos AnimesOnline se o link contiver o nome
                    is_ao_dub = "animesonline" in (current_url_dub or "")
                    is_ao_sub = "animesonline" in (current_url_sub or "")
                else:
                    current_url_dub = f'{dub_info["base_site"]}{dub_info["start_id"] + i - 1}/' if dub_info and dub_info["is_animesonline"] else (f'{dub_info["base_fire"]}/{i}' if dub_info else None)
                    current_url_sub = f'{sub_info["base_site"]}{sub_info["start_id"] + i - 1}/' if sub_info and sub_info["is_animesonline"] else (f'{sub_info["base_fire"]}/{i}' if sub_info else None)
                    is_ao_dub = dub_info["is_animesonline"] if dub_info else False
                    is_ao_sub = sub_info["is_animesonline"] if sub_info else False

                # Extração Real
                d_link = extract_for_episode(context, current_url_dub, is_ao_dub) if current_url_dub else None
                s_link = extract_for_episode(context, current_url_sub, is_ao_sub) if current_url_sub else None

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

            # Adiciona temporada ao array
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

    # Salvamento
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