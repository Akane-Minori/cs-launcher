import { type GameEntry, type GameStatus, thumbUrl, renderFolderSize, renderRemoteSize, hideFolderSize, escapeHtml } from './api';
import { getGameStatus, fetchThumbnailDataUrl } from './fromRust';
import { isFavorite, toggleFavorite, getNote, setNote, PLAY_PERIODS, PLAY_PERIOD_LABELS, getPlayCount } from './localStore';
import { renderGameActions } from './gameCard';
import { isDownloading } from './downloadState';

// ----------------------------------------------------------------------------
// 詳細モーダル
// ----------------------------------------------------------------------------

export function openDetailModal(
  game: GameEntry,
  onTagClick: (tag: string) => void,
  onAuthorClick: (author: string) => void,
  onFavoriteChange: () => void
) {
  const images = [game.thumbnail_path, ...(game.screenshot_paths ?? [])];
  let currentIndex = 0;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__carousel">
        <img class="modal__carousel-img" src="${thumbUrl(game.id, images[0])}" alt="${escapeHtml(game.title)}">
        <button class="modal__close" type="button" aria-label="閉じる">×</button>
        ${
          images.length > 1
            ? `
          <button class="modal__carousel-arrow modal__carousel-arrow--prev" type="button" aria-label="前の画像">‹</button>
          <button class="modal__carousel-arrow modal__carousel-arrow--next" type="button" aria-label="次の画像">›</button>
          <div class="modal__carousel-dots">
            ${images.map((_, i) => `<span class="modal__carousel-dot${i === 0 ? ' is-active' : ''}" data-index="${i}"></span>`).join('')}
          </div>
        `
            : ''
        }
      </div>

      <div class="modal__body">
        <div class="modal__header-row">
          <h2 class="modal__title">${escapeHtml(game.title)}</h2>
          <button class="modal__favorite-btn${isFavorite(game.id) ? ' is-active' : ''}" id="modal-favorite-btn" type="button">
            ${isFavorite(game.id) ? '♥ いいね！' : '♡ いいね！'}
          </button>
        </div>
        <p class="modal__author">作者: ${
          game.authors && game.authors.length > 0
            ? game.authors
                .map(
                  (a) =>
                    `<button class="modal__author-link" data-author="${escapeHtml(a)}" type="button">${escapeHtml(a)}</button>`
                )
                .join(', ')
            : '不明'
        }</p>
        <p class="modal__plays">プレイ回数: ${PLAY_PERIODS.map((p) => `${PLAY_PERIOD_LABELS[p]} ${getPlayCount(game.id, p)}回`).join(' / ')}</p>
        <p class="modal__size" id="modal-size" hidden></p>

        <div class="modal__progress" hidden>
          <div class="modal__progress-bar"></div>
        </div>
        <div class="modal__actions"></div>

        <div class="modal__tags">
          ${game.tags
            .map(
              (t) =>
                `<button class="game-card__tag game-card__tag--clickable" data-tag="${escapeHtml(t)}" type="button">${escapeHtml(t)}</button>`
            )
            .join('')}
        </div>
        <p class="modal__description">${escapeHtml(game.description)}</p>

        <div class="modal__notes">
          <label class="modal__notes-label" for="modal-note-textarea">プレイ後メモ(このPCだけに保存されます)</label>
          <textarea id="modal-note-textarea" class="modal__notes-textarea" placeholder="感想やクリアした日など、自由にメモ">${escapeHtml(getNote(game.id))}</textarea>
        </div>

        <button class="game-card__btn modal__share-btn" id="modal-share-btn" type="button">🖼 紹介画像を保存</button>
      </div>
    </div>
  `;

  // アクションボタンの初期化(ステータス取得は非同期。モーダル表示自体は待たない)
  function updateActions(status: GameStatus) {
    renderGameActions(
      {
        actionsEl: overlay.querySelector<HTMLElement>('.modal__actions')!,
        progressWrapEl: overlay.querySelector<HTMLElement>('.modal__progress')!,
        progressBarEl: overlay.querySelector<HTMLElement>('.modal__progress-bar')!,
      },
      game,
      status,
      updateActions
    );

    const sizeEl = overlay.querySelector<HTMLElement>('#modal-size')!;
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
  (async () => {
  const status: GameStatus =
    game.type === 'web_link'
      ? 'downloaded'
      : isDownloading(game.id)
        ? 'downloading'
        : await getGameStatus(game.id);
    updateActions(status);
  })();

  const carouselImg = overlay.querySelector<HTMLImageElement>('.modal__carousel-img')!;
  const dots = overlay.querySelectorAll<HTMLElement>('.modal__carousel-dot');

  function showSlide(index: number) {
    currentIndex = (index + images.length) % images.length;
    carouselImg.src = thumbUrl(game.id, images[currentIndex]);
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === currentIndex));
  }

  overlay.querySelector('.modal__carousel-arrow--prev')?.addEventListener('click', () => showSlide(currentIndex - 1));
  overlay.querySelector('.modal__carousel-arrow--next')?.addEventListener('click', () => showSlide(currentIndex + 1));
  dots.forEach((dot) => dot.addEventListener('click', () => showSlide(Number(dot.dataset.index))));

  carouselImg.addEventListener('click', () => openImagePreview(game.id, images[currentIndex]));

  overlay.querySelectorAll<HTMLButtonElement>('.modal__tags [data-tag]').forEach((btn) => {
    btn.addEventListener('click', () => {
      onTagClick(btn.dataset.tag!);
      overlay.remove();
    });
  });

  overlay.querySelectorAll<HTMLButtonElement>('.modal__author [data-author]').forEach((btn) => {
    btn.addEventListener('click', () => {
      onAuthorClick(btn.dataset.author!);
      overlay.remove();
    });
  });

  const favBtn = overlay.querySelector<HTMLButtonElement>('#modal-favorite-btn')!;
  favBtn.addEventListener('click', () => {
    const nowFav = toggleFavorite(game.id);
    favBtn.classList.toggle('is-active', nowFav);
    favBtn.textContent = nowFav ? '♥ いいね！' : '♡ いいね！';
    onFavoriteChange();
  });

  const noteTextarea = overlay.querySelector<HTMLTextAreaElement>('#modal-note-textarea')!;
  let noteSaveTimer: ReturnType<typeof setTimeout> | null = null;
  noteTextarea.addEventListener('input', () => {
    if (noteSaveTimer) clearTimeout(noteSaveTimer);
    noteSaveTimer = setTimeout(() => setNote(game.id, noteTextarea.value), 400);
  });

  const shareBtn = overlay.querySelector<HTMLButtonElement>('#modal-share-btn')!;
  shareBtn.addEventListener('click', async () => {
    shareBtn.disabled = true;
    const original = shareBtn.textContent;
    shareBtn.textContent = '生成中...';
    try {
      await shareGame(game);
    } catch (err) {
      alert(`紹介画像の生成に失敗しました: ${err}`);
    } finally {
      shareBtn.disabled = false;
      shareBtn.textContent = original;
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector('.modal__close')!.addEventListener('click', () => overlay.remove());

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', onKeydown);
    } else if (e.key === 'ArrowLeft') {
      showSlide(currentIndex - 1);
    } else if (e.key === 'ArrowRight') {
      showSlide(currentIndex + 1);
    }
  };
  document.addEventListener('keydown', onKeydown);

  document.body.appendChild(overlay);
}

function openImagePreview(gameId: string, path: string) {
  const preview = document.createElement('div');
  preview.className = 'image-preview-overlay';
  preview.innerHTML = `<img class="image-preview-overlay__img" src="${thumbUrl(gameId, path)}">`;
  preview.addEventListener('click', () => preview.remove());
  document.body.appendChild(preview);
}

// ----------------------------------------------------------------------------
// 共有画像の生成
// ----------------------------------------------------------------------------

/** ゲーム1本分の紹介画像(サムネイル+タイトル+タグ)をCanvasで合成し、PNGとして保存する */
export async function shareGame(game: GameEntry): Promise<void> {
  const width = 1200;
  const height = 675; // 16:9

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvasの初期化に失敗しました');

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, width, height);

  const dataUrl = await fetchThumbnailDataUrl(game.id, game.thumbnail_path);
  const img = await loadImage(dataUrl);
  drawImageCover(ctx, img, 0, 0, width, height * 0.72);

  const textAreaY = height * 0.72;
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(0, textAreaY, width, height - textAreaY);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px "Segoe UI", sans-serif';
  ctx.textBaseline = 'top';
  wrapText(ctx, game.title, 32, textAreaY + 20, width - 64, 50, 2);

  ctx.font = '24px "Segoe UI", sans-serif';
  ctx.fillStyle = '#ccc';
  ctx.fillText(game.tags.map((t) => `#${t}`).join('  '), 32, textAreaY + 110, width - 64);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像の生成に失敗しました'))), 'image/png');
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${game.title}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    img.src = src;
  });
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (imgRatio > boxRatio) {
    sw = img.height * boxRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / boxRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const chars = [...text];
  let line = '';
  const lines: string[] = [];
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line !== '') {
      lines.push(line);
      line = ch;
      if (lines.length === maxLines - 1) break;
    } else {
      line = test;
    }
  }
  lines.push(line);
  lines.slice(0, maxLines).forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}

