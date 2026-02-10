import * as cheerio from "cheerio";
import type { MeetingData } from "@/definitions/types";
import { fetchWithUserAgent } from "@/utils/http";

const JSON_URL = "https://www.occto.or.jp/_include/json/news-list.json";
const BASE_URL = "https://www.occto.or.jp";
const TARGET_CATEGORY_ID = "50";
const TARGET_CATEGORY_PARENT_ID = "0";

/**
 * OCCTOニュースJSONの型定義
 */
interface OcctoNewsItem {
	title: string;
	published_date: string;
	url: string;
	categories: Array<{ id: string; parent_id: string }>;
}

/**
 * OCCTOニュースJSONからカテゴリーID=50の委員会スケジュールエントリーを抽出
 * 現在の月と次の2ヶ月のみをフィルター
 */
async function parseNewsJson(): Promise<
	Array<{ name: string; detailUrl: string }>
> {
	try {
		const jsonText = await fetchWithUserAgent(JSON_URL);
		const newsItems = JSON.parse(jsonText) as OcctoNewsItem[];

		// カテゴリーID=50 かつ parent_id=0 のアイテムをフィルター
		const filteredItems = newsItems.filter((item) =>
			item.categories.some(
				(cat) =>
					cat.id === TARGET_CATEGORY_ID &&
					cat.parent_id === TARGET_CATEGORY_PARENT_ID,
			),
		);

		// 日付フィルター: 現在の月 + 次の2ヶ月のみ
		const now = new Date();
		const currentYear = now.getFullYear();
		const currentMonth = now.getMonth(); // 0-11

		// 対象月を計算: 現在の月、次の月、次の次の月
		const targetMonths = [
			{ year: currentYear, month: currentMonth },
			{
				year: currentYear + Math.floor((currentMonth + 1) / 12),
				month: (currentMonth + 1) % 12,
			},
			{
				year: currentYear + Math.floor((currentMonth + 2) / 12),
				month: (currentMonth + 2) % 12,
			},
		];

		const filteredByDate = filteredItems.filter((item) => {
			const itemDate = new Date(item.published_date);
			const itemYear = itemDate.getFullYear();
			const itemMonth = itemDate.getMonth(); // 0-11

			return targetMonths.some(
				(target) => target.year === itemYear && target.month === itemMonth,
			);
		});

		// MeetingDataの基本形式にマッピング (dateは詳細ページから取得するため除外)
		return filteredByDate.map((item) => {
			// URLの正規化: 相対パスを絶対URLに変換
			let detailUrl = item.url;
			if (item.url.startsWith("http")) {
				// すでに完全なURL
				detailUrl = item.url;
			} else if (item.url.startsWith("/")) {
				// ルート相対パス
				detailUrl = `${BASE_URL}${item.url}`;
			} else {
				// 相対パス (念のため)
				detailUrl = `${BASE_URL}/${item.url}`;
			}

			return {
				name: item.title,
				detailUrl,
			};
		});
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to parse OCCTO news JSON: ${error.message}`);
		}
		throw new Error("Failed to parse OCCTO news JSON: Unknown error");
	}
}

/**
 * 詳細ページから会議名、日時と議題を抽出
 */
async function parseDetailPage(
	url: string,
): Promise<{ name: string; date: string; time: string; agenda: string }> {
	try {
		const html = await fetchWithUserAgent(url);
		const $ = cheerio.load(html);

		let name = "";
		let date = "";
		let time = "";
		let agenda = "";

		// h1タグから会議名を取得
		name = $("h1").first().text().trim();

		// "日時" (Date/Time) 情報を抽出
		const dateTimeText = $('h4:contains("日時")').next("p").text().trim();
		if (dateTimeText) {
			// 日付部分を抽出: "2026年2月17日（火曜日）18時00分～20時00分"
			const dateMatch = dateTimeText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
			if (dateMatch) {
				const [, year, month, day] = dateMatch;
				if (year && month && day) {
					date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
				}
			}

			// 時間部分を抽出 - 2つのフォーマットに対応
			// フォーマット1: "18時00分～20時00分"
			// フォーマット2: "15:00～17:00"
			const timeMatch1 = dateTimeText.match(
				/(\d{1,2})時(\d{2})分[～~](\d{1,2})時(\d{2})分/,
			);
			const timeMatch2 = dateTimeText.match(
				/(\d{1,2}):(\d{2})[～~](\d{1,2}):(\d{2})/,
			);

			if (timeMatch1) {
				const [, startHour, startMin, endHour, endMin] = timeMatch1;
				time = `${startHour}時${startMin}分～${endHour}時${endMin}分`;
			} else if (timeMatch2) {
				const [, startHour, startMin, endHour, endMin] = timeMatch2;
				time = `${startHour}:${startMin}～${endHour}:${endMin}`;
			} else {
				// パターンが一致しない場合、デバッグ用に全文を保存
				time = dateTimeText;
			}
		}

		// "予定議題" (Agenda) 情報を抽出
		const agendaItems = $('h4:contains("予定議題")')
			.next("ol")
			.find("li")
			.map((_i, el) => $(el).text().trim())
			.get();

		if (agendaItems.length > 0) {
			agenda = agendaItems.join("\n");
		}

		return { name, date, time, agenda };
	} catch (error) {
		console.error(`Failed to parse detail page ${url}:`, error);
		return { name: "", date: "", time: "", agenda: "" };
	}
}

/**
 * メイン関数: 全会議データをスクレイピング
 */
export async function scrapeMeetings(): Promise<MeetingData[]> {
	console.log("Starting to scrape OCCTO committee meetings...");

	// JSONエンドポイントから委員会スケジュールを取得 (日付フィルター済み)
	const entries = await parseNewsJson();

	console.log(
		`Found ${entries.length} meetings from OCCTO JSON (filtered to current + next 2 months)`,
	);

	const meetings: MeetingData[] = [];

	// 各エントリーの詳細ページから情報を取得
	for (const entry of entries) {
		console.log(`Fetching details for: ${entry.name}`);

		const { name, date, time, agenda } = await parseDetailPage(entry.detailUrl);

		// dateが空の場合はスキップ
		if (!date) {
			console.log(`Skipping entry due to missing date: ${entry.detailUrl}`);
			continue;
		}

		meetings.push({
			name, // 詳細ページのh1タグから取得
			date, // 詳細ページから取得
			time, // 詳細ページから取得
			agenda, // 詳細ページから取得
			detailUrl: entry.detailUrl,
		});

		// レート制限: サーバー負荷を避けるため500ms待機
		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	console.log(`Successfully scraped ${meetings.length} meetings`);

	return meetings;
}
