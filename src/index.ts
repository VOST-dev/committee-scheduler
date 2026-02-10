import { scrapeMeetings as scrapeMetiMeetings } from "./features/scrape/meti/scraper";
import { scrapeMeetings as scrapeOcctoMeetings } from "./features/scrape/occto/scraper";
import { logExecution, upsertMeetings } from "./features/sheets/editor";

const METI_SHEET_NAME = "経済産業省";
const METI_HISTORY_SHEET_NAME = "経済産業省_実行履歴";
const OCCTO_SHEET_NAME = "電力広域的運営推進機関";
const OCCTO_HISTORY_SHEET_NAME = "電力広域的運営推進機関_実行履歴";

async function main() {
	console.log("🚀 Start updating...");
	console.log("----------------------------------------");

	try {
		// 1. 経済産業省 (METI) のスクレイピング
		console.log("\n📋 Scraping METI meetings...");
		const metiMeetings = await scrapeMetiMeetings();

		if (metiMeetings.length === 0) {
			console.warn("⚠️ No METI meetings found");
			await logExecution(METI_HISTORY_SHEET_NAME, "成功", "0件");
		} else {
			console.log(`✅ Scraped ${metiMeetings.length} METI meetings`);

			// Google Sheetsに書き込み
			console.log("📝 Updating METI Google Sheets...");
			const { updated, inserted } = await upsertMeetings(
				metiMeetings,
				METI_SHEET_NAME,
			);

			console.log(
				`✨ METI sheets updated: ${updated} updated, ${inserted} inserted`,
			);

			// 実行履歴を記録
			const processedCount = `更新${updated}件、新規${inserted}件`;
			await logExecution(METI_HISTORY_SHEET_NAME, "成功", processedCount);
		}

		// 2. 電力広域的運営推進機関 (OCCTO) のスクレイピング
		console.log("\n📋 Scraping OCCTO meetings...");
		const occtoMeetings = await scrapeOcctoMeetings();

		if (occtoMeetings.length === 0) {
			console.warn("⚠️ No OCCTO meetings found");
			await logExecution(OCCTO_HISTORY_SHEET_NAME, "成功", "0件");
		} else {
			console.log(`✅ Scraped ${occtoMeetings.length} OCCTO meetings`);

			// Google Sheetsに書き込み
			console.log("📝 Updating OCCTO Google Sheets...");
			const { updated, inserted } = await upsertMeetings(
				occtoMeetings,
				OCCTO_SHEET_NAME,
			);

			console.log(
				`✨ OCCTO sheets updated: ${updated} updated, ${inserted} inserted`,
			);

			// 実行履歴を記録
			const processedCount = `更新${updated}件、新規${inserted}件`;
			await logExecution(OCCTO_HISTORY_SHEET_NAME, "成功", processedCount);
		}

		console.log("----------------------------------------");
		console.log("🎉 All scraping completed successfully!");
		console.log(
			`📊 Total: ${metiMeetings.length} METI meetings, ${occtoMeetings.length} OCCTO meetings`,
		);
		console.log("----------------------------------------");
	} catch (error) {
		console.error("\n❌ Scraping failed!");
		console.error("Error details:", error);

		// エラーを実行履歴に記録 (両方のシートに記録)
		const errorMessage = error instanceof Error ? error.message : String(error);
		try {
			await logExecution(METI_HISTORY_SHEET_NAME, "失敗", errorMessage);
			await logExecution(OCCTO_HISTORY_SHEET_NAME, "失敗", errorMessage);
			console.log("📝 Error logged to history sheets");
		} catch (logError) {
			console.error("Failed to log error to history sheets:", logError);
		}

		process.exit(1);
	}
}

main();
