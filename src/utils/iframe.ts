export interface ParsedIframe {
  src: string;
  allowFullScreen: boolean;
  allow: string;
  isIframeHtml: boolean;
}

function attr(html: string, name: string, fallback = ""): string {
  const re = new RegExp(`${name}=["']?([^"'\\s>]+)["']?`, "i");
  const m = html.match(re);
  return m ? m[1] : fallback;
}

export function parseIframe(input: string): ParsedIframe {
  const trimmed = input.trim();
  const isTag = /^<iframe/i.test(trimmed);
  if (!isTag) {
    return {
      src: trimmed,
      allowFullScreen: true,
      allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen",
      isIframeHtml: false,
    };
  }
  return {
    src: attr(trimmed, "src"),
    allow: attr(trimmed, "allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"),
    allowFullScreen: /allowfullscreen/i.test(trimmed),
    isIframeHtml: true,
  };
}

export function detectProvider(input: string): string {
  const { src } = parseIframe(input);
  if (/youtube\.com|youtu\.be/.test(src)) return "YouTube";
  if (/vimeo\.com/.test(src)) return "Vimeo";
  if (/drive\.google\.com/.test(src)) return "Google Drive";
  if (/dailymotion\.com/.test(src)) return "Dailymotion";
  if (/twitch\.tv/.test(src)) return "Twitch";
  return "Player Externo";
}
