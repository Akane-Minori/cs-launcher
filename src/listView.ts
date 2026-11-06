import { type Campaign, type GameEntry, escapeHtml } from './api';
import { createGameCard } from './gameCard';
import { getGameStatus } from './fromRust';
import { startDownload } from './downloadState';

// ----------------------------------------------------------------------------
// キャンペーン一覧
// ----------------------------------------------------------------------------

export async function renderCampaigns(
  container: HTMLElement,
  campaigns: Campaign[],
  allGames: GameEntry[],
  onTagClick: (tag: string) => void,
  onAuthorClick: (author: string) => void,
  onFavoriteChange: () => void
) {
  container.innerHTML = '';

  const gameMap = new Map(allGames.map((g) => [g.id, g]));
  const sections = campaigns
    .map((campaign) => ({
      campaign,
      games: campaign.game_ids.map((id) => gameMap.get(id)).filter((g): g is GameEntry => g !== undefined),
    }))
    .filter((s) => s.games.length > 0);

  if (sections.length === 0) {
    container.innerHTML = `<p class="empty-state">現在開催中のキャンペーンはありません。</p>`;
    return;
  }

  for (const { campaign, games } of sections) {
    const section = document.createElement('section');
    section.className = 'campaign-section';
    section.innerHTML = `
      <div class="campaign-section__header">
        <div>
          <h2 class="campaign-section__title">${escapeHtml(campaign.title)}</h2>
          ${campaign.description ? `<p class="campaign-section__description">${escapeHtml(campaign.description)}</p>` : ''}
        </div>
      </div>
    `;

    const downloadableGames = games.filter((g) => g.type === 'download');
    if (downloadableGames.length > 0) {
      const bulkBtn = document.createElement('button');
      bulkBtn.type = 'button';
      bulkBtn.className = 'campaign-section__download-all';
      bulkBtn.textContent = 'すべてダウンロード';
      bulkBtn.addEventListener('click', async () => {
        bulkBtn.disabled = true;
        const targets: GameEntry[] = [];
        for (const g of downloadableGames) {
          if ((await getGameStatus(g.id)) === 'not_downloaded') targets.push(g);
        }
        if (targets.length === 0) {
          bulkBtn.textContent = 'ダウンロード済みです';
          setTimeout(() => { bulkBtn.disabled = false; bulkBtn.textContent = 'すべてダウンロード'; }, 2000);
          return;
        }
        for (let i = 0; i < targets.length; i++) {
          bulkBtn.textContent = `ダウンロード中 (${i + 1}/${targets.length})`;
          await startDownload(targets[i]);
        }
        bulkBtn.textContent = 'すべてダウンロード完了';
        setTimeout(() => { bulkBtn.disabled = false; bulkBtn.textContent = 'すべてダウンロード'; }, 3000);
      });
      section.querySelector('.campaign-section__header')!.appendChild(bulkBtn);
        }

      const row = document.createElement('div');
      row.className = 'campaign-section__row';
      for (const game of games) {
        const card = await createGameCard(game, onTagClick, onAuthorClick, onFavoriteChange);
        row.appendChild(card);
      }

      section.appendChild(row);
      container.appendChild(section);
    }
}

// ----------------------------------------------------------------------------
// ページ送り
// ----------------------------------------------------------------------------

export function renderPagination(
  container: HTMLElement,
  currentPage: number,
  totalPages: number,
  onPageChange: (page: number) => void
) {
  if (totalPages <= 1) {
    container.innerHTML = '';
    container.hidden = true;
    return;
  }
  container.hidden = false;

  const pages = buildPageList(currentPage, totalPages);
  const pageButtonsHtml = pages
    .map((p) =>
      p === '...'
        ? `<span class="pagination__ellipsis">…</span>`
        : `<button class="pagination__page-btn${p === currentPage ? ' is-active' : ''}" data-page="${p}" type="button" ${p === currentPage ? 'disabled' : ''}>${p}</button>`
    )
    .join('');

  container.innerHTML = `
    <button class="pagination__nav-btn" data-action="prev" type="button" ${currentPage <= 1 ? 'disabled' : ''}>‹ 前へ</button>
    <div class="pagination__pages">${pageButtonsHtml}</div>
    <button class="pagination__nav-btn" data-action="next" type="button" ${currentPage >= totalPages ? 'disabled' : ''}>次へ ›</button>
  `;

  container.querySelectorAll<HTMLButtonElement>('.pagination__page-btn[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => onPageChange(Number(btn.dataset.page)));
  });
  container.querySelector('[data-action="prev"]')?.addEventListener('click', () => onPageChange(currentPage - 1));
  container.querySelector('[data-action="next"]')?.addEventListener('click', () => onPageChange(currentPage + 1));
}

/** 1, ..., current-1, current, current+1, ..., total の形式のページ番号リストを作る */
function buildPageList(current: number, total: number): (number | '...')[] {
  const delta = 1;
  const left = Math.max(2, current - delta);
  const right = Math.min(total - 1, current + delta);
  const pages: (number | '...')[] = [1];

  if (left > 2) pages.push('...');
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push('...');
  if (total > 1) pages.push(total);

  return pages;
}
