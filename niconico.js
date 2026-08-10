'use strict'

const listEl = document.getElementById('comment-list')
const emptyStateEl = document.getElementById('empty-state')
const qrcodeEl = document.getElementById('qrcode')
if (!listEl || !emptyStateEl || !qrcodeEl) {
  throw new Error('#comment-list / #empty-state / #qrcode が見つかりません。/view から開いてください。')
}

/** リストに保持する最大件数。超えた分は古い項目から間引く。 */
const MAX_ITEMS = 30
const POLL_MS = 500
/** QR コードの誤り訂正レベル（'L' | 'M' | 'Q' | 'H'）。 */
const QR_ERROR_CORRECTION_LEVEL = 'M'

/**
 * コメント投稿ページ（ルート URL）を指す QR コードを SVG で描画する。
 * ホストは実行時の location から動的に取得するため、ローカル／本番のどちらでも正しい URL になる。
 */
const renderQrCode = () => {
  const postUrl = `${location.origin}/`
  const qr = qrcode(0, QR_ERROR_CORRECTION_LEVEL)
  qr.addData(postUrl)
  qr.make()
  qrcodeEl.innerHTML = qr.createSvgTag({ scalable: true })
}

/**
 * コメントの有無に応じて QR コード（空状態）とリストの表示を切り替える。
 */
const syncEmptyState = () => {
  emptyStateEl.style.display = listEl.children.length === 0 ? '' : 'none'
}

renderQrCode()
syncEmptyState()

/**
 * epoch ms を時刻文字列に変換する。
 *
 * @param {number} createdAt 投稿時刻（epoch ms）。
 * @returns {string}
 */
const formatTime = (createdAt) => {
  if (typeof createdAt !== 'number' || Number.isNaN(createdAt)) {
    return '--:--:--'
  }
  return new Date(createdAt).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/**
 * コメント 1 件の DOM を生成する。
 *
 * @param {{ text?: string, createdAt?: number }} comment コメント。
 * @returns {HTMLLIElement}
 */
const renderCommentItem = (comment) => {
  const item = document.createElement('li')
  item.className = 'comment-item'

  const timeEl = document.createElement('div')
  timeEl.className = 'comment-time'
  timeEl.textContent = formatTime(comment.createdAt)

  const textEl = document.createElement('p')
  textEl.className = 'comment-text'
  textEl.textContent = typeof comment.text === 'string' ? comment.text : ''

  item.append(timeEl, textEl)
  return item
}

/**
 * コメントをリスト先頭に追加し、上限を超えた古い項目を末尾から間引く。
 *
 * @param {{ text?: string, createdAt?: number }} comment コメント。
 */
const addCommentToList = (comment) => {
  listEl.prepend(renderCommentItem(comment))
  while (listEl.children.length > MAX_ITEMS) {
    listEl.lastElementChild.remove()
  }
  syncEmptyState()
}

/** Lambda 相当のキューから未配信分を取得しリストに追加する（サーバは返却後に破棄）。 */
let lastCommentId = 0
/** 前回の fetch が終わる前に次を走らせない（重複 GET で取りこぼしやすい）。 */
let pollInFlight = false

/**
 * 未配信コメントを取得しリストへ追加する（同一コメントの再取得はサーバ側で抑止）。
 *
 * @returns {Promise<void>}
 */
const pollComments = async () => {
  if (pollInFlight) {
    return
  }
  pollInFlight = true
  try {
    const res = await fetch(`/api/comments?after=${lastCommentId}`)
    if (!res.ok) {
      return
    }
    const data = await res.json()
    const list = Array.isArray(data.comments) ? data.comments : []
    for (const c of list) {
      if (typeof c.id === 'number') {
        lastCommentId = Math.max(lastCommentId, c.id)
      }
      if (typeof c.text === 'string' && c.text) {
        addCommentToList(c)
      }
    }
  } catch (err) {
    console.error('pollComments failed', err)
  } finally {
    pollInFlight = false
  }
}

setInterval(pollComments, POLL_MS)
pollComments()
