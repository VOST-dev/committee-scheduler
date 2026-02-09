/**
 * 会議データの型定義
 */
export interface MeetingData {
	name: string; // 審議会名
	date: string; // 開催日 (YYYY-MM-DD形式)
	time: string; // 開催時間 (HH:MM～HH:MM形式)
	agenda: string; // 議題
	detailUrl: string; // 詳細ページURL (一意キー)
}
