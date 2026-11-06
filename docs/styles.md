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
  --bg: #ffffff;
  --card-bg: #fafafa;
  --text: #1a1a1a;
  --text-muted: #7a7a7a;
  --accent-text: #cc0000;
  --accent-single: #3d9fdb;
  --border: #cccccc;
  --border-strong: #aaaaaa;
  --btn-grad-1: #fdfdfd;
  --btn-grad-2: #dcdcdc;
  --chip-bg: #ffffff;
  --chip-border: #c4c4c4;
  --radius: 3px;
  --content-width: 1040px; /* niconicoの #main{width:1024px} に相当 */
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
  background: #f4f4f4;
  color: var(--text);
  font-family: 'Meiryo', 'Hiragino Kaku Gothic ProN', 'MS PGothic', sans-serif;
  overflow-x: hidden;
}

#app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* 幅を固定して中央寄せ。全画面化すると左右に隙間ができる */
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
.content-area--grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 24px 24px;
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
}

.campaign-section__title {
  font-size: 1.15rem;
  font-weight: 700;
  margin: 0 0 4px;
  border-left: 4px solid var(--border-strong);
  padding-left: 8px;
}

.campaign-section__description {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin: 0 0 12px;
}

.campaign-section__download-all {
  flex-shrink: 0;
  padding: 6px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: linear-gradient(to bottom, var(--btn-grad-1), var(--btn-grad-2));
  color: var(--accent-text);
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.campaign-section__download-all:disabled {
  opacity: 0.6;
  cursor: default;
}

.campaign-section__row {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-state {
  color: var(--text-muted);
  padding: 40px 24px;
}
```
`src\styles\game-card.css`:

```css
.game-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.15s ease;
  display: flex;
  flex-direction: row;
  min-width: 0;
  height: 152px;
}

.game-card:hover {
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.game-card__thumb-wrap {
  position: relative;
  flex: 0 0 240px;
  width: 240px;
  height: 152px;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.game-card__thumb {
  display: block;
  width: 240px;
  aspect-ratio: 16 / 9;
  object-fit: contain;
  background: #000;
}

.game-card__body {
  height: 152px;
  padding: 8px 14px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.game-card__title {
  margin: 0 0 4px;
  font-size: 0.95rem;
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
  max-height: 20px;
  overflow: hidden;
}

.game-card__description {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0 0 6px;
  font-size: 0.8rem;
  line-height: 18px;
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.game-card__tag {
  font-size: 0.7rem;
  padding: 1px 6px;
  border-radius: var(--radius);
  background: var(--chip-bg);
  color: var(--text);
  border: 1px solid var(--chip-border);
}

.game-card__tag--clickable {
  cursor: pointer;
}

.game-card__tag--clickable:hover {
  color: var(--accent-text);
  border-color: var(--border-strong);
}

.game-card__progress {
  height: 5px;
  border-radius: 2px;
  background: #eee;
  border: 1px solid var(--border);
  margin-bottom: 8px;
  overflow: hidden;
  max-width: 320px;
}

.game-card__progress-bar {
  height: 100%;
  width: 0%;
  background: linear-gradient(to bottom, var(--btn-grad-1), var(--border-strong));
  transition: width 0.2s ease;
}

.game-card__footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
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
  padding: 5px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: linear-gradient(to bottom, var(--btn-grad-1), var(--btn-grad-2));
  color: var(--text);
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
}

.game-card__btn:hover:not(:disabled) {
  border-color: var(--text-muted);
}

.game-card__btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.game-card__btn--danger {
  background: #ffffff;
  color: #cc0000;
  border: 1px solid #cc0000;
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
  color: #ff4d6d;

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

/* siteheader-content(幅固定・中央寄せ)に相当。#main と同じ幅で左右を揃える */
.header__inner {
  max-width: var(--content-width);
  margin: 0 auto;
  padding: 0 16px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
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
  height: 36px;
}

.header__action-btn {
  height: 36px;
  line-height: 36px;
  padding: 0 14px;
  border: none;
  border-left: 1px solid #666666;
  background: transparent;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.header__action-btn:hover {
  background: #474747;
}

/* final.css の .greenchar / .yellowchar と同じ配色 */
.header__action-btn--gacha {
  color: #39c4c1;
}

.header__action-btn--folder {
  color: #d9a300;
}

.header__nav {
  background: #ffffff;
  border-top: 2px solid #666666;
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
  background: transparent;
  color: #333333;
  font-size: 0.9rem;
  padding: 8px 20px;
  cursor: pointer;
  white-space: nowrap;
}

.header__nav-item:hover {
  background: #333333;
  color: #ffffff;
}

.header__nav-item.is-active {
  background: #333333;
  color: #ffffff;
  font-weight: 700;
}
```
`src\styles\misc.css`:

```css
.error {
  color: #cc0000;
  padding: 24px;
}

.offline-banner {
  background: linear-gradient(to bottom, var(--btn-grad-1), var(--btn-grad-2));
  border-bottom: 1px solid var(--border-strong);
  color: var(--accent-text);
  font-size: 0.85rem;
  font-weight: 700;
  text-align: center;
  padding: 6px 12px;
}

.site-footer {
  width: 100%;
  margin-top: 8px;
  padding: 20px 24px;
  background: #eeeeee;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
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
  z-index: 100;
}

.modal {
  position: relative;
  background: var(--card-bg);
  border-radius: var(--radius);
  width: min(480px, 90vw);
  max-height: 80vh;
  overflow-y: auto;
  border: 1px solid var(--border);
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
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  cursor: pointer;
}

.modal__carousel-dot.is-active {
  background: #fff;
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
  color: var(--accent-text);
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
  border-radius: var(--radius);
  border: 1px solid var(--border-strong);
  background: linear-gradient(to bottom, var(--btn-grad-1), var(--btn-grad-2));
  color: var(--text);
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}

.modal__favorite-btn.is-active {
  background: #ff4d6d;
  color: #ffffff;
  border-color: #ff4d6d;
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
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: #ffffff;
  color: var(--text);
  font: inherit;
  font-size: 0.85rem;
  box-sizing: border-box;
}

.modal__notes-textarea:focus {
  outline: none;
  border-color: var(--accent-text);
}

.modal__share-btn {
  margin-top: 14px;
}

.modal__size {
  margin: 0 0 8px;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--accent-text);
  line-height: 1.3;
}

.modal__progress {
  height: 5px;
  border-radius: 2px;
  background: #eee;
  border: 1px solid var(--border);
  margin: 10px 0;
  overflow: hidden;
}

.modal__progress-bar {
  height: 100%;
  width: 0%;
  background: linear-gradient(to bottom, var(--btn-grad-1), var(--border-strong));
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
  z-index: 200;
  cursor: zoom-out;
}

.image-preview-overlay__img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: var(--radius);
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
  min-width: 30px;
  height: 30px;
  padding: 0 6px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: #ffffff;
  color: var(--text);
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

.pagination__page-btn:hover:not(:disabled):not(.is-active) {
  border-color: var(--text-muted);
}

.pagination__page-btn.is-active {
  background: #4a4a4a;
  border-color: #4a4a4a;
  color: #ffffff;
  cursor: default;
}

.pagination__ellipsis {
  padding: 0 4px;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.pagination__nav-btn {
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: #ffffff;
  color: var(--text);
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.pagination__nav-btn:hover:not(:disabled) {
  border-color: var(--text-muted);
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
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
}

.top-bar__title-search {
  flex: 0 1 260px;
  height: 34px;
  padding: 0 34px 0 10px;
  border: 1px solid #d9d9d9;
  border-radius: 4px 0 0 4px;
  border-right: none;
  background: #ffffff;
  color: var(--text);
  font-size: 0.85rem;
  box-shadow: inset 0 0 8px 0 #d9d9d9;
  box-sizing: border-box;
}

.top-bar__title-search:focus {
  outline: none;
  border-color: var(--accent-single);
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
  padding: 3px 10px;
  border-radius: var(--radius);
  background: linear-gradient(to bottom, var(--btn-grad-1), var(--btn-grad-2));
  color: var(--text);
  border: 1px solid var(--chip-border);
  cursor: pointer;
  flex: 0 0 auto;
  white-space: nowrap;
}

.top-bar__chip-count {
  color: var(--text-muted);
}

.top-bar__chip.is-active {
  background: #ffffff;
  color: var(--text);
  border-color: var(--border-strong);
  font-weight: 700;
}

.top-bar__chip.is-active .top-bar__chip-count {
  color: var(--text-muted);
}
```