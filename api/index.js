import { google } from "googleapis";
import { GoogleGenAI } from "@google/genai";
import { Resend } from "resend";

const TAXONOMY = `
  House:
  - Rent & Repair
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

const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

const auth = new google.auth.GoogleAuth({
	credentials: serviceAccount,
	scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
	if (req.method !== "POST") {
		return res
			.status(405)
			.json({ message: "Only POST methods are allowed. Please try again." });
	}
	try {
		const input = req.body?.text?.toLowerCase();
		if (!input)
			return res
				.status(400)
				.json({ message: "There was no input provided. Please try again." });
		console.log("Received from Soumya:", input);
		let expense = parseInput(input);
		if (expense.type) {
			if (expense.type === "summary") {
				const metrics = await getSummaryMetrics();
				const summary = await generateSummary(metrics);
				await sendSummaryEmail(metrics, summary);
				return res.status(200).json({
					status: "Summary email sent successfully",
					message: "Check your inbox for the summary email.",
				});
			} else {
				if (expense.amount) {
					let category = await categorizeExpense(expense.description);
					expense.category = category.category;
					expense.subcategory = category.subcategory;
					console.log("Parsed input:", expense);
					if (expense.type === "log") {
						await appendSheet(expense);
						const totals = await getStructuredTotals();
						const taunt = await generateTaunt(expense, totals);
						console.log("Generated taunt:", taunt);
						return res.status(200).json({
							status: `Logged ${expense.amount} for ${expense.subcategory} under ${expense.category}`,
							message: taunt,
						});
					} else if (expense.type === "query") {
						const totals = await getStructuredTotals();
						const decision = await approveExpense(input, expense, totals);
						console.log("Generated decision:", decision);
						return res.status(200).json({
							status: `Asked for approval to spend ${expense.amount} on ${expense.subcategory} under ${expense.category}`,
							message: decision,
						});
					}
				} else {
					return res.status(400).json({
						message: "I could not parse the input. Please try again.",
					});
				}
			}
		} else {
			return res
				.status(400)
				.json({ message: "I could not parse the input. Please try again." });
		}
	} catch (err) {
		console.error(err);
		return res.status(500).json({
			error: err.toString(),
			message: "Something went wrong. Please try again.",
		});
	}
}

function parseInput(text) {
	const match = text.match(/\d+/);
	const amount = match ? Number(match[0]) : null;
	let type = undefined;
	if (text.includes("i spent")) type = "log";
	else if (text.includes("should i spend")) type = "query";
	else if (text.includes("send me a summary")) type = "summary";
	const description = text
		.replace(/^.*?\d+\s*/, "")
		.trim()
		.toLowerCase();
	return {
		amount,
		description,
		type,
	};
}

async function categorizeExpense(text) {
	let prompt = `
  You are categorizing a user's expense(₹) into EXACTLY one Category and one Subcategory.

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
	const date = new Date();
	const formattedDate = date.toLocaleDateString("en-US", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});
	await sheets.spreadsheets.values.append({
		spreadsheetId,
		range: "Data!A:E",
		valueInputOption: "USER_ENTERED",
		requestBody: {
			values: [[formattedDate, amount, subcategory, category, description]],
		},
	});
	console.log("✅ Successfully wrote to Google Sheet");
}

async function getStructuredTotals() {
	const spreadsheetId = process.env.GOOGLE_SHEET_ID;
	const response = await sheets.spreadsheets.values.get({
		spreadsheetId,
		range: "Totals!A:D",
	});
	const rows = response.data.values;
	const COLLECTIVE_TOTALS = {};
	const CATEGORY_TOTALS = {};
	const SUBCATEGORY_TOTALS = {};
	if (!rows || rows.length === 0) {
		return { COLLECTIVE_TOTALS, CATEGORY_TOTALS, SUBCATEGORY_TOTALS };
	}
	for (const row of rows) {
		const [total, label, type, category] = row;
		if (!total || !label || !type) continue;
		const numericTotal = Number(total);
		const normalizedLabel = label.toLowerCase().trim();
		const normalizedType = type.toLowerCase().trim();
		const normalizedCategory =
			category && category !== "null" ? category.toLowerCase().trim() : null;
		if (normalizedType === "collective")
			COLLECTIVE_TOTALS[normalizedLabel] = numericTotal;
		else if (normalizedType === "category")
			CATEGORY_TOTALS[normalizedLabel] = numericTotal;
		else if (normalizedType === "subcategory") {
			if (!normalizedCategory) continue;
			if (!SUBCATEGORY_TOTALS[normalizedCategory]) {
				SUBCATEGORY_TOTALS[normalizedCategory] = {};
			}
			SUBCATEGORY_TOTALS[normalizedCategory][normalizedLabel] = numericTotal;
		}
	}
	return {
		COLLECTIVE_TOTALS,
		CATEGORY_TOTALS,
		SUBCATEGORY_TOTALS,
	};
}

async function generateTaunt(
	{ amount, category, subcategory, description },
	{ COLLECTIVE_TOTALS, CATEGORY_TOTALS, SUBCATEGORY_TOTALS },
) {
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

    SPENDING CONTEXT (after accounting for this expense):
    - Monthly total: ₹${COLLECTIVE_TOTALS.monthly || 0}
    - Weekly total: ₹${COLLECTIVE_TOTALS.weekly || 0}
    - ${category} total: ₹${CATEGORY_TOTALS[category.toLowerCase()] || 0}
    - ${subcategory} total: ₹${SUBCATEGORY_TOTALS[category?.toLowerCase()]?.[subcategory.toLowerCase()] || 0}

    Use the context to make the insult personal and observant.

    Respond with only the remark. No explanations.
    `;
	const response = await ai.models.generateContent({
		model: "gemini-2.5-flash",
		contents: [{ role: "user", parts: [{ text: prompt }] }],
	});
	return response.text;
}

async function approveExpense(
	input,
	{ category, subcategory },
	{ COLLECTIVE_TOTALS, CATEGORY_TOTALS, SUBCATEGORY_TOTALS },
) {
	const prompt = `
    You are a sharp, sarcastic financial advisor.
    The user is ASKING PERMISSION to spend money(₹).

    Be:
    - judgmental
    - slightly condescending
    - decisive (yes/no energy)
    - short (1–2 lines)

    User asks: "${input}"

    SPENDING CONTEXT:
    - Monthly total: ₹${COLLECTIVE_TOTALS.monthly || 0}
    - Weekly total: ₹${COLLECTIVE_TOTALS.weekly || 0}
    - ${category} total: ₹${CATEGORY_TOTALS[category.toLowerCase()] || 0}
    - ${subcategory} total: ₹${SUBCATEGORY_TOTALS[category?.toLowerCase()]?.[subcategory.toLowerCase()] || 0}

    Use the context to make the insult personal and observant.

    Respond with only the remark.
    `;
	const response = await ai.models.generateContent({
		model: "gemini-2.5-flash",
		contents: [{ role: "user", parts: [{ text: prompt }] }],
	});
	return response.text;
}

async function getSummaryMetrics() {
	const spreadsheetId = process.env.GOOGLE_SHEET_ID;
	const response = await sheets.spreadsheets.values.batchGet({
		spreadsheetId,
		ranges: ["Totals!A3:A4", "Totals!K10:K11", "Dashboard!D11"],
	});
	const ranges = response.data.valueRanges;
	const monthTotal = Number(ranges[0]?.values?.[0]?.[0] || 0);
	const weekTotal = Number(ranges[0]?.values?.[1]?.[0] || 0);
	const topCategory = ranges[1]?.values?.[0]?.[0] || "None";
	const topSubcategory = ranges[1]?.values?.[1]?.[0] || "None";
	const wowChange = Number(ranges[2]?.values?.[0]?.[0] || 0);
	return {
		monthTotal,
		weekTotal,
		topCategory,
		topSubcategory,
		wowChange,
	};
}

async function generateSummary({
	monthTotal,
	weekTotal,
	topCategory,
	topSubcategory,
	wowChange,
}) {
	const prompt = `
		You are a sharp, sarcastic financial advisor.
		Write a structured weekly summary of the user’s spending.

		TONE:
		- slightly mean, judgmental
		- observant and specific
		- concise (1–2 lines per section)
		- not poetic, not verbose

		DATA:
		- Monthly spend: ₹${monthTotal}
		- Weekly spend: ₹${weekTotal}
		- Week-on-week change: ${wowChange}%
		- Highest spend category: ${topCategory}
		- Highest spend subcategory: ${topSubcategory}

		INSTRUCTIONS:
		- Identify ONE clear behavioral pattern or observation
		- Give ONE decisive verdict (are they in control or not?)
		- Give ONE actionable piece of advice

		FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

		OBSERVATION:
		<your observation>

		VERDICT:
		<your verdict>

		ADVICE:
		<your advice>

		Do not add anything else.
		`;

	const response = await ai.models.generateContent({
		model: "gemini-2.5-flash",
		contents: [{ role: "user", parts: [{ text: prompt }] }],
	});
	const formattedSummary = response.text.replace(/\n/g, "<br>");
	return formattedSummary;
}

async function sendSummaryEmail(
	{ monthTotal, weekTotal, topCategory, topSubcategory, wowChange },
	summary,
) {
	try {
		await resend.emails.send({
			from: "Odit <onboarding@resend.dev>",
			to: process.env.EMAIL_USER,
			subject: "[ODIT] Your weekly spending summary",
			html: `
			<p>This week:</p>

			<p><strong>Total Monthly Spend:</strong> ₹${monthTotal}</p>
			<p><strong>Total Weekly Spend:</strong> ₹${weekTotal}</p>
			<p><strong>Week on Week Change:</strong> ${wowChange}%</p>
			<p><strong>Highest Spending Category:</strong> ${topCategory}</p>
			<p><strong>Highest Spending Subcategory:</strong> ${topSubcategory}</p>

			<p>${summary}</p>
		`,
		});
	} catch (err) {
		console.log("Email failed:", err.message, err);
	}
}
