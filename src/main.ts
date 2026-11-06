import { listCampaigns, listGames, openGamesRootFolder } from './fromRust';
import { renderCampaigns, renderPagination } from './listView';
import { createGameCard } from './gameCard';
import { renderHeader, renderTopBar, type ViewType } from './topArea';
import { openDetailModal } from './gameModal';
import { getFavoriteIds, getRecentlyPlayedIds } from './localStore';
import type { Campaign, GameEntry } from './api';
import './styles.css';
import { listen } from '@tauri-apps/api/event';


const PAGE_SIZE = 30;

let allGames: GameEntry[] = [];
let campaigns: Campaign[] | null = null;
let activeView: ViewType = 'all';
let activeTag: string | null = null;
let activeAuthor: string | null = null;
let titleQuery = '';
let currentPage = 1;

async function init() {
  const appEl = document.querySelector<HTMLElement>('#app');
  const headerEl = document.querySelector<HTMLElement>('#header');
  const topBarEl = document.querySelector<HTMLElement>('#top-bar');
  const gridEl = document.querySelector<HTMLElement>('#game-grid');

  if (!appEl || !headerEl || !topBarEl || !gridEl) {
    console.error('#app / #header / #top-bar / #game-grid が見つかりません。index.htmlを確認してください。');
    return;
  }
  // init() の中、listGames() を呼ぶより前に追加
  await listen('remote-json-fallback', () => {
    if (document.querySelector('.offline-banner')) return;
    const banner = document.createElement('div');
    banner.className = 'offline-banner';
    banner.textContent = 'オフラインのため、前回取得した一覧を表示しています(最新ではない可能性があります)';
    document.body.insertAdjacentElement('afterbegin', banner);
  });

  // ページネーション用の要素(上下2箇所)。index.htmlに無ければ生成する
  let paginationTopEl = document.querySelector<HTMLElement>('#pagination-top');
  if (!paginationTopEl) {
    paginationTopEl = document.createElement('div');
    paginationTopEl.id = 'pagination-top';
    paginationTopEl.className = 'pagination';
    topBarEl.insertAdjacentElement('afterend', paginationTopEl);
  }

  let paginationBottomEl = document.querySelector<HTMLElement>('#pagination-bottom');
  if (!paginationBottomEl) {
    paginationBottomEl = document.createElement('div');
    paginationBottomEl.id = 'pagination-bottom';
    paginationBottomEl.className = 'pagination';
    gridEl.insertAdjacentElement('afterend', paginationBottomEl);
  }

  // #main の外(#appの最後)に灰色フッターを追加
  let footerEl = document.querySelector<HTMLElement>('#site-footer');
  if (!footerEl) {
    footerEl = document.createElement('footer');
    footerEl.id = 'site-footer';
    footerEl.className = 'site-footer';
    footerEl.textContent = '© クリエイティブスタッフ・ゲームランチャー';
    appEl.appendChild(footerEl);
  }

  renderHeader(headerEl, activeView, handleNavigate, handleOpenGamesFolder, handleGacha);

  try {
    allGames = await listGames();
    await renderContent();
  } catch (err) {
    gridEl.innerHTML = `<p class="error">ゲーム一覧の取得に失敗しました: ${err}</p>`;
  }
  

  async function handleNavigate(view: ViewType) {
    activeView = view;
    activeTag = null;
    activeAuthor = null;
    currentPage = 1;
    renderHeader(headerEl!, activeView, handleNavigate, handleOpenGamesFolder, handleGacha);
    await renderContent();
  }

  async function handleOpenGamesFolder() {
    try {
      await openGamesRootFolder();
    } catch (err) {
      alert(`フォルダを開けませんでした: ${err}`);
    }
  }

  function handleGacha() {
    if (allGames.length === 0) return;
    const game = allGames[Math.floor(Math.random() * allGames.length)];
    openDetailModal(game, handleTagClick, handleAuthorClick, handleFavoriteChange);
  }

  async function handleFavoriteChange() {
    await renderContent();
  }

  async function switchToAllViewIfNeeded() {
    if (activeView !== 'all') {
      activeView = 'all';
      renderHeader(headerEl!, activeView, handleNavigate, handleOpenGamesFolder, handleGacha);
    }
  }

  async function handleTagClick(tag: string | null) {
    await switchToAllViewIfNeeded();
    activeTag = tag;
    currentPage = 1;
    await renderContent();
  }

  async function handleAuthorClick(author: string | null) {
    await switchToAllViewIfNeeded();
    activeAuthor = author;
    currentPage = 1;
    await renderContent();
  }

  async function handleTitleQueryChange(query: string) {
    titleQuery = query;
    currentPage = 1;
    await renderContent();
  }

  async function handlePageChange(page: number) {
    currentPage = page;
    await renderContent();
  }

  function getBaseGames(): GameEntry[] {
    if (activeView === 'favorites') {
      const favIds = new Set(getFavoriteIds());
      return allGames.filter((g) => favIds.has(g.id));
    }
    if (activeView === 'recent') {
      const recentIds = getRecentlyPlayedIds();
      const gameMap = new Map(allGames.map((g) => [g.id, g]));
      return recentIds.map((id) => gameMap.get(id)).filter((g): g is GameEntry => g !== undefined);
    }
    return allGames;
  }

  async function renderContent() {
    if (activeView === 'campaign') {
      topBarEl!.innerHTML = '';
      paginationTopEl!.hidden = true;
      paginationBottomEl!.hidden = true;
      gridEl!.className = 'content-area content-area--campaign';
      gridEl!.innerHTML = '<p class="empty-state">読み込み中...</p>';
      try {
        if (campaigns === null) {
          campaigns = await listCampaigns();
        }
        await renderCampaigns(gridEl!, campaigns, allGames, handleTagClick, handleAuthorClick, handleFavoriteChange);
      } catch (err) {
        gridEl!.innerHTML = `<p class="error">キャンペーン情報の取得に失敗しました: ${err}</p>`;
      }
      return;
    }

    gridEl!.className = 'content-area content-area--grid';

    const baseGames = getBaseGames();
    let visibleGames = activeTag ? baseGames.filter((g) => g.tags.includes(activeTag!)) : baseGames;
    if (activeAuthor) {
      visibleGames = visibleGames.filter((g) => (g.authors ?? []).includes(activeAuthor!));
    }
    if (titleQuery.trim() !== '') {
      const q = titleQuery.trim().toLowerCase();
      visibleGames = visibleGames.filter(
        (g) => g.title.toLowerCase().includes(q) || g.description.toLowerCase().includes(q)
      );
    }

    const totalPages = Math.max(1, Math.ceil(visibleGames.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const pagedGames = visibleGames.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const activeEl = document.activeElement as HTMLInputElement | null;
    const wasTitleInputFocused = activeEl?.classList.contains('top-bar__title-search') ?? false;
    const caret = wasTitleInputFocused ? activeEl!.selectionStart : null;

    renderTopBar(topBarEl!, baseGames, activeTag, activeAuthor, titleQuery, handleTagClick, handleAuthorClick, handleTitleQueryChange);

    if (wasTitleInputFocused) {
      const input = topBarEl!.querySelector<HTMLInputElement>('.top-bar__title-search');
      input?.focus();
      if (caret !== null) input?.setSelectionRange(caret, caret);
    }

    gridEl!.innerHTML = '';
    if (visibleGames.length === 0) {
      const emptyMsg =
        activeView === 'favorites'
          ? 'いいね!はまだありません。ゲーム詳細の♡ボタンで追加できます。'
          : activeView === 'recent'
          ? 'まだ遊んだゲームがありません。'
          : '該当するゲームがありません。';
      gridEl!.innerHTML = `<p class="empty-state">${emptyMsg}</p>`;
      renderPagination(paginationTopEl!, 1, 1, handlePageChange);
      renderPagination(paginationBottomEl!, 1, 1, handlePageChange);
      return;
    }
    for (const game of pagedGames) {
      const card = await createGameCard(game, handleTagClick, handleAuthorClick, handleFavoriteChange);
      gridEl!.appendChild(card);
    }

    renderPagination(paginationTopEl!, currentPage, totalPages, handlePageChange);
    renderPagination(paginationBottomEl!, currentPage, totalPages, handlePageChange);
  }
}

window.addEventListener('DOMContentLoaded', init);