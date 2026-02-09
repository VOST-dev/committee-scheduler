import * as cheerio from "cheerio";
import type { MeetingData } from "@/definitions/types";
import { fetchWithUserAgent } from "@/utils/http";

const BASE_URL = "https://wwws.meti.go.jp/interface/honsho/committee/index.cgi";
const LIST_URL = `${BASE_URL}/committee`;

/**
 * 日付文字列を YYYY-MM-DD 形式に変換
 * 例: "2026年1月19日(月)" -> "2026-01-19"
 * パースできない場合は元の文字列をそのまま返す
 */
function parseDate(dateStr: string): string {
	const match = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
	if (!match) {
		console.warn(`Failed to parse date: ${dateStr}`);
		return dateStr;
	}

	const [, year, month, day] = match;
	if (!year || !month || !day) {
		console.warn(`Failed to parse date: ${dateStr}`);
		return dateStr;
	}

	return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * 一覧ページから会議エントリーを抽出
 */
function parseListPage(
	html: string,
): Array<{ name: string; date: string; detailUrl: string }> {
	const $ = cheerio.load(html);
	const meetings: Array<{ name: string; date: string; detailUrl: string }> = [];

	// 開催案内セクションのテーブルを探す
	$("table.tbl-si tr").each((_, row) => {
		const $row = $(row);

		// 日付列 (th要素)
		const dateCell = $row.find("th").first();
		const dateText = dateCell.text().trim();

		// 会議名列 (td要素内のリンク)
		const nameLink = $row.find("td a").first();
		const name = nameLink.text().trim();
		const href = nameLink.attr("href");

		if (name && href && dateText) {
			const date = parseDate(dateText);

			// URLの構築: hrefがルート相対パスか判断
			let detailUrl = href;
			if (href.startsWith("http")) {
				detailUrl = href;
			} else if (href.startsWith("/")) {
				// ルート相対パスの場合 (例: /interface/...)
				const host = "https://wwws.meti.go.jp";
				detailUrl = `${host}${href}`;
			} else {
				// 相対パスの場合 (あるかわからないが念のため BASE_URL 基準)
				detailUrl = `${BASE_URL}/${href}`;
			}

			meetings.push({
				name,
				date,
				detailUrl,
			});
		}
	});

	return meetings;
}

/**
 * 詳細ページから時間と議題を抽出
 */
async function parseDetailPage(
	url: string,
): Promise<{ time: string; agenda: string }> {
	try {
		const html = await fetchWithUserAgent(url);
		const $ = cheerio.load(html);

		let time = "";
		let agenda = "";

		// h3タグを探して、その次の要素からデータを取得
		$("h3, H3").each((_, elem) => {
			const $elem = $(elem);
			const headerText = $elem.text().trim();

			if (headerText.includes("日時")) {
				// 次の要素 (通常は<p>タグ) からテキストを取得
				const nextElem = $elem.next();
				if (nextElem.length > 0) {
					const fullText = nextElem.text().trim();

					// "時間" を含む部分を探す、または正規表現で抽出
					// HTMLでは &nbsp; などが含まれることがあるので、文字コードに注意
					const timeMatch = fullText.match(
						/(\d{1,2}時\d{2}分～\d{1,2}時\d{2}分)/,
					);
					if (timeMatch) {
						time = timeMatch[1] ?? "";
					} else {
						// パターンにマッチしない場合はテキスト全体を入れておく(後で確認用)
						time = fullText.replace(/[\n\r]/g, " ").trim();
					}
				}
			} else if (headerText.includes("議題")) {
				// 次の要素のテキストを取得
				const nextElem = $elem.next();
				if (nextElem.length > 0) {
					// リストの場合は項目を結合
					if (nextElem.is("ul") || nextElem.is("ol")) {
						agenda = nextElem
							.find("li")
							.map((_, li) => $(li).text().trim())
							.get()
							.join("\n");
					} else {
						agenda = nextElem.text().trim();
					}
				}
			}
		});

		return { time, agenda };
	} catch (error) {
		console.error(`Failed to parse detail page ${url}:`, error);
		return { time: "", agenda: "" };
	}
}

/**
 * メイン関数: 全会議データをスクレイピング
 */
export async function scrapeMeetings(): Promise<MeetingData[]> {
	console.log("Starting to scrape METI committee meetings...");

	// 1. 一覧ページを取得
	const listHtml = await fetchWithUserAgent(LIST_URL);
	const listEntries = parseListPage(listHtml);

	console.log(`Found ${listEntries.length} meetings on list page`);

	// 2. 各詳細ページを取得
	const meetings: MeetingData[] = [];

	for (const entry of listEntries) {
		console.log(`Fetching details for: ${entry.name}`);

		const { time, agenda } = await parseDetailPage(entry.detailUrl);

		meetings.push({
			name: entry.name,
			date: entry.date,
			time,
			agenda,
			detailUrl: entry.detailUrl,
		});

		// サーバーに負荷をかけないよう少し待機
		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	console.log(`Successfully scraped ${meetings.length} meetings`);
	return meetings;
}
