#!/usr/bin/env python3
# anime_info_menu.py
"""
Extrai dados básicos de uma página de anime do animefire.io (image, audio, episodes, status, year)
a partir da URL de listagem (aceita também ...-todos-os-episodios).
Menu interativo para escolher qual dado ver/salvar.
"""

import re
import sys
import json
from urllib.parse import urlparse, urljoin
from datetime import datetime
import requests
from bs4 import BeautifulSoup
from dateutil import parser as dateparser

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36"
}

VIDEO_IMG_PATTERN = re.compile(r'/img/animes/[^"\']+', re.IGNORECASE)
EPS_PATTERN = re.compile(r'(\d{1,4})\s*(?:eps|episod|episódios|episodes?)', re.IGNORECASE)
STATUS_KEYWORDS = ['completo', 'em andamento', 'pausado', 'cancelado', 'completo', 'ongoing', 'finished']
AUDIO_KEYWORDS = ['legendado', 'dublado', 'dual', 'dub', 'sub', 'legend']

DATE_RE = re.compile(r'([A-Za-z]{3,}\s+\d{1,2},\s*\d{4})')  # e.g. Jul 8, 2022

def normalize_base_url(input_url: str) -> str:
    u = input_url.strip().rstrip('/')
    if u.endswith('-todos-os-episodios'):
        u = u[: -len('-todos-os-episodios')]
    # If user pasted the direct page with /animes/.../1, try strip trailing '/<num>'
    parts = u.split('/')
    if parts[-1].isdigit():
        u = '/'.join(parts[:-1])
    return u

def fetch_html(url: str, timeout=15):
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout)
        r.raise_for_status()
        return r.text, r.url
    except Exception as e:
        print(f"[erro] falha ao buscar {url}: {e}")
        return None, url

def find_meta_image(soup: BeautifulSoup):
    # og:image
    tag = soup.find('meta', property='og:image') or soup.find('meta', attrs={'name':'og:image'})
    if tag and tag.get('content'):
        return tag['content']
    # link rel image_src
    tag = soup.find('link', rel='image_src')
    if tag and tag.get('href'):
        return tag['href']
    # search for image paths like /img/animes/... (heurística)
    html = str(soup)
    m = VIDEO_IMG_PATTERN.search(html)
    if m:
        return m.group(0)
    return None

def parse_json_ld(soup: BeautifulSoup):
    # tenta JSON-LD (script type application/ld+json)
    data = {}
    for s in soup.find_all('script', type='application/ld+json'):
        try:
            j = json.loads(s.string or "")
            # procurar por image/datePublished/name etc
            if isinstance(j, dict):
                if 'image' in j and not data.get('image'):
                    data['image'] = j['image']
                if 'datePublished' in j and not data.get('date'):
                    data['date'] = j['datePublished']
                if 'name' in j and not data.get('name'):
                    data['name'] = j['name']
        except Exception:
            continue
    return data

def find_audio(soup_text: str):
    # heurística simples: procura palavras legendado/dublado/dual/sub/dub próximas
    txt = soup_text.lower()
    for k in AUDIO_KEYWORDS:
        if k in txt:
            # capture short context
            m = re.search(r'([A-ZÀ-Üa-zà-ü\s]{0,40}\b(?:legendado|dublado|dual|sub|dub)\b[^\n]{0,40})', soup_text, re.IGNORECASE)
            val = m.group(0).strip() if m else k
            # normalize
            if 'legend' in val.lower() or 'sub' in val.lower():
                return "Legendado"
            if 'dub' in val.lower() or 'dublado' in val.lower():
                return "Dublado"
            if 'dual' in val.lower():
                return "Dual-Audio"
            return val
    return None

def find_status(soup_text: str):
    txt = soup_text.lower()
    for k in STATUS_KEYWORDS:
        if k in txt:
            # map common forms to PT
            if 'completo' in k or 'finished' in k:
                return "Completo"
            if 'em andamento' in k or 'ongoing' in k:
                return "Em andamento"
            if 'pausad' in k:
                return "Pausado"
            if 'cancelad' in k:
                return "Cancelado"
            return k.capitalize()
    return None

def find_episodes(soup_text: str):
    # tentar encontrar "12/12 eps" ou "13 eps" ou "13 episódios"
    # primeiras procura por padrão \d+/\d+ eps
    m = re.search(r'(\d{1,4})\s*/\s*(\d{1,4})\s*(?:eps|episódios|episodios|episodes?)', soup_text, re.IGNORECASE)
    if m:
        # prefer total (right side) if available
        return int(m.group(2))
    m2 = EPS_PATTERN.search(soup_text)
    if m2:
        return int(m2.group(1))
    return None

def find_date(soup_text: str):
    # tentar JSON-LD data
    m = DATE_RE.search(soup_text)
    if m:
        return m.group(1)
    # procurar por anos isolados (ex: 2022) e contexto de mês
    m2 = re.search(r'([A-Za-z]{3,}\s+\d{1,2},\s*\d{4})', soup_text)
    if m2:
        return m2.group(1)
    # fallback: procurar ano
    m3 = re.search(r'\b(19|20)\d{2}\b', soup_text)
    if m3:
        # só o ano
        return m3.group(0)
    return None

def resolve_url(base_url, candidate):
    if not candidate:
        return None
    if candidate.startswith('http://') or candidate.startswith('https://'):
        return candidate
    return urljoin(base_url, candidate)

def extract_all(base_url):
    html, final = fetch_html(base_url)
    if not html:
        return None
    soup = BeautifulSoup(html, 'html.parser')
    text = soup.get_text(separator=' ', strip=True)

    data = {}
    # JSON-LD hints
    jld = parse_json_ld(soup)
    if jld.get('image'):
        data['image'] = jld['image'] if isinstance(jld['image'], str) else (jld['image'][0] if jld['image'] else None)
    # 1) image
    img = find_meta_image(soup)
    data['image'] = resolve_url(final, img) if img else data.get('image')

    # 2) audio
    audio = find_audio(html) or find_audio(text)
    data['audio'] = audio

    # 3) episodes
    eps = find_episodes(text)
    data['episodes'] = eps

    # 4) status
    status = find_status(text)
    data['status'] = status

    # 5) date/year
    date_raw = jld.get('date') or find_date(html) or find_date(text)
    # try parse to nice format
    pretty_date = None
    if date_raw:
        try:
            dt = dateparser.parse(date_raw)
            pretty_date = dt.strftime('%b %d, %Y')  # e.g. Jul 08, 2022
        except Exception:
            # if only year, return it raw
            pretty_date = date_raw
    data['date'] = pretty_date

    # fallback improvements: try find labels near DOM elements
    # try find specific label nodes (safe simple selectors)
    # many anime pages show info in a small panel; we'll try to find nodes with "Áudio" label
    try:
        labels = soup.find_all(lambda tag: tag.name in ['div','span','p','li'] and 'Áudio' in (tag.get_text() or '') )
        for lbl in labels:
            txt = lbl.get_text(separator=' ', strip=True)
            # e.g. "Áudio: Legendado"
            m = re.search(r'Áudio[:\s]*([A-Za-zÀ-ü -]+)', txt, re.IGNORECASE)
            if m:
                data['audio'] = m.group(1).strip()
    except Exception:
        pass

    return data

def pretty_print(data):
    print("\n--- Resultado ---")
    print(f"Image:  {data.get('image') or '(não encontrado)'}")
    print(f"Áudio:  {data.get('audio') or '(não encontrado)'}")
    print(f"Episódios: {data.get('episodes') or '(não encontrado)'}")
    print(f"Status: {data.get('status') or '(não encontrado)'}")
    print(f"Ano/Data: {data.get('date') or '(não encontrado)'}")
    print("-----------------\n")

def save_txt(display_name, data, filename=None):
    if not filename:
        filename = f"{display_name} - info.txt"
    lines = []
    lines.append(f"{display_name} - nome do anime:")
    lines.append("")
    lines.append(f"Image: {data.get('image') or '(não encontrado)'}")
    lines.append(f"Áudio: {data.get('audio') or '(não encontrado)'}")
    lines.append(f"Episódios: {data.get('episodes') or '(não encontrado)'}")
    lines.append(f"Status: {data.get('status') or '(não encontrado)'}")
    lines.append(f"Ano/Data: {data.get('date') or '(não encontrado)'}")
    with open(filename, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"[salvo] {filename}")

def main():
    print("AnimeFire — extrator simples")
    url = input("Cole a URL da página (ex: ...-todos-os-episodios): ").strip()
    if not url:
        print("URL vazia. Saindo.")
        return
    base = normalize_base_url(url)
    print(f"Usando base: {base}")

    data = extract_all(base)
    if data is None:
        print("Falha ao extrair dados.")
        return

    # display name: from slug
    parsed = urlparse(base)
    slug = parsed.path.rstrip('/').split('/')[-1] if parsed.path else 'anime'
    display_name = slug.replace('-', ' ').title()

    # interactive menu
    while True:
        print("\nEscolha o que quer pegar:")
        print("1) Image")
        print("2) Áudio")
        print("3) Episódios")
        print("4) Status")
        print("5) Ano/Data")
        print("6) Mostrar tudo")
        print("7) Salvar tudo em TXT")
        print("0) Sair")
        choice = input("> ").strip()
        if choice == "1":
            print("Image:", data.get('image') or "(não encontrado)")
        elif choice == "2":
            print("Áudio:", data.get('audio') or "(não encontrado)")
        elif choice == "3":
            print("Episódios:", data.get('episodes') or "(não encontrado)")
        elif choice == "4":
            print("Status:", data.get('status') or "(não encontrado)")
        elif choice == "5":
            print("Ano/Data:", data.get('date') or "(não encontrado)")
        elif choice == "6":
            pretty_print(data)
        elif choice == "7":
            save_txt(display_name, data)
        elif choice == "0":
            print("Tchau.")
            break
        else:
            print("Opção inválida.")

if __name__ == "__main__":
    main()