# ODIT

### An expense tracker that insults me when I spend money

Odit is a personal expense tracker that I can use to **log expenses, ask for purchase approvals based on my spend history, and receive weekly reports on mail**. It keeps a record of my financial decisions and insults them.

## How it works

```text
               ┌──────────────────┐
               │  Natural input:  │
               │  "I spent ₹300   │
               │   on an Uber"    │
               └────────┬─────────┘
                        │
                        ▼
                 Apple Shortcut
                        │
                        ▼
                      Odit
                        │
                        ▼
                  Parse intent
                        │
             ┌──────────┴──────────┐
             ▼                     ▼
       Log / Approve             Report
             │                     │
             ▼                     ▼
     Categorise expense    Fetch spend history
          (Gemini)           (Google Sheets)
             │                     │
             ▼                     ▼
 Log / Fetch spend history   Generate report
      (Google Sheets)           (Gemini)
             │                     │
             ▼
       Generate insult        Email report
          (Gemini)              (Resend)
             │
             ▼
       Apple Shortcut
             │
             ▼
      Spoken out loud
```

I can say **“I spent ₹300 on an Uber”** or **“Should I spend ₹5000 on a jigsaw puzzle?”** to an Apple Shortcut, which captures my speech and sends the transcribed text to Odit.

Odit's logic parses the request to extract the **amount** and **description**, and understand the **intent** of the request — whether it is logging an expense, asking for approval on a purchase, or requesting a report.

### Log an expense

For expense logging, Odit uses **Gemini's API** to categorise the purchase based on a predefined taxonomy of categories and subcategories. The expense is then logged to **Google Sheets**, which stores the raw data and calculates spending totals.

Google Sheets also acts as a dashboard where I can see **charts and derived insights about my spending**, including weekly and monthly spend, category breakdowns, impulse spending, essential vs. non-essential spending, and spending trends and forecasts.

When generating an insult, Odit fetches the **weekly, monthly, category and subcategory totals** from Google Sheets and uses them as context when prompting Gemini again.

The generated insult is sent back to the Shortcut and spoken out loud.

### Approve expenditure

I can also ask Odit whether I should make a purchase before I spend the money.

For example:

> **“Should I spend ₹5000 on a jigsaw puzzle?”**

Odit parses the amount and description, determines which spending category the purchase belongs to, and fetches my existing spending history from **Google Sheets**.

That spending context is then sent to **Gemini**, which makes a judgement based on what I'm proposing to buy and how much I've already been spending.

### Email weekly report

Odit can also generate a weekly spending report and send it to me by email using **Resend**.

The report is based on the week's spending metrics pulled from **Google Sheets**, and **Gemini** uses the data to identify patterns in my spending and provide advice.

## Examples

### Input

> “I spent ₹350 on food delivery.”

**Odit:**

> “Another ₹350 on food delivery? Looks like the kitchen is just for decoration.”

### Input

> “Should I spend ₹5000 on a jigsaw puzzle?”

**Odit:**

> “No. Fix your spending habits before you try fixing jigsaw puzzles."

## Built with

- **JavaScript / Node.js**
- **Apple Shortcuts**
- **Google Gemini API**
- **Google Sheets API**
- **Resend**
- **Vercel**
