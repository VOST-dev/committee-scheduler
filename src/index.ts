import { scrapeMeetings } from "./features/scrape/meti/scraper";
import { logExecution, upsertMeetings } from "./features/sheets/editor";

const MAIN_SHEET_NAME = "経済産業省";
const HISTORY_SHEET_NAME = "経済産業省_実行履歴";

async function main() {
	console.log("🚀 Start updating...");
	console.log("----------------------------------------");

	try {
		// 1. スクレイピング実行
		const meetings = await scrapeMeetings();

		if (meetings.length === 0) {
			console.warn("⚠️ No meetings found");
			await logExecution(HISTORY_SHEET_NAME, "成功", "0件");
			return;
		}

		console.log(`✅ Scraped ${meetings.length} meetings`);

		// 2. Google Sheetsに書き込み
		console.log("📝 Updating Google Sheets...");
		const { updated, inserted } = await upsertMeetings(
			meetings,
			MAIN_SHEET_NAME,
		);

		console.log(`✨ Sheets updated: ${updated} updated, ${inserted} inserted`);

		// 3. 実行履歴を記録
		const processedCount = `更新${updated}件、新規${inserted}件`;
		await logExecution(HISTORY_SHEET_NAME, "成功", processedCount);

		console.log("----------------------------------------");
		console.log("🎉 Full test completed successfully!");
		console.log(`📊 Result: ${processedCount}`);
		console.log("----------------------------------------");
	} catch (error) {
		console.error("\n❌ Full test failed!");
		console.error("Error details:", error);

		// エラーを実行履歴に記録
		const errorMessage = error instanceof Error ? error.message : String(error);
		try {
			await logExecution(HISTORY_SHEET_NAME, "失敗", errorMessage);
			console.log("📝 Error logged to history sheet");
		} catch (logError) {
			console.error("Failed to log error to history sheet:", logError);
		}

		process.exit(1);
	}
}

main();
