import re
from urllib.parse import urljoin, quote_plus
from playwright.sync_api import sync_playwright

CR_KEYART_RE = re.compile(r'/keyart/([A-Z0-9]+)-', re.IGNORECASE)

def build_crunchyroll_banner_url(keyart_id, width=1920, quality=85, blur=0, variant="backdrop_wide"):
    return (
        f"https://imgsrv.crunchyroll.com/cdn-cgi/image/"
        f"fit=cover,format=auto,quality={quality},width={width},blur={blur}"
        f"/keyart/{keyart_id}-{variant}"
    )

def fetch_crunchyroll_banner(anime_name, context=None, width=1920, quality=85, blur=0, variant="backdrop_wide"):
    """
    Busca o banner via Playwright (renderiza JS).
    
    Args:
        anime_name: Nome do anime para buscar na Crunchyroll
        context: Contexto do Playwright (opcional - se não fornecer, cria um novo)
        width, quality, blur, variant: Parâmetros de formatação da URL
    
    Returns:
        URL do banner ou None se não encontrar
    """
    search_url = f"https://www.crunchyroll.com/pt-br/search?q={quote_plus(anime_name)}"
    
    # Se não passou contexto, cria um novo
    own_context = context is None
    
    try:
        if own_context:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                ctx = browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                )
                page = ctx.new_page()
                try:
                    return _fetch_banner_from_page(page, search_url, width, quality, blur, variant)
                finally:
                    page.close()
                    browser.close()
        else:
            # Usa o contexto fornecido
            page = context.new_page()
            try:
                return _fetch_banner_from_page(page, search_url, width, quality, blur, variant)
            finally:
                page.close()
    except Exception as e:
        print(f"❌ Erro ao buscar banner CR para '{anime_name}': {e}")
        return None


def _fetch_banner_from_page(page, search_url, width=1920, quality=85, blur=0, variant="backdrop_wide"):
    """
    Função auxiliar que faz a busca efetiva do banner na página.
    """
    try:
        page.goto(search_url, wait_until="domcontentloaded", timeout=20000)
        page.wait_for_selector("a[href*='/series/']", timeout=10000)
        
        series_href = page.locator("a[href*='/series/']").first.get_attribute("href")
        if not series_href:
            print(f"⚠️ Não encontrou série para '{search_url}'")
            return None
        
        series_url = urljoin("https://www.crunchyroll.com", series_href)
        page.goto(series_url, wait_until="domcontentloaded", timeout=20000)
        
        html = page.content()
        match = CR_KEYART_RE.search(html)
        
        if not match:
            print(f"⚠️ Não encontrou keyart na página da série")
            return None
        
        keyart_id = match.group(1)
        banner_url = build_crunchyroll_banner_url(keyart_id, width, quality, blur, variant)
        print(f"✅ Banner CR encontrado: {banner_url[:60]}...")
        return banner_url
        
    except Exception as e:
        print(f"❌ Erro na busca do banner: {e}")
        return None
