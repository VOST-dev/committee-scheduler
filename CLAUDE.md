# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Bun-powered TypeScript application that scrapes committee meeting schedules from two Japanese government organizations and synchronizes them to Google Sheets:
- **METI** (経済産業省): Ministry of Economy, Trade and Industry
- **OCCTO** (電力広域的運営推進機関): Organization for Cross-regional Coordination of Transmission Operators

Designed to run via cron for automated updates. Each source has independent scraping logic and dedicated Google Sheets.

## Essential Commands

### Development
```bash
# Format and lint code
mise run lint
# or
bun run check

# Manual sync execution
mise run sync
```

### Setup Requirements
1. Install mise and dependencies:
   ```bash
   mise trust
   mise install
   bun install
   ```

2. Configure Google Cloud Platform:
   - Enable Google Sheets API
   - Create service account and download key
   - Place key at `credentials/service-account-key.json`
   - Grant service account edit access to target spreadsheet

3. Update environment variables in `mise.toml`:
   - `SPREADSHEET_ID`: Target Google Sheets ID
   - `GOOGLE_APPLICATION_CREDENTIALS`: Path to service account key (already configured)

## Architecture

### Data Flow
```
┌─ METI Website → METI Scraper ─┐
│                                 ├→ MeetingData[] → Sheets Editor → Google Sheets
└─ OCCTO JSON/Web → OCCTO Scraper┘                        ↓
                                                  Execution History Logs
                                                  (separate per source)
```

**Sequential Processing**: METI scraping completes fully before OCCTO scraping begins. Each source updates its own sheet and logs independently.

### Directory Structure
```
src/
├── index.ts                    # Entry point: orchestrates both scrapers sequentially
├── definitions/
│   ├── types.ts               # MeetingData interface (name, date, time, agenda, detailUrl)
│   └── constants.ts           # USER_AGENT string
├── features/
│   ├── scrape/
│   │   ├── meti/
│   │   │   └── scraper.ts     # METI: HTML table scraping → detail pages
│   │   └── occto/
│   │       └── scraper.ts     # OCCTO: JSON API → filtered detail pages
│   └── sheets/
│       └── editor.ts          # Google Sheets operations (upsert, logging)
└── utils/
    └── http.ts                # fetchWithUserAgent helper
```

### Key Design Patterns

**Dual Scraper Architecture**: Two completely independent scrapers with different strategies:
- **METI**: HTML table parsing → detail page scraping
- **OCCTO**: JSON API (category filtered) → detail page scraping with date range filter (current month + next 2 months)

**Upsert Logic**: Uses `detailUrl` as unique key. Fetches existing sheet data, builds URL→rowIndex map, then either updates existing rows or appends new ones. Same logic for both sources.

**Rate Limiting**: Both scrapers include 500ms delay between detail page requests to avoid server overload.

**Time Format Flexibility**: OCCTO scraper handles two time formats:
- Japanese: "18時00分～20時00分"
- Western: "15:00～17:00"

**Error Handling**: Errors logged to respective execution history sheets with JST timestamps. Global errors logged to both history sheets. Process exits with code 1 on failure.

**Sheet Structure** (4 total sheets, 2 per source):
- Main sheet columns: 審議会名, 開催日, 開催時間, 議題, 詳細URL
- History sheet columns: 実行日時, ステータス, 処理件数, エラー詳細
- Sheet names:
  - METI: `"経済産業省"` (main), `"経済産業省_実行履歴"` (history)
  - OCCTO: `"電力広域的運営推進機関"` (main), `"電力広域的運営推進機関_実行履歴"` (history)

## Code Style

- **Formatter**: Biome with tabs for indentation, double quotes for strings
- **TypeScript**: Strict mode enabled with `noUncheckedIndexedAccess`
- **Path Aliases**: `@/*` maps to `./src/*`
- **Runtime**: Bun 1.3+ (specified in mise.toml)

## Testing Strategy

No automated tests currently. Manual testing via `mise run sync` validates:
1. Scraping successfully fetches meetings
2. Date parsing converts "YYYY年MM月DD日" to "YYYY-MM-DD"
3. Upsert logic correctly updates vs inserts
4. Execution history logs success/failure

## Important Notes

- **Credential Security**: Never commit `credentials/service-account-key.json`. Already in `.gitignore`.
- **Sheet Names**: Hardcoded in `src/index.ts` - 4 sheets total (see Key Design Patterns above)
- **URL Construction**: Both scrapers handle root-relative and absolute URLs differently
- **METI Implementation**: Standard HTML table scraping from list page
- **OCCTO Implementation**:
  - Uses JSON API endpoint: `https://www.occto.or.jp/_include/json/news-list.json`
  - Filters by `category.id=50` and `category.parent_id=0`
  - Date filtering: Current month + next 2 months only
  - Supports dual time formats (Japanese "18時00分～20時00分" and Western "15:00～17:00")
- **Sequential Execution**: METI completes fully before OCCTO begins - not parallel
- **Independent Failure**: If METI fails, OCCTO still attempts to run (caught at top level)
