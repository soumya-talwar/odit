import "dotenv/config";
import { google } from "googleapis";
import fs from "fs";

const serviceAccount = JSON.parse(fs.readFileSync("./service-account.json", "utf-8"));

const auth = new google.auth.GoogleAuth({
	credentials: serviceAccount,
	scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

async function testWrite() {
	const spreadsheetId = process.env.GOOGLE_SHEET_ID;
	await sheets.spreadsheets.values.append({
		spreadsheetId,
		range: "Sheet1!A:D",
		valueInputOption: "USER_ENTERED",
		requestBody: {
			values: [[new Date().toISOString(), 999, "test entry", "Test Category"]],
		},
	});

	console.log("✅ Successfully wrote to Google Sheet");
}

testWrite();
