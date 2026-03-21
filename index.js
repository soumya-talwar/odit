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
		res.json({ message: "Received successfully" });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "Something went wrong" });
	}
});

app.listen(3000, () => {
	console.log("Server running on port 3000");
});

// async function testWrite(amount, category, description) {
// 	const spreadsheetId = process.env.GOOGLE_SHEET_ID;
// 	await sheets.spreadsheets.values.append({
// 		spreadsheetId,
// 		range: "Sheet1!A:D",
// 		valueInputOption: "USER_ENTERED",
// 		requestBody: {
// 			values: [[new Date().toISOString(), amount, category, description]],
// 		},
// 	});

// 	console.log("✅ Successfully wrote to Google Sheet");
// }
