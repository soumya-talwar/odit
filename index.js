import "dotenv/config";
import { google } from "googleapis";
import fs from "fs";
import express from "express";
import { GoogleGenAI } from "@google/genai";
import { Resend } from "resend";

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
			expense.category = categorizeExpense(expense.description);
			console.log("Parsed expense:", expense);
			await appendSheet(expense);
			const taunt = await generateTaunt(expense);
			console.log("Generated taunt:", taunt);
			await sendEmail(input, taunt);
			res.json({
				message: `Logged ${expense.amount} for ${expense.category}`,
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

function categorizeExpense(text) {
	if (text.includes("uber") || text.includes("ola")) return "Transport";
	if (text.includes("swiggy") || text.includes("zomato")) return "Food";
	if (text.includes("dance") || text.includes("jive")) return "Hobbies";
	if (text.includes("amazon")) return "Shopping";
	return "Misc";
}

async function appendSheet({ amount, category, description }) {
	const spreadsheetId = process.env.GOOGLE_SHEET_ID;
	await sheets.spreadsheets.values.append({
		spreadsheetId,
		range: "Sheet1!A:D",
		valueInputOption: "USER_ENTERED",
		requestBody: {
			values: [[new Date().toISOString(), amount, category, description]],
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
