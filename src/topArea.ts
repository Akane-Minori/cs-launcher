import { type GameEntry, escapeHtml } from './api';

// ----------------------------------------------------------------------------
// ヘッダー(タブとボタン)
// ----------------------------------------------------------------------------

export type ViewType = 'campaign' | 'all' | 'favorites' | 'recent';

export function renderHeader(
  container: HTMLElement,
  activeView: ViewType,
  onNavigate: (view: ViewType) => void,
  onOpenGamesFolder: () => void,
  onGacha: () => void
) {
  container.innerHTML = `
    <div class="header__top">
      <div class="header__inner">
        <div class="header__logo">クリエイティブスタッフ・ゲームランチャー</div>
        <div class="header__actions">
          <button class="header__action-btn header__action-btn--gacha" id="gacha-btn" type="button">ゲームガチャ</button>
          <button class="header__action-btn header__action-btn--folder" id="open-games-folder-btn" type="button">ゲームフォルダを開く</button>
        </div>
      </div>
    </div>
    <nav class="header__nav">
      <div class="header__inner header__inner--nav">
        <button class="header__nav-item${activeView === 'campaign' ? ' is-active' : ''}" data-view="campaign" type="button">キャンペーン</button>
        <button class="header__nav-item${activeView === 'all' ? ' is-active' : ''}" data-view="all" type="button">ゲーム一覧</button>
        <button class="header__nav-item${activeView === 'favorites' ? ' is-active' : ''}" data-view="favorites" type="button">♡ いいね！</button>
        <button class="header__nav-item${activeView === 'recent' ? ' is-active' : ''}" data-view="recent" type="button">最近遊んだ</button>
      </div>
    </nav>
  `;

  container.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => onNavigate(btn.dataset.view as ViewType));
  });

  container.querySelector('#gacha-btn')!.addEventListener('click', onGacha);
  container.querySelector('#open-games-folder-btn')!.addEventListener('click', onOpenGamesFolder);
}

// ----------------------------------------------------------------------------
// 上部バー(タグ・作者・検索)
// ----------------------------------------------------------------------------

export function renderTopBar(
  container: HTMLElement,
  games: GameEntry[],
  activeTag: string | null,
  activeAuthor: string | null,
  titleQuery: string,
  onTagClick: (tag: string | null) => void,
  onAuthorClick: (author: string | null) => void,
  onTitleQueryChange: (query: string) => void
) {
  const tagCounts = new Map<string, number>();
  const authorCounts = new Map<string, number>();
  for (const game of games) {
    for (const tag of game.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    const authors = (game.authors ?? []).map((a) => a.trim()).filter((a) => a !== '');
    for (const author of authors) {
      authorCounts.set(author, (authorCounts.get(author) ?? 0) + 1);
    }
  }
  const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
  if (activeTag) {
    const idx = tags.findIndex(([t]) => t === activeTag);
    if (idx > 0) {
      tags.unshift(tags.splice(idx, 1)[0]);
    }
  }

  const authors = [...authorCounts.entries()].sort((a, b) => b[1] - a[1]);
  if (activeAuthor) {
    const idx = authors.findIndex(([a]) => a === activeAuthor);
    if (idx > 0) {
      authors.unshift(authors.splice(idx, 1)[0]);
    }
  }

  container.innerHTML = `
    <div class="top-bar__row">
      <div class="top-bar__count">${games.length}件のゲーム</div>
      <input
        class="top-bar__title-search"
        type="text"
        placeholder="タイトル・説明で検索"
        value="${escapeAttr(titleQuery)}"
      >
    </div>
    ${
      tags.length > 0
        ? `
      <div class="top-bar__section-label">タグ</div>
      <div class="top-bar__chips">
        ${tags
          .map(
            ([tag, count]) => `
          <button class="top-bar__chip${tag === activeTag ? ' is-active' : ''}" data-tag="${escapeAttr(tag)}" type="button">
            ${escapeHtml(tag)} <span class="top-bar__chip-count">${count}</span>
          </button>`
          )
          .join('')}
      </div>`
        : ''
    }
    ${
      authors.length > 0
        ? `
      <div class="top-bar__section-label">作者</div>
      <div class="top-bar__chips">
        ${authors
          .map(
            ([author, count]) => `
          <button class="top-bar__chip${author === activeAuthor ? ' is-active' : ''}" data-author="${escapeAttr(author)}" type="button">
            ${escapeHtml(author)} <span class="top-bar__chip-count">${count}</span>
          </button>`
          )
          .join('')}
      </div>`
        : ''
    }
  `;

  container.querySelectorAll<HTMLButtonElement>('.top-bar__chip[data-tag]').forEach((btn) => {
    btn.addEventListener('click', () => {
      onTagClick(btn.dataset.tag === activeTag ? null : btn.dataset.tag!);
    });
  });

  container.querySelectorAll<HTMLButtonElement>('.top-bar__chip[data-author]').forEach((btn) => {
    btn.addEventListener('click', () => {
      onAuthorClick(btn.dataset.author === activeAuthor ? null : btn.dataset.author!);
    });
  });

  const titleInput = container.querySelector<HTMLInputElement>('.top-bar__title-search')!;
  titleInput.addEventListener('input', (e) => {
    // IME変換中(isComposing)はここでは反映しない。再描画すると変換状態が壊れるため。
    if ((e as InputEvent).isComposing) return;
    onTitleQueryChange(titleInput.value);
  });
  titleInput.addEventListener('compositionend', () => {
    // 変換確定時に改めて反映する
    onTitleQueryChange(titleInput.value);
  });
}

function escapeAttr(text: string): string {
  return escapeHtml(text);
}
