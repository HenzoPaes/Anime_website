import re
from urllib.parse import urljoin, quote_plus

CR_KEYART_RE = re.compile(r'/keyart/([A-Z0-9]+)-', re.IGNORECASE)

def build_crunchyroll_banner_url(keyart_id, width=1920, quality=85, blur=0, variant="backdrop_wide"):
    return (
        f"https://imgsrv.crunchyroll.com/cdn-cgi/image/"
        f"fit=cover,format=auto,quality={quality},width={width},blur={blur}"
        f"/keyart/{keyart_id}-{variant}"
    )

def fetch_crunchyroll_banner(anime_name, context, width=1920, quality=85, blur=0, variant="backdrop_wide"):
    search_url = f"https://www.crunchyroll.com/pt-br/search?q={quote_plus(anime_name)}"
    page = context.new_page()

    try:
        page.goto(search_url, wait_until="domcontentloaded", timeout=20000)
        page.wait_for_selector("a[href*='/series/']", timeout=10000)

        series_href = page.locator("a[href*='/series/']").first.get_attribute("href")
        if not series_href:
            return None

        series_url = urljoin("https://www.crunchyroll.com", series_href)
        page.goto(series_url, wait_until="domcontentloaded", timeout=20000)

        html = page.content()
        match = CR_KEYART_RE.search(html)

        if not match:
            return None

        keyart_id = match.group(1)
        return build_crunchyroll_banner_url(keyart_id, width, quality, blur, variant)

    except:
        return None
    finally:
        page.close()