# 🎌 AnimeVerse

Site de animes com **front-end e back-end juntos** — um único comando, uma única porta.

## ⚡ Instalação e uso

```bash
# 1. Instalar dependências
npm install

# 2. Rodar em desenvolvimento (front + back juntos na porta 3000)
npm run dev
```

Acesse: **http://localhost:3000**

A API também fica disponível em: **http://localhost:3000/api/animes**

---

## 🏗️ Como funciona

- `server.js` é o servidor Express que serve a API (`/api/*`)
- `vite-express` cuida do Vite dev server (com HMR) e do build de produção — **tudo no mesmo processo e porta**
- Sem proxy, sem CORS, sem dois terminais

---

## 📦 Scripts

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Dev mode — Express + Vite juntos na porta 3000 |
| `npm run build` | Gera o build de produção em `/dist` |
| `npm start` | Produção — Express serve o `/dist` estático |

---

## 🔑 API Key (padrão: `dev-key`)

Para usar o painel admin ou a API de escrita, você precisa da API key.

Crie um arquivo `.env` na raiz:
```env
PORT=3000
API_KEY=minha-chave-aqui
```

No painel admin, insira a chave no campo no topo da página. O padrão em dev é `dev-key`.

---

## 📺 Formatos de embed aceitos

No campo `embedUrl` de cada episódio, você pode colocar:

```json
// 1. URL simples
"embedUrl": "https://www.youtube.com/embed/XXXXXXX"

// 2. Código <iframe> completo (copie direto do site)
"embedUrl": "<iframe src=\"https://anidrive.click/token/XYZ\" width=\"800\" height=\"450\" frameborder=\"0\" allowfullscreen></iframe>"
```

O sistema extrai o `src` automaticamente e renderiza sempre responsivo.

---

## ✏️ Adicionando animes

Edite diretamente o `animes.json` **ou** use o painel admin em `/admin`.

Campos importantes:
- `audioType`: `"legendado"` | `"dublado"` | `"dual-audio"`
- `episodeCount`: total de episódios do anime (incluindo não lançados)
- `episodes[].embedCredit`: texto que aparece abaixo do player como crédito

---

## 🚀 Produção com PM2

```bash
npm run build
npm install -g pm2
pm2 start server.js --name animeverse
pm2 save && pm2 startup
```
