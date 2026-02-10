import { google } from "googleapis";
import type { MeetingData } from "@/definitions/types";

function getSpreadsheetId() {
	if (!process.env.SPREADSHEET_ID) {
		throw new Error("SPREADSHEET_ID is not set");
	}
	return process.env.SPREADSHEET_ID;
}

/**
 * Google Sheets APIクライアントを取得
 */
async function getSheetsClient() {
	const auth = new google.auth.GoogleAuth({
		scopes: ["https://www.googleapis.com/auth/spreadsheets"],
	});

	const authClient = await auth.getClient();
	// biome-ignore lint/suspicious/noExplicitAny: allow any
	return google.sheets({ version: "v4", auth: authClient as any });
}

/**
 * 既存データを取得
 */
async function getExistingData(
	sheets: ReturnType<typeof google.sheets>,
	sheetName: string,
): Promise<string[][]> {
	try {
		const response = await sheets.spreadsheets.values.get({
			spreadsheetId: getSpreadsheetId(),
			range: `${sheetName}!A2:E`, // ヘッダー行をスキップ
		});

		return response.data.values || [];
	} catch (error) {
		console.error("Failed to get existing data:", error);
		return [];
	}
}

/**
 * メインデータシートが存在するか確認し、なければ作成
 */
async function ensureMainSheetExists(
	sheets: ReturnType<typeof google.sheets>,
	sheetName: string,
): Promise<void> {
	try {
		const response = await sheets.spreadsheets.get({
			spreadsheetId: getSpreadsheetId(),
		});

		const sheetExists = response.data.sheets?.some(
			(sheet) => sheet.properties?.title === sheetName,
		);

		if (!sheetExists) {
			// シートを作成
			await sheets.spreadsheets.batchUpdate({
				spreadsheetId: getSpreadsheetId(),
				requestBody: {
					requests: [
						{
							addSheet: {
								properties: {
									title: sheetName,
								},
							},
						},
					],
				},
			});

			// ヘッダー行を追加
			await sheets.spreadsheets.values.update({
				spreadsheetId: getSpreadsheetId(),
				range: `${sheetName}!A1:E1`,
				valueInputOption: "RAW",
				requestBody: {
					values: [["審議会名", "開催日", "開催時間", "議題", "詳細URL"]],
				},
			});

			console.log(`Created main data sheet: ${sheetName}`);
		}
	} catch (error) {
		console.error("Failed to ensure main sheet exists:", error);
	}
}

/**
 * 会議データをスプレッドシートに更新/挿入
 * URLをキーに既存データを更新、新規の場合は追加
 */
export async function upsertMeetings(
	meetings: MeetingData[],
	sheetName: string,
): Promise<{
	updated: number;
	inserted: number;
}> {
	const sheets = await getSheetsClient();

	// メインデータシートの存在確認
	await ensureMainSheetExists(sheets, sheetName);

	// 既存データを取得
	const existingData = await getExistingData(sheets, sheetName);

	// URLをキーにしたマップを作成 (行番号を保持)
	const urlToRowIndex = new Map<string, number>();
	existingData.forEach((row, index) => {
		const url = row[4]; // 詳細URL列
		if (url) {
			urlToRowIndex.set(url, index + 2); // +2 はヘッダー行とインデックスの調整
		}
	});

	let updated = 0;
	let inserted = 0;

	// 各会議データを処理
	for (const meeting of meetings) {
		const rowData = [
			meeting.name,
			meeting.date,
			meeting.time,
			meeting.agenda,
			meeting.detailUrl,
		];

		const existingRowIndex = urlToRowIndex.get(meeting.detailUrl);

		if (existingRowIndex !== undefined) {
			// 既存データを更新
			await sheets.spreadsheets.values.update({
				spreadsheetId: getSpreadsheetId(),
				range: `${sheetName}!A${existingRowIndex}:E${existingRowIndex}`,
				valueInputOption: "RAW",
				requestBody: {
					values: [rowData],
				},
			});
			updated++;
			console.log(`Updated row ${existingRowIndex}: ${meeting.name}`);
		} else {
			// 新規データを追加
			await sheets.spreadsheets.values.append({
				spreadsheetId: getSpreadsheetId(),
				range: `${sheetName}!A:E`,
				valueInputOption: "RAW",
				requestBody: {
					values: [rowData],
				},
			});
			inserted++;
			console.log(`Inserted new row: ${meeting.name}`);
		}
	}

	return { updated, inserted };
}

/**
 * 実行履歴シートが存在するか確認し、なければ作成
 */
async function ensureHistorySheetExists(
	sheets: ReturnType<typeof google.sheets>,
	sheetName: string,
): Promise<void> {
	try {
		const response = await sheets.spreadsheets.get({
			spreadsheetId: getSpreadsheetId(),
		});

		const sheetExists = response.data.sheets?.some(
			(sheet) => sheet.properties?.title === sheetName,
		);

		if (!sheetExists) {
			// シートを作成
			await sheets.spreadsheets.batchUpdate({
				spreadsheetId: getSpreadsheetId(),
				requestBody: {
					requests: [
						{
							addSheet: {
								properties: {
									title: sheetName,
								},
							},
						},
					],
				},
			});

			// ヘッダー行を追加
			await sheets.spreadsheets.values.update({
				spreadsheetId: getSpreadsheetId(),
				range: `${sheetName}!A1:D1`,
				valueInputOption: "RAW",
				requestBody: {
					values: [["実行日時", "ステータス", "処理件数", "エラー詳細"]],
				},
			});

			console.log("Created execution history sheet");
		}
	} catch (error) {
		console.error("Failed to ensure history sheet exists:", error);
	}
}

/**
 * 実行履歴を記録
 */
export async function logExecution(
	sheetName: string,
	status: "成功" | "失敗",
	processedCount: string,
	errorDetail: string = "-",
): Promise<void> {
	try {
		const sheets = await getSheetsClient();

		// 実行履歴シートの存在確認
		await ensureHistorySheetExists(sheets, sheetName);

		// 現在時刻 (JST)
		const now = new Date();
		const jstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
		const timestamp = jstTime.toISOString().replace("T", " ").substring(0, 19);

		// 履歴を追加
		await sheets.spreadsheets.values.append({
			spreadsheetId: getSpreadsheetId(),
			range: `${sheetName}!A:D`,
			valueInputOption: "RAW",
			requestBody: {
				values: [[timestamp, status, processedCount, errorDetail]],
			},
		});

		console.log(`Logged execution: ${status} - ${processedCount}`);
	} catch (error) {
		console.error("Failed to log execution:", error);
	}
}
