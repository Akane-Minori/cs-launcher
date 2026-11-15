import { type GameEntry, type GameStatus, thumbUrl, renderFolderSize, renderRemoteSize, hideFolderSize, escapeHtml } from './api';
import { getGameStatus, getInstalledVersion, playGame, openGameFolder, uninstallGame } from './fromRust';
import { openDetailModal } from './gameModal';
import { isFavorite, toggleFavorite, getPlayCount } from './localStore';
import { isDownloading, getProgress, subscribeProgress, subscribeDone, startDownload, subscribeBegin } from './downloadState';

// ----------------------------------------------------------------------------
// アップデート判定
// ----------------------------------------------------------------------------

export interface UpdateInfo {
  installed: string;
  latest: string;
}

/**
 * 端末の版(.installed.json)と games.json の版を文字列で比べる。
 * 版が違えば UpdateInfo を返す。対象外・同じ版・版の記録なしの場合は null。
 */
export async function getUpdateInfo(game: GameEntry): Promise<UpdateInfo | null> {
  if (game.type !== 'download' || !game.version) return null;
  try {
    const installed = await getInstalledVersion(game.id);
    if (installed === null || installed === game.version) return null;
    return { installed, latest: game.version };
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// ゲームカード
// ----------------------------------------------------------------------------

export async function createGameCard(
  game: GameEntry,
  onTagClick: (tag: string) => void,
  onAuthorClick: (author: string) => void,
  onFavoriteChange: () => void
): Promise<HTMLElement> {
  const status: GameStatus =
    game.type === 'web_link'
      ? 'downloaded'
      : isDownloading(game.id)
        ? 'downloading'
        : await getGameStatus(game.id);

  const card = document.createElement('div');
  card.className = 'game-card';
  card.dataset.gameId = game.id;
  card.innerHTML = `
    <div class="game-card__thumb-wrap">
      <img class="game-card__thumb" src="${thumbUrl(game.id, game.thumbnail_path)}" alt="${escapeHtml(game.title)}">
      <button class="game-card__favorite${isFavorite(game.id) ? ' is-active' : ''}" type="button" aria-label="いいね">♥</button>
    </div>
    <div class="game-card__body">
      <h3 class="game-card__title">${escapeHtml(game.title)}</h3>
      <div class="game-card__tags">
        ${game.tags.map((t) => `<span class="game-card__tag">${escapeHtml(t)}</span>`).join('')}
      </div>
      <p class="game-card__description">${escapeHtml(game.description)}</p>
      <div class="game-card__meta">
        <span class="game-card__year">${game.year !== undefined ? `${escapeHtml(String(game.year))}年` : ''}</span>
        <span class="game-card__plays">▶ ${getPlayCount(game.id)}</span>
      </div>
      <div class="game-card__progress" hidden>
        <div class="game-card__progress-bar"></div>
      </div>
      <div class="game-card__footer">
        <div class="game-card__size" hidden></div>
        <div class="game-card__actions"></div>
      </div>
    </div>
  `;

  async function updateActions(s: GameStatus) {
    const update = s === 'downloaded' ? await getUpdateInfo(game) : null;
    renderGameActions(
      {
        actionsEl: card.querySelector<HTMLElement>('.game-card__actions')!,
        progressWrapEl: card.querySelector<HTMLElement>('.game-card__progress')!,
        progressBarEl: card.querySelector<HTMLElement>('.game-card__progress-bar')!,
      },
      game,
      s,
      updateActions,
      update
    );
    const sizeEl = card.querySelector<HTMLElement>('.game-card__size')!;
    if (game.type === 'web_link') {
      hideFolderSize(sizeEl);
    } else if (status === 'downloaded') {
      renderFolderSize(sizeEl, game.id);
    } else if (game.archive_filename) {
      renderRemoteSize(sizeEl, game.id, game.archive_filename);
    } else {
      hideFolderSize(sizeEl);
    }
  }
  await updateActions(status);

  const favBtn = card.querySelector<HTMLButtonElement>('.game-card__favorite')!;
  favBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const nowFav = toggleFavorite(game.id);
    favBtn.classList.toggle('is-active', nowFav);
    onFavoriteChange();
  });

  card.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.game-card__actions')) return;
    if ((e.target as HTMLElement).closest('.game-card__favorite')) return;
    openDetailModal(game, onTagClick, onAuthorClick, onFavoriteChange);
  });

  return card;
}

// ----------------------------------------------------------------------------
// ゲームカードのボタン(プレイ・DL・削除)
// ----------------------------------------------------------------------------

export interface ActionsElements {
  actionsEl: HTMLElement;
  progressWrapEl?: HTMLElement;
  progressBarEl?: HTMLElement;
}

export function renderGameActions(
  els: ActionsElements,
  game: GameEntry,
  status: GameStatus,
  onStatusChange: (status: GameStatus) => void,
  update?: UpdateInfo | null
) {
  const { actionsEl, progressWrapEl, progressBarEl } = els;
  actionsEl.innerHTML = '';

  if (game.type === 'web_link') {
    actionsEl.appendChild(makeButton('ブラウザで開く', () => playGame(game)));
    return;
  }

  if (status === 'not_downloaded') {
    const unsubBegin = subscribeBegin(game.id, () => {
      unsubBegin();
      onStatusChange('downloading');
    });
    actionsEl.appendChild(
      makeButton('ダウンロード', async (btn) => {
        btn.disabled = true;
        unsubBegin();
        onStatusChange('downloading');
        const success = await startDownload(game);
        onStatusChange(success ? 'downloaded' : 'not_downloaded');
      })
    );
  } else if (status === 'downloading') {
    const btn = makeButton('ダウンロード中…', () => {});
    btn.disabled = true;
    actionsEl.appendChild(btn);

    if (progressWrapEl) progressWrapEl.hidden = false;
    const current = getProgress(game.id);
    updateBar(current?.downloaded ?? 0, current?.total ?? 0);

    const unsubProgress = subscribeProgress(game.id, ({ downloaded, total }) =>
      updateBar(downloaded, total)
    );
    const unsubDone = subscribeDone(game.id, (result) => {
      unsubProgress();
      unsubDone();
      onStatusChange(result.success ? 'downloaded' : 'not_downloaded');
    });
  } else if (status === 'downloaded') {
    if (update) {
      // 確認ダイアログでキャンセルされたら begin は呼ばれないので、購読は解除して元の表示に戻す
      const unsubBegin = subscribeBegin(game.id, () => {
        unsubBegin();
        onStatusChange('downloading');
      });
      actionsEl.appendChild(
        makeButton(`アップデート(v${update.installed} → v${update.latest})`, async (btn) => {
          btn.disabled = true;
          const success = await startDownload(game);
          if (!success) {
            unsubBegin();
            onStatusChange(await getGameStatus(game.id));
          }
        })
      );
    }
    actionsEl.appendChild(makeButton('プレイ', () => playGame(game)));
    actionsEl.appendChild(makeButton('フォルダを開く', () => openGameFolder(game.id)));
    actionsEl.appendChild(
      makeButton(
        'アンインストール',
        async (btn) => {
          if (!confirm(`「${game.title}」をアンインストールしますか?`)) return;
          btn.disabled = true;
          try {
            await uninstallGame(game.id);
            onStatusChange('not_downloaded');
          } catch (err) {
            alert(`アンインストールに失敗しました: ${err}`);
            btn.disabled = false;
          }
        },
        'game-card__btn--danger'
      )
    );
  }

  function updateBar(downloaded: number, total: number) {
    if (!progressBarEl) return;
    const pct = total > 0 ? Math.round((downloaded / total) * 100) : 0;
    progressBarEl.style.width = `${pct}%`;
  }
}

function makeButton(
  label: string,
  onClick: (btn: HTMLButtonElement) => void,
  extraClass?: string
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = extraClass ? `game-card__btn ${extraClass}` : 'game-card__btn';
  btn.textContent = label;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(btn);
  });
  return btn;
}
