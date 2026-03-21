import "dotenv/config";
import { google } from "googleapis";
import express from "express";
import fs from "fs";

const serviceAccount = JSON.parse(
	fs.readFileSync("./service-account.json", "utf-8"),
);

const auth = new google.auth.GoogleAuth({
	credentials: serviceAccount,
	scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

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
			res.json({ message: `Logged ${expense.amount} for ${expense.category}` });
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
