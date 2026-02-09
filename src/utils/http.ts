import { USER_AGENT } from "@/definitions/constants";

/**
 * User-Agentを設定してHTMLを取得
 */
export async function fetchWithUserAgent(url: string): Promise<string> {
	const response = await fetch(url, {
		headers: {
			"User-Agent": USER_AGENT,
		},
	});

	if (!response.ok) {
		throw new Error(
			`Failed to fetch ${url}: ${response.status} ${response.statusText}`,
		);
	}

	return await response.text();
}
