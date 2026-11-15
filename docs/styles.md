Project Path: cs-launcher

Source Tree:

```txt
cs-launcher
└── src
    └── styles
        ├── base.css
        ├── content.css
        ├── game-card.css
        ├── header.css
        ├── misc.css
        ├── modal.css
        ├── pagination.css
        └── top-bar.css

```

`src\styles\base.css`:

```css
:root {
  /* 地の色 */
  --bg: #f5f7f9;
  --card-bg: #ffffff;
  --text: #333333;
  --text-muted: #6b6b6b;
  --border: #e1e5e9;

  /* 部品ごとに固定して使うカラー */
  --c-green: #1aff1a;   /* 見出しの下線・メインボタン・選択中タブ */
  --c-pink: #ff4d9d;    /* いいね・ゲームガチャ */
  --c-yellow: #ffd400;  /* 選択中のチップ・フォルダボタン・すべてダウンロード */
  --c-blue: #19c8ff;    /* タグ・ホバー・入力欄のフォーカス */
  --c-orange: #ff8a1f;  /* 進捗バー・アンインストール */
  --c-purple: #a855ff;  /* 選択中のページ番号・作者リンク */

  --radius: 16px;
  --radius-sm: 8px;
  --shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  --shadow-hover: 0 6px 16px rgba(0, 0, 0, 0.16);
  --content-width: 1040px;
}

* {
  box-sizing: border-box;
}

html,
body {
  /* 上下スクロール端でのゴムバンド(バウンス)挙動を止める */
  overscroll-behavior: none;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: 'Meiryo', 'Hiragino Kaku Gothic ProN', 'MS PGothic', sans-serif;
  overflow-x: hidden;
}

#app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* 幅を固定して中央寄せ */
#main {
  flex: 1;
  min-width: 0;
  width: 100%;
  max-width: var(--content-width);
  margin: 0 auto;
}

```
`src\styles\content.css`:

```css
/* ゲーム一覧: 縦型カードを自動でグリッド状に並べる */
.content-area--grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  padding: 16px 24px 24px;
}

/* 一覧が空のときのメッセージは全列を使う */
.content-area--grid > .empty-state {
  grid-column: 1 / -1;
}

.content-area--campaign {
  padding: 16px 24px 24px;
}

.campaign-section {
  margin-bottom: 32px;
}

.campaign-section__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  border-bottom: 4px solid var(--c-green);
}

.campaign-section__title {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0 0 4px;
}

.campaign-section__description {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin: 0 0 10px;
}

.campaign-section__download-all {
  flex-shrink: 0;
  padding: 6px 16px;
  border: none;
  border-radius: 16px;
  background: #ffffff;
  color: var(--text);
  box-shadow: inset 0 0 0 2px var(--c-yellow);
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.campaign-section__download-all:hover:not(:disabled) {
  background: #fffbe0;
}

.campaign-section__download-all:disabled {
  opacity: 0.6;
  cursor: default;
}

.campaign-section__row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.empty-state {
  color: var(--text-muted);
  padding: 40px 24px;
}

```
`src\styles\game-card.css`:

```css
/* 縦型カード: 上にサムネイル、下に文字 */
.game-card {
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.15s ease, transform 0.15s ease;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.game-card:hover {
  box-shadow: var(--shadow-hover);
  transform: translateY(-2px);
}

.game-card__thumb-wrap {
  position: relative;
  flex: none;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
  overflow: hidden;
}

.game-card__thumb {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

.game-card__body {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.game-card__title {
  margin: 0 0 4px;
  font-size: 1rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.game-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 4px;
  max-height: 22px;
  overflow: hidden;
}

.game-card__description {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0 0 8px;
  font-size: 0.8rem;
  line-height: 18px;
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.game-card__tag {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 10px;
  background: #ffffff;
  color: var(--text);
  border: 2px solid var(--c-blue);
}

.game-card__tag--clickable {
  cursor: pointer;
}

.game-card__tag--clickable:hover {
  border-color: var(--c-yellow);
}

.game-card__progress {
  height: 6px;
  border-radius: 3px;
  background: #e9edf0;
  margin-bottom: 8px;
  overflow: hidden;
}

.game-card__progress-bar {
  height: 100%;
  width: 0%;
  background: var(--c-orange);
  transition: width 0.2s ease;
}

.game-card__footer {
  margin-top: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}

.game-card__size {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
  line-height: 1.3;
  margin: 0 auto 0 0;
  white-space: nowrap;
}

.game-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 0 auto;
}

.game-card__btn {
  flex: 0 1 auto;
  white-space: nowrap;
  padding: 5px 12px;
  border: none;
  border-radius: 14px;
  background: #ffffff;
  color: var(--text);
  box-shadow: inset 0 0 0 2px var(--c-green);
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
}

.game-card__btn:hover:not(:disabled) {
  background: #f0fff0;
}

.game-card__btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.game-card__btn--danger {
  background: #ffffff;
  color: #d96500;
  box-shadow: inset 0 0 0 2px var(--c-orange);
}

.game-card__favorite {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 0.95rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.game-card__favorite.is-active {
  background: #ffffff;
  color: var(--c-pink);
}

/* 年・プレイ回数 */
.game-card__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
}

.game-card__plays {
  margin-left: auto;
  white-space: nowrap;
}

```
`src\styles\header.css`:

```css
#header {
  width: 100%;
  position: sticky;
  top: 0;
  z-index: 9999;
}

.header__top {
  background: #272727;
  color: #ffffff;
}

/* #main と同じ幅で左右を揃える */
.header__inner {
  max-width: var(--content-width);
  margin: 0 auto;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
}

.header__logo {
  font-size: 0.95rem;
  font-weight: 700;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header__actions {
  display: flex;
  gap: 8px;
}

.header__action-btn {
  height: 28px;
  padding: 0 14px;
  border: none;
  border-radius: 14px;
  background: transparent;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.header__action-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}

.header__action-btn--gacha {
  color: var(--c-pink);
  box-shadow: inset 0 0 0 2px var(--c-pink);
}

.header__action-btn--folder {
  color: var(--c-yellow);
  box-shadow: inset 0 0 0 2px var(--c-yellow);
}

.header__nav {
  background: #ffffff;
  border-bottom: 1px solid var(--border);
}

.header__inner--nav {
  height: auto;
  flex-wrap: wrap;
  justify-content: flex-start;
  padding: 0 16px;
}

.header__nav-item {
  border: none;
  border-bottom: 4px solid transparent;
  background: transparent;
  color: var(--text);
  font-size: 0.9rem;
  padding: 10px 20px 6px;
  cursor: pointer;
  white-space: nowrap;
}

.header__nav-item:hover {
  border-bottom-color: var(--c-blue);
}

.header__nav-item.is-active {
  border-bottom-color: var(--c-green);
  font-weight: 700;
}

```
`src\styles\misc.css`:

```css
.error {
  color: #d9002f;
  padding: 24px;
}

.offline-banner {
  background: #fffbe6;
  border-bottom: 3px solid var(--c-yellow);
  color: var(--text);
  font-size: 0.85rem;
  font-weight: 700;
  text-align: center;
  padding: 6px 12px;
}

.site-footer {
  width: 100%;
  margin-top: 8px;
  padding: 20px 24px;
  background: #272727;
  color: #cccccc;
  font-size: 0.78rem;
  text-align: center;
}

```
`src\styles\modal.css`:

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.modal {
  position: relative;
  background: var(--card-bg);
  border-radius: var(--radius);
  width: min(480px, 90vw);
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: var(--shadow-hover);
}

.modal__body {
  padding: 16px 20px 20px;
}

.modal__carousel {
  position: relative;
}

.modal__carousel-img {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: contain;
  border-radius: var(--radius) var(--radius) 0 0;
  display: block;
  cursor: zoom-in;
  background: #000;
}

.modal__close {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 5;
  background: rgba(0, 0, 0, 0.55);
  border: none;
  color: #fff;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal__carousel-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
}

.modal__carousel-arrow--prev {
  left: 8px;
}

.modal__carousel-arrow--next {
  right: 8px;
}

.modal__carousel-dots {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
}

.modal__carousel-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  cursor: pointer;
}

.modal__carousel-dot.is-active {
  background: var(--c-green);
}

.modal__title {
  margin: 0 0 8px;
  font-weight: 700;
}

.modal__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
}

.modal__author-link {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  font-weight: 700;
  color: var(--c-purple);
  text-decoration: underline;
  cursor: pointer;
}

.modal__author-link:hover {
  opacity: 0.8;
}

.modal__description {
  white-space: pre-wrap;
  color: var(--text-muted);
  line-height: 1.6;
}

.modal__header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.modal__header-row .modal__title {
  margin: 0;
  flex: 1;
  min-width: 0;
}

.modal__favorite-btn {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 16px;
  border: 2px solid var(--c-pink);
  background: #ffffff;
  color: var(--c-pink);
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}

.modal__favorite-btn.is-active {
  background: #ffe8f2;
  color: var(--c-pink);
}

.modal__notes {
  margin-top: 14px;
}

.modal__notes-label {
  display: block;
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.modal__notes-textarea {
  width: 100%;
  min-height: 70px;
  resize: vertical;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: 2px solid var(--border);
  background: #ffffff;
  color: var(--text);
  font: inherit;
  font-size: 0.85rem;
}

.modal__notes-textarea:focus {
  outline: none;
  border-color: var(--c-green);
}

.modal__share-btn {
  margin-top: 14px;
}

.modal__size {
  margin: 0 0 8px;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-muted);
  line-height: 1.3;
}

.modal__progress {
  height: 6px;
  border-radius: 3px;
  background: #e9edf0;
  margin: 10px 0;
  overflow: hidden;
}

.modal__progress-bar {
  height: 100%;
  width: 0%;
  background: var(--c-orange);
  transition: width 0.2s ease;
}

.modal__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}

.image-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 10001;
  cursor: zoom-out;
}

.image-preview-overlay__img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: var(--radius-sm);
}

.modal__plays {
  margin: 0 0 8px;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-muted);
}

```
`src\styles\pagination.css`:

```css
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 24px;
}

.pagination[hidden] {
  display: none;
}

.pagination__pages {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pagination__page-btn {
  min-width: 32px;
  height: 32px;
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: #ffffff;
  color: var(--text);
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

.pagination__page-btn:hover:not(:disabled):not(.is-active) {
  border-color: var(--c-blue);
}

.pagination__page-btn.is-active {
  background: #ffffff;
  border-color: var(--c-purple);
  box-shadow: inset 0 0 0 1px var(--c-purple);
  color: var(--c-purple);
  cursor: default;
}

.pagination__ellipsis {
  padding: 0 4px;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.pagination__nav-btn {
  height: 32px;
  padding: 0 16px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: #ffffff;
  color: var(--text);
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.pagination__nav-btn:hover:not(:disabled) {
  border-color: var(--c-blue);
}

.pagination__nav-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

```
`src\styles\top-bar.css`:

```css
#top-bar {
  padding: 20px 24px 0;
}

.top-bar__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.top-bar__count {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
}

.top-bar__title-search {
  flex: 0 1 260px;
  height: 34px;
  padding: 0 14px;
  border: 2px solid var(--border);
  border-radius: 17px;
  background: #ffffff;
  color: var(--text);
  font-size: 0.85rem;
}

.top-bar__title-search:focus {
  outline: none;
  border-color: var(--c-blue);
}

.top-bar__section-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
  margin: 10px 0 6px;
}

.top-bar__chips {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  gap: 6px;
  padding-bottom: 6px;
}

.top-bar__chip {
  font-size: 0.78rem;
  font-weight: 400;
  padding: 3px 12px;
  border-radius: 14px;
  background: #ffffff;
  color: var(--text);
  border: 1px solid var(--border);
  cursor: pointer;
  flex: 0 0 auto;
  white-space: nowrap;
}

.top-bar__chip:hover {
  border-color: var(--c-blue);
}

.top-bar__chip-count {
  color: var(--text-muted);
}

.top-bar__chip.is-active {
  background: #ffffff;
  color: var(--text);
  border-color: var(--border);
  box-shadow: inset 0 -3px 0 var(--c-yellow);
  font-weight: 700;
}

/* 並び替え・プレイ回数の期間 */
.top-bar__controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.top-bar__select {
  height: 34px;
  padding: 0 12px;
  border: 2px solid var(--border);
  border-radius: 17px;
  background: #ffffff;
  color: var(--text);
  font-size: 0.85rem;
}

.top-bar__select:focus {
  outline: none;
  border-color: var(--c-blue);
}

```