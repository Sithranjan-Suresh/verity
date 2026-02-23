# Verity — Credibility Checker Chrome Extension

Verity is a Chrome extension that analyzes sponsored links and provides a credibility score (0–100) with explainable reasoning.

⚠️ Verity does NOT block users. It only provides advisory signals.

---

## 🚀 Tech Stack

* TypeScript
* Chrome Extension (Manifest V3)
* HTML + CSS
* Node.js

---

## 📦 Installation (Development Setup)

Follow these steps exactly.

### 1️⃣ Install Node.js

Download and install the LTS version from:
[https://nodejs.org](https://nodejs.org)

Verify installation:

```bash
node -v
npm -v
```

---

### 2️⃣ Clone the Repository

```bash
git clone https://github.com/Sithranjan-Suresh/verity
cd verity-extension
```

---

### 3️⃣ Install Dependencies

```bash
npm install
```

---

### 4️⃣ Compile TypeScript

```bash
npx tsc
```

This generates the `dist/` folder with compiled JavaScript.

You must re-run this whenever you change `.ts` files.

---

## 🧩 Load Extension in Chrome

1. Open Chrome
2. Go to: `chrome://extensions`
3. Enable **Developer Mode** (top right)
4. Click **Load Unpacked**
5. Select the project root folder (`verity-extension`)

The extension should now appear in your toolbar.

---

## 🔄 Development Workflow

Whenever you edit TypeScript files:

```bash
npx tsc
```

Then:

* Go to `chrome://extensions`
* Click **Reload** on the Verity extension

---

## 📁 Project Structure

```
verity-extension/
│
├── src/               # TypeScript source files
│   ├── content.ts
│   ├── background.ts
│   ├── popup.ts
│
├── dist/              # Compiled JavaScript (generated)
│
├── manifest.json
├── tsconfig.json
├── package.json
└── README.md
```

Do NOT manually edit files inside `dist/`.

---

## 🧠 Credibility Score (Definition)

Score: 0–100

Based on:

* Domain signals
* Category risk
* Site behavior patterns

Green → Proceed
Yellow → Caution
Red → High Risk

Verity never blocks users. It only advises.

---

## 🛠 Common Issues

### Extension fails to load

Run:

```bash
npx tsc
```

Make sure `dist/` exists.

### Changes not appearing

Recompile and reload extension.

---

## 👥 Team Workflow

Before starting work:

```bash
git pull
npm install
npx tsc
```

Before committing:

```bash
npx tsc
git add .
git commit -m "Your message"
git push
```

---

## 🎯 Demo Flow

Intent → Intercept → Explain → Decide

Verity detects link interaction and provides a credibility explanation before the user proceeds.

---

Built for rapid prototyping and demo-first validation.
