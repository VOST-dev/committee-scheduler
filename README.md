# committee-scheduler

経済産業省の審議会開催案内をスクレイピングして、Googleスプレッドシートに保存するNode.jsアプリケーション

## Required

- [mise](https://mise.jdx.dev/)

## セットアップ

### 1. 依存関係のインストール

```bash
mise trust
mise install
bun install
```

### 2. Google Cloud Platform の設定

1. Google Cloud Consoleでプロジェクトを作成
2. Google Sheets APIを有効化
3. サービスアカウントを作成し、キーをダウンロード
4. ダウンロードしたキーを `credentials/service-account-key.json` に保存

### 3. Googleスプレッドシートの設定

1. 対象のスプレッドシートを作成
2. サービスアカウントのメールアドレスに編集権限を付与
3. `mise.toml` 内の `SPREADSHEET_ID` を更新

### 4. Google Workspaceの設定

1. [ドメイン全体の委任](https://developers.google.com/identity/protocols/oauth2/service-account?hl=ja#delegatingauthority) から、サービスアカウントのクライアントIDを設定
2. OAuthスコープに以下を設定
  - https://www.googleapis.com/auth/spreadsheets
  - https://www.googleapis.com/auth/drive

## 実行方法

### 手動実行

```bash
mise run sync
```

### cron設定例

```bash
# crontab -e で設定
# 毎日 日本時間の午前9時に実行(サーバーのタイムゾーンはUTC)
0 0 * * * /usr/bin/mise run -C /home/ubuntu/committee-scheduler sync 2>&1
```