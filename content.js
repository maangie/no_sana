// 高市早苗関連の画像を猫に置き換えるコンテンツスクリプト
// 判定は alt / title / src / aria-label / 親要素のキャプション等のテキストで行う（顔認識は行わない）

/**
 * 置き換え対象を判定するためのキーワード正規表現の一覧。
 * @type {RegExp[]}
 */
const KEYWORDS = [
  /sanae\s*takaichi/i,
  /takaichi/i,
  /高市[・ ]?早苗/,
  /高市(首相|総理|氏|大臣|総裁|政権|内閣)/,
  /高市/  // ※高市郡・高市駅など地名にも引っかかるので不要なら削除
];

/**
 * 猫画像の URL を生成する。
 * 末尾にランダムなクエリを付けてブラウザキャッシュを回避し、毎回異なる猫を取得する。
 * @returns {string} cataas.com の猫画像 URL（800x600）
 */
const CAT_URL = () => `https://cataas.com/cat?width=800&height=600&_=${Math.random().toString(36).slice(2)}`;

/**
 * テキストが置き換え対象のキーワードに一致するか判定する。
 * @param {string|null|undefined} text 判定対象のテキスト
 * @returns {boolean} いずれかのキーワードに一致すれば true、テキストが空なら false
 */
function matchesTarget(text) {
  if (!text) return false;
  return KEYWORDS.some(
    /**
     * 個々のキーワード正規表現をテキストに適用する。
     * @param {RegExp} re 判定に使うキーワード正規表現
     * @returns {boolean} 一致すれば true
     */
    re => re.test(text)
  );
}

/**
 * 画像の判定材料となる周辺テキストを収集して連結する。
 * img 自身の属性に加え、figure / picture / a / [role="img"] の祖先要素から
 * figcaption・aria-label・title も拾う。
 * @param {HTMLImageElement} img 対象の img 要素
 * @returns {string} 収集したテキストを半角スペースで連結した文字列
 */
function contextText(img) {
  const parts = [img.alt, img.title, img.src, img.getAttribute('aria-label')];
  const fig = img.closest('figure, picture, a, [role="img"]');
  if (fig) {
    const cap = fig.querySelector('figcaption');
    if (cap) parts.push(cap.textContent);
    parts.push(fig.getAttribute('aria-label'), fig.getAttribute('title'));
  }
  return parts.filter(Boolean).join(' ');
}

/**
 * img 要素が対象と判定されれば猫画像に差し替える。
 * 元の表示サイズを固定してレイアウト崩れを防ぎ、srcset / sizes / <source> を除去して
 * ブラウザが元画像を再選択しないようにする。処理済みの要素は dataset.catified で二重処理を防ぐ。
 * @param {HTMLImageElement} img 差し替え対象の img 要素
 * @returns {void}
 */
function replaceImg(img) {
  if (img.dataset.catified) return;
  if (!matchesTarget(contextText(img))) return;
  img.dataset.catified = '1';
  const w = img.width || img.naturalWidth;
  const h = img.height || img.naturalHeight;
  if (w) img.style.width = w + 'px';
  if (h) img.style.height = h + 'px';
  img.style.objectFit = 'cover';
  img.removeAttribute('srcset');
  img.removeAttribute('sizes');
  // <picture> 内の <source> も無効化
  img.closest('picture')?.querySelectorAll('source').forEach(
    /**
     * <picture> 配下の source 要素を DOM から取り除く。
     * @param {HTMLSourceElement} s 除去する source 要素
     * @returns {void}
     */
    s => s.remove()
  );
  img.src = CAT_URL();
  img.alt = 'a cat';
}

/**
 * background-image に画像を指定している要素を走査し、対象なら猫画像に差し替える。
 * @param {ParentNode} root 走査の起点となる要素またはドキュメント
 * @returns {void}
 */
function replaceBackgrounds(root) {
  root.querySelectorAll('[style*="background"]').forEach(
    /**
     * 背景画像を持つ要素を判定し、対象であれば猫画像に差し替える。
     * @param {HTMLElement} el 判定対象の要素
     * @returns {void}
     */
    el => {
      if (el.dataset.catified) return;
      const bg = el.style.backgroundImage || '';
      const text = [bg, el.getAttribute('aria-label'), el.title, el.textContent?.slice(0, 200)].join(' ');
      if (bg.includes('url(') && matchesTarget(text)) {
        el.dataset.catified = '1';
        el.style.backgroundImage = `url("${CAT_URL()}")`;
        el.style.backgroundSize = 'cover';
      }
    }
  );
}

/**
 * 指定範囲内の img 要素と背景画像をまとめて走査し、対象を猫画像に差し替える。
 * @param {ParentNode} [root=document] 走査の起点。省略時はドキュメント全体
 * @returns {void}
 */
function scan(root = document) {
  root.querySelectorAll?.('img').forEach(replaceImg);
  replaceBackgrounds(root);
}

scan();

// 動的に追加される画像にも対応
/**
 * DOM の変更を監視し、動的に追加・変更された画像を猫画像に差し替える MutationObserver。
 * @type {MutationObserver}
 */
const observer = new MutationObserver(
  /**
   * 検出された DOM 変更を処理する。
   * img の属性変更時は catified フラグを消して再判定し、追加ノードは走査対象にする。
   * @param {MutationRecord[]} mutations 検出された変更レコードの一覧
   * @returns {void}
   */
  mutations => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.target.tagName === 'IMG') {
        delete m.target.dataset.catified;
        replaceImg(m.target);
      }
      m.addedNodes.forEach(
        /**
         * 追加されたノードを差し替え処理にかける。
         * img ならそのまま差し替え、それ以外は配下を走査する。
         * @param {Node} n 追加されたノード
         * @returns {void}
         */
        n => {
          if (n.nodeType !== 1) return;
          if (n.tagName === 'IMG') replaceImg(n);
          else scan(n);
        }
      );
    }
  }
);

/**
 * ドキュメント全体の監視を開始する。
 * 子ノードの増減（childList）を子孫要素まで（subtree）追い、
 * 画像判定に関わる alt / src / title の属性変更（attributes, attributeFilter）も検知する。
 */
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['alt', 'src', 'title']
});
