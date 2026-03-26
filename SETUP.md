# Troopers Marketing Hub — Setup Guide

## Files in this folder
- `index.html` — the main web app
- `logo.png` — TROOPERS logo
- `api/chat.js` — the backend function (handles Claude API calls)
- `package.json` — project config
- `vercel.json` — Vercel deployment config

---

## How to deploy to Vercel (step by step)

### Step 1 — Open in VS Code
Open this entire folder in VS Code.

### Step 2 — Push to GitHub
1. Open VS Code terminal (Ctrl + ` )
2. Run these commands one by one:
```
git init
git add .
git commit -m "Initial commit - Troopers Marketing Hub"
```
3. Go to github.com → New Repository → name it `troopers-marketing-hub`
4. Copy the commands GitHub gives you and paste in terminal

### Step 3 — Deploy on Vercel
1. Go to vercel.com and log in with your GitHub account
2. Click "Add New Project"
3. Select your `troopers-marketing-hub` repo
4. Click Deploy — that's it!

### Step 4 — Share the link
Vercel will give you a URL like `troopers-marketing-hub.vercel.app`
Share this link with your team!

---

## First time using the app
When anyone opens the app for the first time, they'll see a popup asking for the Claude API Key.
They enter the key once — it's saved for that browser session.

---

## Need help?
Ask your Cowork Claude agent!
