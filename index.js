import "dotenv/config";
import { google } from "googleapis";
import fs from "fs";
import express from "express";
import { GoogleGenAI } from "@google/genai";
import { Resend } from "resend";

const TAXONOMY = `
  House:
  - Rent + Repair
  - Furniture 
  - Appliances (washing machine, microwave, blender, etc)
  - Electricity
  - Gas
  - Wifi
  - Plants
  - Bedding & Furnishings (blanket, towel, curtain, rug, etc)
  - Home Essentials (cleaning, toiletries, maintenance items)
  - Domestic Help
  - Misc (uncategorized house expenses)

  Food:
  - Meal Subscriptions (plan cost, delivery charges)
  - Fruits 
  - Snacks
  - Food Delivery
  - Dining Out
  - Misc (uncategorized food expenses)

  Hobbies:
  - Coding (hardware/robotics equipment, ai/software subscriptions, etc)
  - Dance (classes, socials)
  - Ninjutsu
  - Table Tennis
  - Jigsaw Puzzles
  - Skating
  - Fitness
  - Misc (weekend activities, events, experiences, etc)

  Transport:
  - Car (purchase, repair)
  - Petrol
  - Cabs
  - Car Cleaner
  - Parking & Tolls
  - Misc (uncategorized transport expenses)

  Shopping:
  - Clothing & Accessories
  - Personal Care (cosmetics, skincare, salon, grooming, etc)
  - Health
  - Electronics
  - Kitchen (utensils, containers, bottles, etc)
  - Blinkit (all Blinkit purchases)
  - Gifts
  - Misc (uncategorized shopping expenses)

  Vacation (all expenses incurred during travel/trip, categorized separately from regular expenses):
  - Travel
  - Stay
  - Food
  - Misc

  Misc (fallback category for uncategorized expenses)
`;

const ai = new GoogleGenAI({
	apiKey: process.env.GEMINI_API_KEY,
});

const serviceAccount = JSON.parse(
	fs.readFileSync("./service-account.json", "utf-8"),
);

const auth = new google.auth.GoogleAuth({
	credentials: serviceAccount,
	scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();
app.use(express.json());

app.post("/log", async (req, res) => {
	try {
		const input = req.body.text;
		console.log("Received from Siri:", input);
		let expense = parseExpense(input);
		if (expense.amount) {
			let category = await categorizeExpense(expense.description);
			expense.category = category.category;
			expense.subcategory = category.subcategory;
			console.log("Parsed expense:", expense);
			await appendSheet(expense);
			const taunt = await generateTaunt(expense);
			console.log("Generated taunt:", taunt);
			await sendEmail(input, taunt);
			res.json({
				message: `Logged ${expense.amount} for ${expense.subcategory} under ${expense.category}`,
				taunt: taunt,
			});
		} else {
			res.status(400).json({ error: "Could not parse amount from input" });
		}
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "Something went wrong" });
	}
});

app.listen(3000, () => {
	console.log("Server running on port 3000");
});

function parseExpense(text) {
	const match = text.match(/\d+/);
	const amount = match ? Number(match[0]) : null;
	const description = text
		.replace(/^.*?\d+\s*/, "")
		.trim()
		.toLowerCase();
	return {
		amount,
		description,
	};
}

async function categorizeExpense(text) {
	let prompt = `
  You are categorizing a user's expense into EXACTLY one Category and one Subcategory.

  Follow these rules STRICTLY:
  - Always pick the MOST specific match
  - Do NOT guess beyond the given taxonomy
  - Use "Misc" only if nothing else fits
  - Return ONLY a valid JSON object in this exact format:
    {
      "category": "<Category>",
      "subcategory": "<Subcategory>"
    }
  - Use only the subcategory NAME (no brackets, no descriptions)

  TAXONOMY: ${TAXONOMY}
  
  User's expense description: "${text}"`;

	const response = await ai.models.generateContent({
		model: "gemini-2.5-flash",
		contents: [{ role: "user", parts: [{ text: prompt }] }],
	});
	let raw = response.text
		.replace(/```json/g, "")
		.replace(/```/g, "")
		.trim();
	try {
		const parsed = JSON.parse(raw);
		return {
			category: parsed.category,
			subcategory: parsed.subcategory,
		};
	} catch (err) {
		console.error("Parsing failed:", raw);
		return {
			category: "Misc",
			subcategory: "Misc",
		};
	}
}

async function appendSheet({ amount, subcategory, category, description }) {
	const spreadsheetId = process.env.GOOGLE_SHEET_ID;
	await sheets.spreadsheets.values.append({
		spreadsheetId,
		range: "Sheet1!A:D",
		valueInputOption: "USER_ENTERED",
		requestBody: {
			values: [
				[new Date().toISOString(), amount, subcategory, category, description],
			],
		},
	});
	console.log("✅ Successfully wrote to Google Sheet");
}

async function generateTaunt({ amount, category, description }) {
	const prompt = `
    You are a sharp, sarcastic financial advisor.
    Write a SHORT (1-2 sentences max) passive-aggressive remark about the user's spending.

    Be:
    - cutting, slightly mean, and personal
    - specific to the expense
    - NOT poetic or flowery
    - NOT overly verbose

    User spent ₹${amount} on ${category}.
    Description: "${description}"

    Respond with only the remark. No explanations.
    `;
	const response = await ai.models.generateContent({
		model: "gemini-2.5-flash",
		contents: [{ role: "user", parts: [{ text: prompt }] }],
	});
	return response.text;
}

async function sendEmail(input, taunt) {
	try {
		await resend.emails.send({
			from: "onboarding@resend.dev",
			to: process.env.EMAIL_USER,
			subject: "[ODIT] Regarding your expense",
			html: `
        <p><i>"${input}"</i></p>
        <p>${taunt}</p>
      `,
		});
	} catch (err) {
		console.error("Email failed:", err);
	}
}
