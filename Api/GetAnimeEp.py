#!/usr/bin/env python3
import re
import time
import json
from urllib.parse import urljoin, urlparse
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

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
            print(f"   [!] Erro {response.status} ao carregar página.")
            return None

        if is_animes_online:
            return extract_anidrive_iframe(page)

        found_network = []
        page.on("response", lambda res: found_network.append(res.url) if VIDEO_EXT_RE.search(res.url) else None)
        try:
            page.wait_for_load_state("networkidle", timeout=6000)
        except: pass
        return found_network[0] if found_network else None
    except Exception as e:
        print(f"   [!] Erro na extração: {e}")
        return None
    finally:
        page.close()

def main():
    print("--- Extrator de Episódios Pro ---")
    
    # --- Novos Inputs Solicitados ---
    anime_name = input("Nome do Anime (para o título): ").strip()
    id_prefix = input("Prefixo do ID (ex: naruto-classico): ").strip()
    url_input = input("URL do 1º Episódio: ").strip()
    
    try:
        total_eps = int(input("Total de episódios a extrair: ").strip())
    except ValueError:
        print("Quantidade inválida.")
        return

    domain = urlparse(url_input).netloc.lower()
    is_ao = "animesonline" in domain
    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()

        if is_ao:
            match = ID_RE.search(url_input)
            if not match:
                print("[-] ID numérico não encontrado na URL do AnimesOnline.")
                browser.close()
                return
            
            start_id = int(match.group(1))
            base_site = url_input.split(str(start_id))[0]
            
            print(f"\n[+] AnimesOnline detectado. Iniciando do ID {start_id}...")
            for i in range(total_eps):
                current_id = start_id + i
                ep_url = f"{base_site}{current_id}/"
                print(f"[{i+1}/{total_eps}] Extraindo: {ep_url}")
                
                link = extract_for_episode(context, ep_url, is_animes_online=True)
                results.append((i+1, link))
                time.sleep(0.5)
        
        else:
            print(f"\n[+] Modo Sequencial detectado...")
            base_fire = re.sub(r'/\d+/?$', '', url_input)
            
            for i in range(1, total_eps + 1):
                ep_url = f"{base_fire}/{i}"
                print(f"[{i}/{total_eps}] Extraindo: {ep_url}")
                
                link = extract_for_episode(context, ep_url, is_animes_online=False)
                results.append((i, link))
                time.sleep(0.5)

        browser.close()

    # --- Geração do JSON com a nova formatação ---
    episodes = []
    for num, link in results:
        episodes.append({
            "id": f"{id_prefix}-{num}",
            "number": num,
            "title": f"{anime_name} - Episódio {num}",
            "embedUrl": f'<iframe width="100%" height="100%" src="{link}" frameborder="0" allowfullscreen></iframe>' if link else "",
            "embedCredit": urlparse(link).hostname if link else ""
        })

    filename = f"{id_prefix}.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump({"episodes": episodes}, f, ensure_ascii=False, indent=2)
    
    print(f"\n[Sucesso] Salvo em: {filename}")

if __name__ == "__main__":
    main()