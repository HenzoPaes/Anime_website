#!/usr/bin/env python3
import re
import time
import json
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

# Regex para detectar links de vídeo e IDs numéricos
VIDEO_EXT_RE = re.compile(r'\.(mp4|m3u8|mpd|mkv)(?:\?.*)?$', re.IGNORECASE)
ID_RE = re.compile(r'/(\d+)/?$')

def extract_anidrive_iframe(page):
    """Extrai o src do iframe dentro da div #pembed (AnimesOnline)"""
    try:
        page.wait_for_selector("#pembed iframe", timeout=8000)
        return page.locator("#pembed iframe").get_attribute("src")
    except:
        return None

def extract_for_episode(context, ep_url, is_animes_online=False):
    """Acessa a página do episódio e captura o link do vídeo ou iframe"""
    page = context.new_page()
    try:
        page.set_extra_http_headers({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
        response = page.goto(ep_url, wait_until="domcontentloaded", timeout=30000)
        if response and response.status >= 400:
            print(f"   [!] Erro {response.status} ao carregar página: {ep_url}")
            return None

        if is_animes_online:
            # tenta extrair iframe do anidrive
            src = extract_anidrive_iframe(page)
            if src:
                return src
            # fallback: tenta capturar requests de vídeo
        found_network = []
        page.on("response", lambda res: found_network.append(res.url) if VIDEO_EXT_RE.search(res.url) else None)
        try:
            page.wait_for_load_state("networkidle", timeout=6000)
        except:
            pass
        # Retorna primeiro recurso de vídeo/stream encontrado (se houver)
        return found_network[0] if found_network else None
    except Exception as e:
        print(f"   [!] Erro na extração ({ep_url}): {e}")
        return None
    finally:
        try:
            page.close()
        except:
            pass

def normalize_yesno(raw: str):
    v = (raw or "").strip().lower()
    return v in ("s", "sim", "y", "yes", "true", "1")

def normalize_audio_choice(choice_raw: str):
    c = (choice_raw or "").strip().lower()
    if c in ("d", "dub", "dublado", "dubbed", "yes", "y", "s", "sim"):
        return "dub"
    if c in ("l", "leg", "legenda", "legendado", "sub", "subbed", "n", "no"):
        return "sub"
    # default
    return "sub"

def build_base_info_from_url(url):
    domain = urlparse(url).netloc.lower()
    is_ao = "animesonline" in domain
    match = ID_RE.search(url) if is_ao else None
    start_id = int(match.group(1)) if match else None
    base_site = url.split(str(start_id))[0] if (is_ao and start_id is not None) else None
    if not is_ao:
        base_fire = re.sub(r'/\d+/?$', '', url)
    else:
        base_fire = None
    return {
        "is_animesonline": is_ao,
        "start_id": start_id,
        "base_site": base_site,
        "base_fire": base_fire
    }

def make_iframe_html(src):
    if not src:
        return ""
    return f'<iframe width="100%" height="100%" src="{src}" frameborder="0" allowfullscreen></iframe>'

def safe_hostname(src):
    try:
        return urlparse(src).hostname or ""
    except:
        return ""

def prompt_nonempty(prompt_text):
    v = ""
    while not v.strip():
        v = input(prompt_text).strip()
    return v

def main():
    print("--- Extrator de Episódios Pro (saida com `embeds` dub/sub) ---")

    anime_name = prompt_nonempty("Nome do Anime (para o título): ")
    id_prefix = prompt_nonempty("Prefixo do ID (ex: naruto-classico): ")
    NumSea = prompt_nonempty("Número da temporada: ")

    # Agora perguntamos separadamente se tem dub e se tem leg
    has_dub = normalize_yesno(input("o anime tem dub? (s/n): ").strip())
    has_leg = normalize_yesno(input("o anime tem leg? (s/n): ").strip())

    url_dub_ep1 = None
    url_sub_ep1 = None

    if has_dub:
        url_dub_ep1 = prompt_nonempty("Link do Ep 1 Dublado: ")

    if has_leg:
        url_sub_ep1 = prompt_nonempty("Link do Ep 1 Legendado: ")

    if not has_dub and not has_leg:
        print("[-] Você respondeu que o anime não tem dub nem leg. Nada a extrair. Abortando.")
        return

    try:
        total_eps = int(input("Total de episódios a extrair: ").strip())
    except ValueError:
        print("Quantidade inválida.")
        return

    # montar infos de base para cada track
    dub_info = build_base_info_from_url(url_dub_ep1) if url_dub_ep1 else None
    sub_info = build_base_info_from_url(url_sub_ep1) if url_sub_ep1 else None

    results = []  # list of tuples: (num, dub_link_or_None, sub_link_or_None)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()

        try:
            # Se ambos e ambos são AnimesOnline, garantimos start ids separados
            # Caso um seja AnimesOnline e outro não, lidamos separadamente.
            if has_dub and has_leg:
                dub_start = dub_info["start_id"] if dub_info and dub_info["is_animesonline"] else None
                sub_start = sub_info["start_id"] if sub_info and sub_info["is_animesonline"] else None

                for i in range(total_eps):
                    dub_link = None
                    sub_link = None

                    if dub_info:
                        if dub_info["is_animesonline"]:
                            if dub_start is None:
                                print("[-] Não foi possível determinar start id DUB; pulando DUB para este ep.")
                            else:
                                current_id = dub_start + i
                                ep_url = f'{dub_info["base_site"]}{current_id}/'
                                print(f"[DUB {i+1}/{total_eps}] Extraindo: {ep_url}")
                                dub_link = extract_for_episode(context, ep_url, is_animes_online=True)
                        else:
                            ep_url = f'{dub_info["base_fire"]}/{i+1}'
                            print(f"[DUB {i+1}/{total_eps}] Extraindo: {ep_url}")
                            dub_link = extract_for_episode(context, ep_url, is_animes_online=False)

                    if sub_info:
                        if sub_info["is_animesonline"]:
                            if sub_start is None:
                                print("[-] Não foi possível determinar start id SUB; pulando SUB para este ep.")
                            else:
                                current_id = sub_start + i
                                ep_url = f'{sub_info["base_site"]}{current_id}/'
                                print(f"[SUB {i+1}/{total_eps}] Extraindo: {ep_url}")
                                sub_link = extract_for_episode(context, ep_url, is_animes_online=True)
                        else:
                            ep_url = f'{sub_info["base_fire"]}/{i+1}'
                            print(f"[SUB {i+1}/{total_eps}] Extraindo: {ep_url}")
                            sub_link = extract_for_episode(context, ep_url, is_animes_online=False)

                    results.append((i+1, dub_link, sub_link))
                    time.sleep(0.5)

            else:
                # Apenas uma track (dub OU sub)
                if has_dub:
                    info = dub_info
                    audio_key = "dub"
                else:
                    info = sub_info
                    audio_key = "sub"

                if info["is_animesonline"]:
                    start_id = info["start_id"]
                    if start_id is None:
                        print("[-] ID numérico não encontrado na URL inicial (AnimesOnline). Abortando.")
                        browser.close()
                        return
                    base_site = info["base_site"]
                    for i in range(total_eps):
                        current_id = start_id + i
                        ep_url = f"{base_site}{current_id}/"
                        print(f"[{i+1}/{total_eps}] Extraindo: {ep_url}")
                        link = extract_for_episode(context, ep_url, is_animes_online=True)
                        if audio_key == "dub":
                            results.append((i+1, link, None))
                        else:
                            results.append((i+1, None, link))
                        time.sleep(0.5)
                else:
                    base_fire = info["base_fire"]
                    for i in range(1, total_eps + 1):
                        ep_url = f"{base_fire}/{i}"
                        print(f"[{i}/{total_eps}] Extraindo: {ep_url}")
                        link = extract_for_episode(context, ep_url, is_animes_online=False)
                        if audio_key == "dub":
                            results.append((i, link, None))
                        else:
                            results.append((i, None, link))
                        time.sleep(0.5)
        finally:
            browser.close()

    # --- Geração do JSON com a nova formatação (embeds) ---
    episodes = []
    for num, dub_link, sub_link in results:
        embeds = {}
        embed_credit = ""
        if dub_link:
            src = dub_link
            iframe_html = make_iframe_html(src)
            embeds["dub"] = iframe_html
            embed_credit = safe_hostname(src) or embed_credit
        if sub_link:
            src = sub_link
            iframe_html = make_iframe_html(src)
            embeds["sub"] = iframe_html
            embed_credit = safe_hostname(src) or embed_credit

        episode_obj = {
            "id": f"{id_prefix}-{num}",
            "number": num,
            "title": f"{anime_name} - Episódio {num}",
            "season": NumSea,
            "embeds": embeds
        }
        if embed_credit:
            episode_obj["embedCredit"] = embed_credit
        episodes.append(episode_obj)

    # top-level audio flag
    if has_dub and has_leg:
        top_level_audio = "BOTH"
    elif has_dub:
        top_level_audio = "DUB"
    else:
        top_level_audio = "LEG"

    filename = f"{id_prefix}.json"
    out_obj = {
        "audio": top_level_audio,
        "episodeList": episodes
    }
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(out_obj, f, ensure_ascii=False, indent=2)

    print(f"\n[Sucesso] Salvo em: {filename}")
    print(f"Formato: top-level 'audio': {top_level_audio}. Cada episódio possui 'embeds' com as keys presentes (dub/sub).")

if __name__ == "__main__":
    main()