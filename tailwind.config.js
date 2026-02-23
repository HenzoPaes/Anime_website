export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bebas Neue"', "sans-serif"],
        body:    ['"Nunito"', "sans-serif"],
        mono:    ['"JetBrains Mono"', "monospace"],
      },
      colors: {
        brand: { 300:"#fda4af", 400:"#fb7185", 500:"#f43f5e", 600:"#e11d48", 700:"#be123c" },
        dark:  { 900:"#0a0a0f", 800:"#111118", 700:"#1a1a27", 600:"#22223a", 500:"#2d2d4a" },
      },
      animation: {
        shimmer: "shimmer 1.5s infinite",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
        float: "float 3s ease-in-out infinite",
      },
      keyframes: {
        shimmer: { "0%":{backgroundPosition:"-200% 0"}, "100%":{backgroundPosition:"200% 0"} },
        glowPulse: {
          "0%,100%":{ boxShadow:"0 0 20px rgba(244,63,94,0.3)" },
          "50%":{ boxShadow:"0 0 50px rgba(244,63,94,0.8)" },
        },
        float: { "0%,100%":{transform:"translateY(0)"}, "50%":{transform:"translateY(-10px)"} },
      },
    },
  },
  plugins: [],
};
