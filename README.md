# ODIT — AI Financial Advisor 

Odit is a voice-first, AI-powered personal finance system that logs expenses, evaluates spending decisions, and sends sarcastic weekly summaries — all powered by Google Sheets + Gemini.

It is designed to feel less like a tool and more like a judgmental financial advisor that lives in your pocket.

<br>

## ✨ Features

### 🗣 Voice-based Expense Logging
Log expenses using natural language:
> "I spent 500 on dinner"

- Extracts amount + description
- Categorizes using AI (Gemini)
- Logs to Google Sheets


### 🧠 Smart Categorization
Uses a predefined taxonomy to classify expenses into:
- Category (e.g. Food, Transport)
- Subcategory (e.g. Dining Out, Cabs)

Fallback: `Misc` if no match is found


### 😈 AI-Generated Taunts
Every expense triggers a **personalized, sarcastic remark** based on:
- Current monthly spend
- Weekly spend
- Category totals
- Subcategory trends


### 🤔 Spend Approval Mode
Ask before spending:
> "Should I spend 2000 on shoes?"

Returns a judgmental yes/no style response using:
- Current spending context
- Category behavior


### 📊 Google Sheets Dashboard
Data is stored and visualized across:
- Raw logs (`Data` sheet)
- Computed totals (`Totals` sheet)
- Visual dashboard (`Dashboard` sheet)

Includes:
- Monthly / weekly spend
- Category breakdowns
- Impulse spending %
- Essential vs non-essential split
- Trend charts


### 📩 Weekly Summary Email
Trigger:
> "Send me a summary"

Sends a structured report:

- Key metrics (weekly, monthly, WoW change)
- Highest spending category/subcategory
- AI-generated:
  - Observation
  - Verdict
  - Advice

<br>

## 🧱 Tech Stack

- **Backend:** Node.js (Serverless on Vercel)
- **AI:** Google Gemini (`@google/genai`)
- **Database:** Google Sheets
- **Email:** Resend
- **Automation:** Apple Shortcuts (voice interface)

<br>

## 🧠 How it Works

1. User sends text via Siri Shortcut → `/api`
2. Input is parsed into:
   - `amount`
   - `description`
   - `intent` (log / query / summary)
3. Gemini categorizes the expense
4. Data is written to Google Sheets
5. Totals are computed via formulas
6. Context is fetched back into the app
7. Gemini generates:
   - Taunt / Decision / Summary
8. Response is returned (and optionally emailed)

<br>

## 🧩 Example Inputs

| Input | Behavior |
|------|--------|
| "I spent 500 on groceries" | Logs expense + taunt |
| "Should I spend 2000 on shoes?" | Approval response |
| "Send me a summary" | Sends weekly email |
