# ID Sheet Printer

Local web app for printing many ID cards on custom paper.

## Specs

- Card size: **9 × 6 cm** (90 × 60 mm)
- Paper: **200 × 300 mm**
- Layout: **2×5 = 10 IDs per sheet**
- Optional: rotate each ID image 90° without changing the page
- Backs are column-mirrored for a **horizontal flip** (left ↔ right)

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Deploy online (free)

Easiest: **Vercel** or **Netlify** (static Vite app, no backend).

### Option A — Vercel

1. Create a GitHub repo and push this project.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import the repo.
3. Framework preset: **Vite** (defaults are fine) → **Deploy**.

Or from this folder after installing the CLI:

```bash
npx vercel
```

### Option B — Netlify

```bash
npm run build
npx netlify deploy --prod --dir=dist
```

Images still stay in each visitor’s browser; nothing is uploaded to a server.

## Print workflow

1. Add front images in the order you want them printed.
2. Assign back images in the same order (or add front+back pairs).
3. **Print fronts** — in the print dialog use actual size / 100% scale (not fit-to-page), paper 200×300 mm.
4. Flip the whole stack horizontally (like a book), put it back in the tray.
5. **Print backs (mirrored)** — keep “Reverse back sheet order” on if you flipped the whole stack.

Images stay in your browser only; nothing is uploaded.
