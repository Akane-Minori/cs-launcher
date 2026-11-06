# クリエイティブスタッフ・ゲームランチャー 引き継ぎ書

作成日: 2026年8月28日時点の状態を基準に記載しています。
このドキュメント単独で、実装内容・仕組み・引き継ぎ事項がすべて分かるようにまとめています。
対象読者: TypeScriptやRustに詳しくない方でも読み進められるよう、専門用語には簡単な補足を入れています。

---

## 1. プロジェクト概要

Tauri(フロントエンド: TypeScript / バックエンド: Rust)で作られたデスクトップ製ゲームランチャーです。
自前のアプリケーションサーバーは持たず、**Cloudflare R2(オブジェクトストレージ)+ Cloudflare Worker(軽量なAPIプロキシ)** に置いたJSONファイルとゲーム本体ファイルを読み込んで動作します(2026年8月28日、Googleドライブから移行済み)。

- ダウンロード型のゲーム: R2からzipをダウンロード→自動で展開→実行
- ブラウザ型のゲーム(unityroom作品など): 既定のブラウザでURLを開くだけ
- タグ・作者・タイトル・説明文で絞り込み・検索ができる
- 「キャンペーン」画面で、注目ゲームを特集形式で表示できる
- 対応OS: Windows(現状の開発・確認はすべてWindows上)
- 保存先: ランチャーの実行ファイルと同じフォルダにある `Games` フォルダ

### プロジェクト構成(2つのリポジトリ/フォルダに分かれている)

```
program/tauri/
├── cs-launcher/    ← Tauriアプリ本体(このHANDOVER.mdもここに置く想定)
└── r2-worker/      ← Cloudflare Workerプロジェクト(R2の前段のAPIプロキシ)
```

**この2つは完全に独立してビルド・デプロイされます。** ダウンロード先やAPIまわりの変更をするときは、基本的に両方に手を入れる必要があります。

- `r2-worker`側の変更 → `npx wrangler deploy`(または`pnpm wrangler deploy`)でCloudflareにデプロイ。これでWorkerのAPIの中身(どのURLに何を返すか)が変わる
- `cs-launcher`側の変更 → アプリ本体を`pnpm tauri build`で再ビルド・再配布しないと反映されない

## 2. 実装済みの機能一覧

### 基本機能
- ゲーム一覧のグリッド表示(サムネイル・タグ・説明の要約)
- ゲーム詳細モーダル(画像スライドショー・全画面プレビュー・タグ・作者・説明文全文)
- ダウンロード型ゲーム: R2からzipをダウンロード→自動展開→起動
- ブラウザ型ゲーム: 既定のブラウザでURLを開く
- ダウンロード済みゲームのアンインストール(フォルダ削除)
- ダウンロード済みゲームのフォルダを開く/全ゲーム共通の保存先フォルダを開く
- タグ・作者(複数可)・タイトル・**説明文**による絞り込み検索(すべて併用可能)
- キャンペーン画面(複数キャンペーンを縦に段組み表示、各キャンペーンに見出し+説明文)
- ライトモード/ダークモードの切り替え(設定は端末に保存され次回起動時も引き継がれる)
- サイドバー固定表示(スクロールしても動かない)
- アプリアイコンの差し替え対応(`tauri icon`コマンドで生成)
- ★お気に入り(`localStorage`に端末単位で保存、サイドバーに専用ビュー)
- 最近遊んだ(`localStorage`に最大30件記録、サイドバーに専用ビュー)
- 🎲 今日の1本(ガチャ): サイドバーのボタンから、ランダムに1本選んで詳細モーダルを開く
- プレイ後メモ(`localStorage`保存、入力0.4秒後に自動保存)
- 紹介画像の保存: サムネイル+タイトル+タグを合成したPNGを、OSの保存ダイアログ経由でファイルに書き出す
- 作者名のクリック絞り込み(詳細モーダル内)
- 詳細モーダルからの操作(「プレイ / ブラウザで開く / フォルダを開く / アンインストール」ボタンとダウンロード進捗バー)
- 選択中タグ・作者チップを一覧の先頭に表示
- ページネーション(ゲーム一覧・お気に入り・最近遊んだの各ビューで30件ごと。キャンペーン画面は対象外)
- **各ゲームの容量サイズ表示**: ダウンロード済みならローカルの実容量、未ダウンロードならR2側の配信サイズを表示(※現在不具合あり。0節参照)

### UI/表示の改善(実装済み)
- ゲームカードのアクションボタンを、説明文やタグの量に関わらずカード下端に揃うよう修正
- ゲームカードの説明文を、カードの余白に応じて表示行数を動的に増やすよう改善(11節参照。ウィンドウリサイズ時の再計算は未対応)
- キャンペーン画面を開いた瞬間に一覧表示のカードが巨大表示されてしまう不具合を修正
- フルスクリーン画像プレビューが小さく表示される不具合を修正(高解像度画像を別途要求)
- ゲーム一覧の横スクロール問題、タグ・作者チップの横スクロール化への対応

## 3. 全体のしくみ(フロントエンドとバックエンドの関係)

Tauriというフレームワークで作られたデスクトップアプリです。Tauriのアプリは、
**画面を描画する部分(フロントエンド)** と **OSのファイル操作やネットワーク通信を行う部分(バックエンド)** の
2つのプログラムが1つのアプリの中で協力して動きます。

```
┌────────────────────────────┐        ┌─────────────────────────────┐
│  フロントエンド (TypeScript)  │        │  バックエンド (Rust)           │
│  画面の見た目・クリック処理など │ <----> │  ファイル操作・ダウンロード・   │
│  ブラウザに近い技術           │ invoke │  ブラウザを開く、ダイアログ、など │
└────────────────────────────┘        └─────────────────────────────┘
                                                     │
                                                     │ HTTPS
                                                     ▼
                                        ┌─────────────────────────────┐
                                        │  Cloudflare Worker(r2-worker) │
                                        │  R2バケットへのアクセスを中継   │
                                        └─────────────────────────────┘
                                                     │
                                                     ▼
                                        ┌─────────────────────────────┐
                                        │  Cloudflare R2(バケット: cs-launcher)│
                                        │  games.json / campaigns.json / Games/ │
                                        └─────────────────────────────┘
```

フロントエンドからバックエンドの機能を呼び出すときは、`invoke('関数名', {引数})` という
専用の関数を使います。逆にバックエンドからフロントエンドに「ダウンロードが○%進んだよ」のような
通知を送るときは `emit`(発行する)という仕組みを使い、フロントエンド側は `listen`(聞く)で受け取ります。

**設計方針として、`invoke`を書くのはフロントエンド内で`api.ts`ファイルのみに統一しています。** 他のファイルは`api.ts`が用意した関数を呼ぶだけで、直接バックエンドとやり取りしません。

Rustバックエンドは、Googleドライブの代わりに**Cloudflare Worker(`r2-worker`)** へHTTPSリクエストを送ることでデータを取得します。Workerがさらに背後のR2バケットからファイルを読み出して返す、という2段構成です。

## 4. 用語ミニ辞典(先に読むと後の説明が分かりやすくなります)

| 用語 | 意味 |
|---|---|
| `async function` / `await` | 「時間がかかる処理(通信やファイル操作)が終わるまで待つ」ための書き方。`await`が付いている行は、その処理が終わるまで次の行に進まない |
| `Promise` | 「まだ終わっていないけど、いずれ結果が返ってくる処理」を表す入れ物。`async function`は必ず`Promise`を返す |
| `interface` (TS) | オブジェクトの「型(かたち)」を定義するもの。「このデータには必ずtitleという文字列がある」のようなルールを決められる |
| `?` が付いたプロパティ (例: `author?: string`) | そのプロパティが「無くてもよい(省略可能)」という意味 |
| `null` | 「値が存在しないことを意図的に表す」値。TypeScriptでは`string \| null`のように「文字列 または null」という型がよく出てくる |
| `Result<T, E>` (Rust) | 「成功したら`T`型の値、失敗したら`E`型のエラーを返す」という型。Rustには例外(try-catch)の代わりにこれを使う場面が多い |
| `?` 演算子 (Rust, 例: `foo()?`) | `Result`を返す関数の後ろに付けると、「エラーだったらそこで処理を中断してエラーを返す、成功していたら中身の値を取り出す」という意味になる |
| `map_err(...)` | `Result`が持っているエラーの型を、別の型(ここでは`String`)に変換するための関数 |
| `&` (Rust) | 値の「参照」を表す記号。値そのものではなく「値がある場所への案内」を渡すイメージ |
| クロージャ (Rust, 例: `move \|\| { ... }`) | その場で作る無名の関数。`move`が付くと、周囲の変数の所有権をそのクロージャの中に取り込む |
| `unwrap` / `unwrap_or(...)` | `Result`や`Option`(値があるかもしれないし無いかもしれない型)から、中身の値を強制的に取り出す。`unwrap_or`は失敗時に代わりの値を使う安全な書き方 |
| `localStorage` | ブラウザ(Tauriのウィンドウ内部もこれを持つ)が提供する、アプリを閉じても消えない端末単位の保存領域。文字列しか保存できないため、配列やオブジェクトは`JSON.stringify`/`JSON.parse`で変換して使う |
| デバウンス(debounce) | 短時間に連続して発生するイベント(タイピングなど)に対し、「最後の入力から一定時間経ってから1回だけ処理する」ようにする手法。プレイ後メモの自動保存で使用 |
| Worker(Cloudflare Workers) | Cloudflareのネットワーク上で動く、小さなサーバーレス関数。ここではR2バケットへのアクセスを中継するAPIとして使っている |
| R2 | Cloudflareが提供するオブジェクトストレージ(AWS S3のようなもの)。データ転送量(egress)が無料なのが最大の特徴 |
| `wrangler` | Cloudflare Workersの開発・デプロイ用コマンドラインツール |

---

## 5. フロントエンド(`cs-launcher/src/` 配下、TypeScript)

### 5-1. `types.ts` — データの「型」の定義

このアプリで扱うデータの形を定義しているだけのファイルです。処理は何もしません。

- `GameType`: `'download'`(ダウンロード型) か `'web_link'`(ブラウザ型)のどちらか
- `GameStatus`: ゲームの状態。`'not_downloaded'`(未DL) / `'downloading'`(DL中) / `'downloaded'`(DL済み)
- `GameEntry`: ゲーム1本分のデータの形。`games.json`の各要素がこの形になっている(R2移行後の最新の形は以下)
  ```typescript
  export interface GameEntry {
    id: string;
    title: string;
    description: string;
    tags: string[];
    type: GameType;
    thumbnail_path: string;           // Games/{id}/ からの相対パス
    screenshot_paths?: string[];      // 同上、複数可
    authors?: string[];

    // type: "download" のときに使う
    archive_filename?: string;        // Games/{id}/ からの相対パス(例: "口づけ.zip")
    exe_relative_path?: string;

    // type: "web_link" のときに使う
    url?: string;
  }
  ```
- `Campaign`: キャンペーン1件分のデータの形。`campaigns.json`の各要素がこの形になっている

### 5-2. `config.ts`(新規) — Worker側APIのベースURL

```typescript
export const API_BASE = 'https://cs-launcher-api.akane-minori-cslauncher.workers.dev';
```

フロントエンド側で直接URLを組み立てる必要がある箇所(後述の`thumb.ts`)のために、Worker URLをここに集約している。

### 5-3. `thumb.ts` — 画像URLを組み立てる(副作用なし)

```typescript
export function thumbUrl(gameId: string, path: string): string {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${API_BASE}/games/${encodeURIComponent(gameId)}/${encodedPath}`;
}
```

ゲームIDと(`Games/{id}/`からの)相対パスを受け取り、`<img>`タグにそのまま使える画像URLの文字列を作って返すだけの、とても小さな関数です。日本語ファイル名やスペースを含むパスにも対応するため、`/`区切りの階層ごとにURLエンコードしている。
Googleドライブ時代にあった`size`引数(動的リサイズ)はR2には無いため廃止。表示サイズはCSS側で調整する。
**バックエンド呼び出し(`invoke`)は含みません** — サムネイル画像を`base64`データとして取得する処理(Canvas合成用)は`api.ts`側の`fetchThumbnailDataUrl`が担当します。

### 5-4. `theme.ts` — ダークモード/ライトモードの切り替え

- `getStoredTheme()`: `localStorage`(キー: `cs-launcher-theme`)から、前回選んだテーマを読み出す。保存されていなければ`'dark'`を返す
- `applyTheme(theme)`: HTML全体に`data-theme`という目印を付ける。CSS側はこの目印を見て色を切り替える。同時に`localStorage`にも保存する
- `toggleTheme()`: 今のテーマと逆のテーマに切り替えて、`applyTheme`を呼ぶ

### 5-5. `api.ts` — バックエンド呼び出しをまとめる窓口

フロントエンドの他のファイルは、直接`invoke`を書かずに、この`api.ts`が用意した関数を呼ぶようにしています。

- `listGames()`: `fetch_remote_json`(Rust側のコマンド、引数`{ path: 'games.json' }`)を呼び、中身を文字列で受け取り`JSON.parse`する
- `listCampaigns()`: 同様に`{ path: 'campaigns.json' }`を取得する
- `getGameStatus(gameId)`: そのゲームがダウンロード済みかどうかをRust側に問い合わせる
- `downloadGame(game, onProgress)`: `download_game`に`{ gameId, archiveFilename: game.archive_filename ?? 'game.zip' }`を渡してダウンロードを開始する。`download-progress`イベントを`listen`で受け取り、`onProgress`を呼ぶ。終わったら`unlisten()`を必ず呼ぶ(`finally`ブロック)
- `playGame(game)`: ゲームの種類によって処理を分岐する。`web_link`ならブラウザで開き、`download`ならローカルの実行ファイルを起動する。「最近遊んだ」記録(`recordPlay`)も同時に行う
- `openGameFolder(gameId)` / `openGamesRootFolder()`: フォルダをエクスプローラーで開く
- `uninstallGame(gameId)`: ゲームフォルダを削除する
- `fetchThumbnailDataUrl(gameId, path)`: サムネイル画像を`base64`のdata URLとして取得する(Rust経由)。Canvasでピクセルを読み取る場合はCORSの制約で失敗する(canvasが「汚染」される)ため、Rust側でバイト列を取得して渡している。紹介画像の生成(`share.ts`)で使用
- `savePng(base64Data, suggestedName)`: 紹介画像PNGのbase64データを渡し、Rust側でOS標準の保存ダイアログを表示してファイルに書き込む
- `getGameFolderSize(gameId)`: **(新規)** ダウンロード済みフォルダのローカル合計容量(バイト)を取得する
- `getRemoteFileSize(gameId, path)`: **(新規)** ダウンロード前に、R2側のファイルサイズ(バイト)をHEADリクエストで取得する

### 5-6. `formatBytes.ts`(新規) — バイト数の整形

```typescript
export function formatBytes(bytes: number): string {
  // 0 B / 1.5 KB / 12 MB / 3.2 GB のような文字列に変換する
}
```

### 5-7. `folderSize.ts`(新規) — 容量表示の共通ロジック

ゲームカード・詳細モーダルの両方から使う共通関数。

- `renderFolderSize(el, gameId)`: ダウンロード済み時、`getGameFolderSize`でローカル実容量を取得して`容量: 118 MB`のように表示する
- `renderRemoteSize(el, gameId, archiveFilename)`: 未ダウンロード時、`getRemoteFileSize`でR2側の配信サイズを取得して`ダウンロード容量: 120 MB`のように表示する
- `hideFolderSize(el)`: 要素を非表示にする
- いずれも内部で`try/catch`しており、失敗時は静かに非表示にするだけでエラーを表面化させない(0節の不具合の温床になっているため、デバッグ時は要注意)

### 5-8. `gameActions.ts` — ダウンロード/プレイ操作の共通ロジック

ゲームカードと詳細モーダルの両方で「ダウンロード・プレイ・フォルダを開く・アンインストール」ボタンを表示する必要があるため、ロジックをここに1つにまとめています。

- `renderGameActions(els, game, status, onStatusChange)`: `status`(ゲームの状態)に応じて出すボタンを切り替える
  - ブラウザ型 → 「ブラウザで開く」ボタンのみ
  - 未DL → 「ダウンロード」ボタン(押すとダウンロードが始まり、進捗バーが表示される。終わったら`onStatusChange('downloaded')`を呼んで呼び出し元に状態変化を伝える)
  - DL済み → 「プレイ」「フォルダを開く」「アンインストール」の3つ
- `makeButton(label, onClick, extraClass)`: ボタン要素を作る共通の部品
- 呼び出し元(`gameCard.ts` / `gameModal.ts`)は、それぞれ自分のDOM要素(ボタン置き場・進捗バー)を`els`として渡すだけで、ボタンの中身やダウンロードのロジックそのものは書かなくてよい

### 5-9. `gameCard.ts` — 一覧画面の1枚のカードを作る

- `createGameCard(game, onTagClick, onAuthorClick, onFavoriteChange)`: ゲーム1本分のカード(サムネ・お気に入り星・タイトル・タグ・説明・容量表示・ボタン)のHTML要素を組み立てて返す。カードをクリックすると詳細モーダルが開く(ただしボタン部分・星ボタンをクリックしたときは開かないよう`closest(...)`でチェックしている)
- テンプレート内に`<div class="game-card__size" hidden></div>`(容量表示用)を含む
- カード生成時に`renderGameActions`(5-8節)を呼んでボタン部分を描画し、状態が変わるたびに`updateActions`で再描画する。`updateActions`内で状態に応じて`renderFolderSize` / `renderRemoteSize` / `hideFolderSize`を呼び分ける
- 星ボタンをクリックすると`toggleFavorite(game.id)`(5-13節)でお気に入り状態を切り替え、見た目を更新し、呼び出し元に`onFavoriteChange()`で通知する
- `escapeHtml(text)`: ゲームタイトルなどの文字列に`<`や`>`のようなHTMLの特殊文字が含まれていても、意図しないHTMLとして解釈されないよう無害化する

### 5-10. `gameModal.ts` — 詳細画面(モーダル)

- `openDetailModal(game, onTagClick, onAuthorClick, onFavoriteChange)`: 画面全体を覆う半透明の背景(オーバーレイ)と、その中央にゲームの詳細情報を表示する。主な要素:
  - `modal__carousel`: サムネイル画像とスクリーンショットをまとめてスライド表示する部分(`thumbUrl(game.id, path)`で各画像URLを組み立てる)。画像が2枚以上あるときだけ、矢印ボタンと下部のドット(●)が表示される
  - `showSlide(index)`: 表示する画像を切り替える内部関数。`(index + images.length) % images.length`という計算で、「1番左の画像で前へ進むと1番右の画像に戻る」というループ処理を実現している
  - `#modal-size`: 容量表示用の要素(5-7節)
  - タグ・作者名をクリックすると、対応するコールバック(`onTagClick` / `onAuthorClick`)を呼び出したうえでモーダルを閉じる
  - お気に入りボタン、プレイ後メモ(テキストエリア。入力の0.4秒後に自動保存)、「🖼 紹介画像を保存」ボタンもここで描画・配線している
  - モーダルを開いた直後に、非同期で`getGameStatus`を呼んでダウンロード状態を取得し、`renderGameActions`(5-8節)で操作ボタンを描画する。同時に容量表示も更新する
  - Escキーで閉じる、矢印キーで画像を送る、といったキーボード操作にも対応
- `openImagePreview(gameId, path)`: 画像をクリックしたときに、`thumbUrl(gameId, path)`で画像URLを組み立て、その画像だけを全画面に近いサイズで表示する

### 5-11. `topBar.ts` — 件数表示・タグ/作者チップ・検索欄

- `renderTopBar(...)`: 一覧画面の上部を描画する。渡された`games`配列からタグと作者の出現回数を集計し(`Map`を使用)、多い順に並べてボタン(チップ)として表示する
- **選択中のタグ・作者があれば、その項目を配列の先頭に移動してから描画する**(見つけやすく、外しやすくするため)
- タグ・作者のボタンをクリックすると、既に選択中のものと同じなら`null`(選択解除)を、違うものならそのタグ/作者名を、呼び出し元へ伝える
- 検索欄は**タイトルと説明文の両方**を対象に絞り込む(プレースホルダーは「タイトル・説明で検索」)
- 検索欄には**日本語入力(IME)対策**が入っている。`input`イベントの`e.isComposing`が`true`の間(変換確定前)は何もせず、`compositionend`(変換確定時)になってから検索を実行する

### 5-12. `sidebar.ts` — 左側のサイドバー

- `renderSidebar(...)`: 「キャンペーン」「ゲーム一覧」「★お気に入り」「最近遊んだ」の切り替えボタン、「🎲 今日の1本」ボタン、「ゲーム一覧フォルダを開く」ボタン、テーマ切り替えボタンを描画する
- テーマ切り替えボタンを押すと`toggleTheme()`を呼び、サイドバー自身をもう一度描画し直して、ボタンの文言を更新する
- 「🎲 今日の1本」ボタンは、押されると呼び出し元(`main.ts`)の`onGacha`コールバックを呼ぶだけで、ランダム選出のロジック自体は`main.ts`側にある

### 5-13. `campaignView.ts` — キャンペーン画面

- `renderCampaigns(...)`: `campaigns.json`の各キャンペーンについて、`game_ids`(ゲームIDの配列)を実際のゲームデータに変換し、見出し・説明文・ゲームカードのグリッドを「段」として縦に並べて表示する
- `gameMap`という`Map`を使って「IDからゲームデータをすぐ探せる索引」を作ってから使っている
- 該当するゲームが1本もないキャンペーンは表示しない

### 5-14. `favorites.ts` / `recentlyPlayed.ts` / `notes.ts` — 端末保存のユーザーデータ

いずれも`localStorage`だけで完結する小さなモジュールで、Rust側とは通信しません。

- `favorites.ts`: お気に入りにしたゲームIDの集合(`Set`)を保存・読み出しする(`isFavorite` / `toggleFavorite` / `getFavoriteIds`)
- `recentlyPlayed.ts`: 「ゲームID + 遊んだ日時」の記録を新しい順に最大30件保持する(`recordPlay` / `getRecentlyPlayedIds`)
- `notes.ts`: ゲームIDをキーにした感想メモの辞書を保存する(`getNote` / `setNote`)。空文字にすると該当ゲームのメモを削除する

### 5-15. `share.ts` — 紹介画像(PNG)の生成

- `shareGame(game)`: `<canvas>`要素を使い、サムネイル画像・タイトル・タグを1枚のPNG画像として合成する
  1. `api.ts`の`fetchThumbnailDataUrl(game.id, game.thumbnail_path)`でサムネイルをbase64画像として取得(CORS回避のためRust経由)
  2. `drawImageCover(...)`でサムネイルを画像の上部にトリミング配置
  3. 下部に半透明の帯を敷き、タイトル(`wrapText`で自動折り返し、最大2行)とタグ一覧を描画
  4. 完成したcanvasを`toDataURL('image/png')`でbase64文字列に変換し、`api.ts`の`savePng`を呼んでRust側に保存させる
- `loadImage` / `drawImageCover` / `wrapText`: Canvas描画を補助する小さな関数群

### 5-16. `pagination.ts` — ページネーションUI

- `renderPagination(container, currentPage, totalPages, onPageChange)`: 「前へ / ○ページ目 / 次へ」の表示を作る。総ページ数が1以下のときは何も表示しない

### 5-17. `main.ts` — 全体の司令塔

このアプリで唯一「状態(今どのビュー・タグ・ページが選ばれているか、など)」を保持しているファイルです。

- ファイルの先頭にある`let allGames`や`let activeTag`、`let currentPage`などは、アプリ全体で共有される「今の状態」を表す変数
- `init()`: アプリ起動時に1回だけ実行される。サイドバーを描画し、`listGames()`でゲーム一覧を取得し、画面を描画する
- `handleNavigate` / `handleTagClick` / `handleAuthorClick` / `handleTitleQueryChange` / `handlePageChange` / `handleGacha` / `handleFavoriteChange`: イベントハンドラ群。絞り込み条件を変えるハンドラは、状態を書き換えたあと`currentPage`を1に戻し、必ず`renderContent()`を呼んで画面を再描画する
- `getBaseGames()`: 現在の`activeView`(`'all'` / `'favorites'` / `'recent'`)に応じて、絞り込みの土台となるゲーム配列を組み立てる
- `renderContent()`: 今の状態にもとづいて画面を描画し直す。タグ・作者・検索文字列(タイトル+説明文)で絞り込んだ後、`PAGE_SIZE`(30)件ずつに`slice`して現在ページ分だけをカード化する
- 検索欄のフォーカスがずれないよう、再描画の前後で「今フォーカスが当たっていたかどうか」「カーソル位置」を保存・復元する処理が入っている

---

## 6. バックエンド(`cs-launcher/src-tauri/src/`, Rust)

### 6-1. `lib.rs` — アプリの入り口

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
        commands::download::download_game,
        commands::download::get_remote_file_size,
        commands::remote_json::fetch_remote_json,
        commands::image::fetch_thumbnail_base64,
        commands::launch::launch_game,
        commands::launch::open_game_folder,
        commands::launch::is_game_downloaded,
        commands::launch::open_games_root_folder,
        commands::launch::uninstall_game,
        commands::launch::get_game_folder_size,
        // ※ save_png など、11節記載のコマンドも登録されている想定
    ])
    .run(tauri::generate_context!())
    .expect("...");
```

**⚠️ 0節の不具合参照**: `get_game_folder_size`と`get_remote_file_size`がこの一覧に実際に含まれているか、最優先で確認してください。

- `.invoke_handler(tauri::generate_handler![...])`: フロントエンドの`invoke('関数名', ...)`から呼び出せる関数を、ここに列挙して登録する。ここに書いていない関数はフロントエンドから呼べない

### 6-2. `commands/mod.rs` — 共通の道具箱

- `API_BASE`: Cloudflare WorkerのURL定数
  ```rust
  pub const API_BASE: &str = "https://cs-launcher-api.akane-minori-cslauncher.workers.dev";
  ```
- `games_root_dir()`: 「ランチャーの実行ファイルと同じ場所にある`Games`フォルダ」のパスを組み立てる
- `game_dir(game_id)`: `games_root_dir()`の中に、さらにゲームID名のフォルダを1つ足したパスを返す
- `build_asset_url(game_id, relative_path)`: **(新規)** `game_id`と`Games/{id}/`からの相対パスから、Worker経由のアセットURLを組み立てる。`reqwest::Url::path_segments_mut()`で階層ごとにURLエンコードするため、日本語ファイル名やスペースを含んでいても安全。ダウンロード・サムネイル取得の両方で使う共通関数
- (Googleドライブ固有だった`fetch_drive_file` / `extract_confirm_token`は移行に伴い削除済み)

### 6-3. `commands/download.rs` — ダウンロード・容量取得処理

- `download_game(app, game_id, archive_filename)`: R2(Worker経由)からゲームのzipをダウンロードし展開する
  1. `build_asset_url`でURLを組み立て、`reqwest::get`でダウンロード開始
  2. `game_dir`で決まる保存先フォルダを作成
  3. ファイルを少しずつ(`stream`)受け取りながらディスクに書き込み、`app.emit("download-progress", ...)`でフロントエンドに進捗を通知
  4. 書き込みが終わったzipファイルを`zip::ZipArchive`で展開(`spawn_blocking`で別スレッドに任せ、アプリが固まらないようにしている)
  5. 展開後、不要になったzip本体を削除
- `get_remote_file_size(game_id, path)`: **(新規)** ダウンロード前に、R2上のファイルサイズだけをHEADリクエストで取得する(本体は読み込まない、軽量な問い合わせ)

### 6-4. `commands/launch.rs` — 起動・フォルダ操作・アンインストール・容量計算

- `launch_game`: 指定された相対パスの実行ファイルが実際に存在するか確認したうえで、OSのプロセスとして起動する
- `open_game_folder` / `open_games_root_folder`: `opener`プラグインの`open_path`を使って、指定フォルダをエクスプローラーで開く
- `is_game_downloaded`: フォルダが存在し、かつ中身が空でないかどうかを見て、ダウンロード済みかを判定する
- `uninstall_game`: `remove_dir_all`でゲームフォルダをまるごと削除する
- `get_game_folder_size(game_id)`: **(新規)** ダウンロード済みフォルダの合計サイズをバイト単位で再帰的に計算して返す(`dir_size`というヘルパー関数で全ファイルを走査)

### 6-5. `commands/remote_json.rs` — JSON取得用の汎用コマンド

`fetch_remote_json(path)`という1つの関数だけを持つ、小さなファイルです。`{ path: 'games.json' }`のように任意のパスを渡せる汎用設計になっており、`games.json`と`campaigns.json`のどちらの取得にも、この同じ関数が使われています。`build_asset_url`は使わず、`API_BASE`に直接`path`を連結してWorkerへリクエストする。

### 6-6. `commands/image.rs` — サムネイル取得・紹介画像保存

- `fetch_thumbnail_base64(game_id, path)`: サムネイル画像を`build_asset_url`経由で取得し、`base64`のdata URLとして返す。ブラウザの`fetch()`だとCORSでcanvasが「汚染」され`toDataURL`が失敗するため、Rust側で取得している
- `save_png(base64_data, suggested_name)`: 紹介画像PNGのbase64データを受け取り、`base64`クレートでバイト列に変換したうえで、`tauri-plugin-dialog`のファイル保存ダイアログをOS標準の形で表示する。ユーザーが保存先を選んだら`std::fs::write`でファイルに書き込む

---

## 7. `r2-worker`(Cloudflare Workerプロジェクト)

`cs-launcher`とは別フォルダの独立プロジェクトです。JavaScript(型無し)で書かれており、`wrangler`コマンドでCloudflareにデプロイします。

### 7-1. `wrangler.jsonc`

```jsonc
{
  "name": "cs-launcher-api",
  "main": "src/index.js",
  "compatibility_date": "2026-01-01",
  "r2_buckets": [
    {
      "binding": "BUCKET",
      "bucket_name": "cs-launcher"
    }
  ]
}
```

### 7-2. `src/index.js` — ルーティングとR2アクセス

主な役割は「URLパスをR2のオブジェクトキーに変換し、R2から読み出して返す」プロキシです。

- ルーティング:
  - `GET /games.json` → R2の`games.json`
  - `GET /campaigns.json` → R2の`campaigns.json`
  - `GET /games/{game_id}/{相対パス}` → R2の`Games/{game_id}/{相対パス}`(サブフォルダも可)
- `HEAD`メソッドにも対応しており、ファイル本体を読まずに`content-length`ヘッダーだけを返せる(ダウンロード前の配信サイズ表示で利用)
- Rangeリクエスト(範囲指定ダウンロード)にも対応

### 7-3. 実装上、詰まったポイント(今後似た実装をする際の参考)

- **R2の`get()`はrangeオプションを渡していなくても`object.range`が常にセットされる**という仕様がある。「range指定ありかどうか」を`object.range`の有無で判定すると常にtrueになり、意図せず全リクエストが206(Partial Content)を返してしまう。判定は「自分が実際にrangeオプションを渡したかどうか」で行うこと
- **Cache API(`caches.default`)は`*.workers.dev`のサブドメインでは使用できない**。呼び出すと例外(`error code: 1101`)になる。独自ドメインを設定したWorkerでのみ有効。現状はエッジキャッシュを`try/catch`で囲って、失敗時は静かに無視する実装(`safeCacheMatch` / `safeCachePut`)にしている。**将来的に独自ドメインを設定すればキャッシュが効くようになる**(8節の検討事項にも記載)
- `env.BUCKET.get(key, { range: undefined })`のように、値が`undefined`でも「キー自体は存在するオブジェクト」を渡すと、R2側の挙動に影響することがある。rangeが無い場合はオプションオブジェクトに`range`キー自体を含めないこと

### 7-4. デプロイ・確認コマンド(PowerShell例)

```powershell
# r2-worker フォルダで実行
pnpm wrangler deploy

# リアルタイムログの確認
pnpm wrangler tail

# 動作確認(-UseBasicParsingを付けると確認プロンプトが出ない)
Invoke-WebRequest -Uri "https://cs-launcher-api.akane-minori-cslauncher.workers.dev/games.json" -UseBasicParsing
```

デプロイ後のURL: `https://cs-launcher-api.akane-minori-cslauncher.workers.dev`

---

## 8. データファイルの仕様

### `games.json`(R2バケット直下)

```jsonc
[
  {
    "id": "kuchitsuke",               // ユニークなID。campaigns.jsonからも参照される。R2上のGames/{id}/フォルダ名とも一致させる
    "title": "口づけ",
    "description": "説明文。\nで改行できる。",
    "tags": ["アクション", "短時間"],
    "authors": ["山田太郎", "鈴木花子"], // 空配列 [] も可
    "type": "download",               // "download" または "web_link"
    "thumbnail_path": "thumb.jpg",           // Games/{id}/ からの相対パス
    "screenshot_paths": ["スクショ2026-03/1.jpg", "スクショ2026-03/2.jpg"], // 省略可、サブフォルダ可
    "archive_filename": "口づけ.zip",         // type: "download" のとき必須。Games/{id}/ からの相対パス
    "exe_relative_path": "サブフォルダ/game.exe" // zip展開後の実行ファイルへの相対パス
  }
]
```

**ポイント**: `thumbnail_path` / `screenshot_paths` / `archive_filename`は、すべて`Games/{id}/`からの相対パス(ファイル名のみ、またはサブフォルダ込み)で記述する。`id`が既にフォルダ名と一致しているため、フルパスを書く必要はない。日本語ファイル名もそのまま使える(Worker側でURLエンコードされる)。

### `campaigns.json`(R2バケット直下、複数形で確定)

```jsonc
[
  {
    "id": "summer2026",
    "title": "夏の新作特集",
    "description": "説明文(省略可)",
    "game_ids": ["kuchitsuke", "game003"] // games.json側のidを指定
  }
]
```

### R2バケットの構成

```
cs-launcher (バケット名)
├── Games/
│   └── {ゲームID}/
│       ├── {アーカイブファイル}.zip
│       ├── {サムネイル}.jpg
│       └── {スクリーンショット用サブフォルダ}/
│           └── ...
├── games.json
└── campaigns.json
```

### 端末に保存される`localStorage`のキー一覧

R2側のJSONとは別に、以下のデータが**端末単位**で`localStorage`に保存されます(別PCや初期化後は引き継がれません)。

| キー | 内容 |
|---|---|
| `cs-launcher-theme` | ダーク/ライトモードの選択状態 |
| `cs-launcher-favorites` | お気に入りにしたゲームIDの配列 |
| `cs-launcher-recently-played` | 「ゲームID・遊んだ日時」の記録(最大30件) |
| `cs-launcher-notes` | ゲームIDをキーにしたプレイ後メモの辞書 |

---

## 9. 画面遷移の全体像

```
起動
 └→ init() が games.json を取得
     └→ renderContent()
         ├─ activeView === 'all'       → トップバー(検索・絞り込み) + ゲームカードのグリッド(30件ごとにページ分割)
         ├─ activeView === 'favorites' → お気に入りに絞ったゲームのグリッド(ページ分割あり)
         ├─ activeView === 'recent'    → 最近遊んだ順のグリッド(ページ分割あり)
         └─ activeView === 'campaign'  → campaigns.json を取得し、キャンペーンごとの段組み表示(ページ分割なし)

カードクリック → 詳細モーダル(openDetailModal)
   ├─ タグクリック   → モーダルを閉じ、'ゲーム一覧'ビューに切り替えて絞り込み
   ├─ 作者名クリック → 同上(作者で絞り込み)
   ├─ ★ボタン        → お気に入りの切り替え(一覧側の表示も更新)
   ├─ プレイ後メモ    → 入力0.4秒後に自動保存
   └─ 紹介画像を保存  → Canvasで合成 → 保存ダイアログ → ファイル書き込み

サイドバー「🎲 今日の1本」→ ランダムな1本の詳細モーダルを直接開く
```

## 10. 現在の設定値・外部依存

### Cloudflare R2 / Worker

| 項目 | 値 |
|---|---|
| R2バケット名 | `cs-launcher` |
| Workerプロジェクト名 | `cs-launcher-api` |
| Worker URL | `https://cs-launcher-api.akane-minori-cslauncher.workers.dev` |
| games.json | R2バケット直下の`games.json` |
| campaigns.json | R2バケット直下の`campaigns.json` |

ゲーム本体・サムネイル・スクリーンショットの実ファイルは、`Games/{id}/`配下にR2バケットへ直接アップロードする運用です。

**注意**: Worker URLは`*.workers.dev`のままのため、Cache APIが機能せずエッジキャッシュは効いていません(7-3節参照)。独自ドメインを設定すれば改善できます。

### アプリ名・アイコン

- アプリ名(表示名)は `src-tauri/tauri.conf.json` の `productName` と `app.windows[0].title` に設定(「クリエイティブスタッフ・ゲームランチャー」への変更依頼済み。実際にファイルへ反映されているか要確認)
- アイコンは `pnpm tauri icon <画像パス>` で生成し、`src-tauri/icons/`以下に格納する運用

### 依存関係(Rust側 `src-tauri/Cargo.toml`)

- `tauri-plugin-opener`: フォルダ・ブラウザを開く機能
- `reqwest` / `tokio`: Worker(R2)との通信・非同期処理
- `zip`: ダウンロードしたzipの展開
- `base64`: 紹介画像PNGのbase64エンコード/デコード
- `tauri-plugin-dialog`: 紹介画像の保存先を選ぶOS標準の保存ダイアログ
- (Googleドライブ固有だった`regex`による確認トークン抽出は移行に伴い不要になった)

フロントエンド側の追加npmパッケージは無し(お気に入り・最近遊んだ・メモはすべて`localStorage`で完結)。

### 依存ツール(`r2-worker`側)

- `wrangler`: Cloudflare Workersの開発・デプロイツール(pnpm経由で利用)

## 11. 開発環境のセットアップ手順・本番ビルド手順

### `cs-launcher`(Tauriアプリ)のセットアップ

1. Node.js(LTS版、20系以降を推奨)をインストール
   - Node.js v6のような非常に古いバージョンが入っていて動かないトラブルがあり得るため、必ずバージョンを確認すること(`node -v`)
2. `corepack enable` → `corepack prepare pnpm@latest --activate` でpnpmを有効化
   - 権限エラー(EPERM)が出る場合は、`npm install -g pnpm` で直接インストールする方法に切り替える
3. Rust(`rustup`経由)をインストール。Tauriのビルドに必要
4. プロジェクトルート(`cs-launcher/`)で `pnpm install`
5. `pnpm tauri dev` で開発モード起動

### `r2-worker`(Cloudflare Worker)のセットアップ

1. `r2-worker/`フォルダで `pnpm install`
2. Cloudflareアカウントにログイン(初回のみ `pnpm wrangler login`)
3. `pnpm wrangler deploy` でデプロイ
4. `pnpm wrangler tail` で稼働中のログをリアルタイム確認できる

### 本番ビルド(`cs-launcher`)

```
pnpm tauri build
```

- 実行ファイル: `src-tauri/target/release/`
- インストーラ: `src-tauri/target/release/bundle/`(デフォルトはNSIS形式の`.exe`)

### 既知の注意点

- **コード署名をしていない**ため、配布先のPCでSmartScreenの警告(「WindowsによってPCが保護されました」)が出ます。正式に消すには有料のコード署名証明書が必要です。当面は配布時に「詳細情報→実行」で進めてもらう旨を案内する運用としています
- 開発時(`pnpm tauri dev`)は `Games` フォルダが `src-tauri/target/debug/` 以下に作られます。本番ビルド後は生成された`.exe`と同じ場所に作られるため、動作場所によって保存先が変わる点に注意してください
- **お気に入り・最近遊んだ・プレイ後メモは端末単位の`localStorage`保存**です。別のPCで起動したり、アプリのデータをリセットしたりすると引き継がれません
- **R2はegress(データ転送)が無料**なため、Googleドライブ時代にあった「ダウンロード数の上限に達しました」エラーは原理的に発生しなくなった

## 12. 補足: 実装確認が必要な項目

### ゲームカード説明文の動的表示行数

一覧・キャンペーンのゲームカードは、タグの数などによってカードごとに余白の量が変わります。説明文が常に2行固定だと、余白が大きいカードで不自然な空白が残っていました。

対応方針として、カード全体をflexレイアウト化した上で、カードがDOMに配置された後にJavaScriptで「説明文の開始位置からアクションボタンの開始位置までの高さ」を実測し、その高さに収まる行数を`-webkit-line-clamp`に動的に設定する方式にしています(最小2行を保証)。

**要確認**: この方式はウィンドウのリサイズ時には再計算されません(現状は初回描画時のみ)。気になる場合は`resize`イベントでの再計算処理の追加を検討してください。

### `tauri-plugin-dialog`のバージョン差異

紹介画像の保存には`tauri-plugin-dialog`のOS標準保存ダイアログを利用しています。RustのAPIはバージョンによって細かい書き方が変わることがあるため、導入したバージョンのドキュメント(docs.rs)を確認しながら微調整してください。

## 13. ディレクトリ構成(要点)

```
program/tauri/
├── cs-launcher/                    Tauriアプリ本体
│   ├── index.html
│   ├── src/
│   │   ├── main.ts                  エントリポイント。状態管理・各ビューの描画制御・ページネーション
│   │   ├── api.ts                    Tauriバックエンドとの通信窓口(invokeはここに集約)
│   │   ├── types.ts                  型定義(GameEntry, Campaign等)
│   │   ├── config.ts                 Worker APIのベースURL(新規)
│   │   ├── theme.ts                  ダーク/ライトモード管理
│   │   ├── thumb.ts                  画像URLの組み立て(副作用なし)
│   │   ├── formatBytes.ts            バイト数の整形(新規)
│   │   ├── folderSize.ts             容量表示の共通ロジック(新規)
│   │   ├── sidebar.ts                サイドバー
│   │   ├── topBar.ts                 タグ・作者チップ、検索(タイトル+説明文)
│   │   ├── gameCard.ts               ゲームカードの生成
│   │   ├── gameModal.ts              詳細モーダルの生成
│   │   ├── gameActions.ts            ダウンロード/プレイ/フォルダ/アンインストールの共通ロジック
│   │   ├── campaignView.ts           キャンペーン画面の描画
│   │   ├── pagination.ts             ページネーションUI
│   │   ├── favorites.ts              お気に入りのlocalStorage管理
│   │   ├── recentlyPlayed.ts         最近遊んだのlocalStorage管理
│   │   ├── notes.ts                  プレイ後メモのlocalStorage管理
│   │   ├── share.ts                  紹介画像(PNG)の生成
│   │   └── styles.css                スタイル一式
│   ├── src-tauri/
│   │   ├── tauri.conf.json          Tauriアプリの各種設定
│   │   ├── Cargo.toml                Rustの依存クレート一覧
│   │   ├── capabilities/default.json 権限設定
│   │   └── src/
│   │       ├── lib.rs                 バックエンドの入り口・コマンド登録(⚠️0節参照)
│   │       └── commands/
│   │           ├── mod.rs               API_BASE, build_asset_url等の共通関数
│   │           ├── download.rs          zipダウンロード・展開、配信サイズ取得
│   │           ├── remote_json.rs       games.json / campaigns.json の取得
│   │           ├── launch.rs            起動・フォルダを開く・アンインストール・容量計算
│   │           └── image.rs             サムネイルのbase64取得、紹介画像PNGの保存
│   └── docs/
│       └── HANDOVER.md                このファイル
└── r2-worker/                       Cloudflare Workerプロジェクト
    ├── wrangler.jsonc
    └── src/
        └── index.js                  ルーティング・R2アクセス・キャッシュ処理
```

## 14. 未実装・今後の検討事項(申し送り)

### 最優先(不具合)
- 0節の容量表示不具合(`lib.rs`のコマンド登録漏れの疑い)

### 継続している事項
- コード署名証明書の取得(SmartScreen警告の解消)
- ゲームの更新(バージョンアップ)の仕組みは未実装。現状は一度アンインストールしてから再ダウンロードする運用が前提
- エラーメッセージやローディング表示は最低限の実装(`alert()`によるシンプルな通知)。UIとしての作り込みは今後の課題
- 自動アップデート機能(Tauriの`updater`プラグイン等)は未導入
- テストコードは未整備(フロントエンド・バックエンドともに手動確認のみ)
- お気に入り・最近遊んだ・プレイ後メモを端末をまたいで共有したい場合の保存先設計(現状は`localStorage`のみ)
- ページネーションのページサイズ(現在30件固定)を設定可能にするかどうかの検討
- ゲームカード説明文の動的行数調整のウィンドウリサイズ対応(12節参照)

### 今回のセッション(R2移行)で新たに出てきた申し送り事項
- Workerのエッジキャッシュを有効化するための独自ドメイン設定(現状`*.workers.dev`のためCache APIが機能していない)
- ゲームフォルダ全体(画像込み)の合計サイズ表示(現状はzip単体のサイズのみ。`bucket.list({prefix})`での合算実装は未着手)

## 15. これまでの主な相談・変更の経緯(参考)

1. Tauri + TypeScript + Rustでのプロジェクト作成
2. Googleドライブからのダウンロード・展開機能の実装(確認ページ対策込み)
3. unityroom等のブラウザ起動型ゲームへの対応
4. ダウンロード後のフォルダを開く機能・説明文表示
5. サムネイル表示の安定化、CORS回避のためのRust経由取得への切り替え
6. ゲーム詳細のスライド式ギャラリー表示
7. タグ検索・件数表示・サイドバー・ライトモードの追加
8. 保存先を`%APPDATA%`からランチャー本体隣の`Games`フォルダへ変更
9. キャンペーン機能の追加
10. アンインストール機能、作者の複数対応、日本語入力(IME)の不具合修正
11. アプリアイコンの差し替え対応
12. フルスクリーン画像プレビューが小さく表示される不具合の修正
13. ゲーム一覧の横スクロール問題、タグ・作者チップの横スクロール化
14. キャンペーン画面表示時のカード巨大化不具合の修正
15. 詳細モーダルからの作者クリック絞り込み対応
16. ★お気に入り、最近遊んだ、🎲今日の1本(ガチャ)、プレイ後メモ、紹介画像シェアの5機能を追加
17. `invoke`呼び出しを`api.ts`に集約する設計方針の徹底
18. ゲームカードのアクションボタン位置の統一、詳細モーダルへの操作ボタン追加
19. 選択中タグ・作者チップの先頭表示、30件ごとのページネーション追加
20. ゲームカード説明文の動的行数調整、紹介画像保存方式をOS標準ダイアログ経由に変更
21. **各ゲームの容量サイズ表示、検索機能の強化(説明文も対象に)を追加**
22. **ダウンロード先をGoogleドライブからCloudflare R2 + Workerへ移行**(HEAD対応・Range処理・キャッシュ制限などいくつかの不具合を解消しながら実装)
23. R2上のパス指定をシンプルにするため、`archive_filename` / `thumbnail_path` / `screenshot_paths`を`Games/{id}/`からの相対パスのみで記述できるよう設計変更
24. 未ダウンロード時の配信サイズ表示(HEADリクエスト経由)を追加
25. 容量表示がカード・モーダルに出ない不具合が発生、原因調査中(0節参照)で本セッション終了

## 16. 連絡・引き継ぎ先

*(担当者名・連絡先をここに記入してください)*
