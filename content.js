// whaaaa content script
(() => {
  if (window.__whaaaaLoaded__) return;
  window.__whaaaaLoaded__ = true;

  const UI_ID = "whaaaa-root";
  const SIDEBAR_W = 300;

  // 表示モード切替アイコン（クリックで切り替わる先を表す）
  const ICON_TO_POPUP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243-1.59-1.59"/></svg>`;
  const ICON_TO_SIDEBAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16"/></svg>`;

  // padding / margin の各辺アイコン
  const RECT = `<rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5"/>`;
  const SIDE_ICON = {
    t: `<svg viewBox="0 0 24 24" fill="none">${RECT}<path d="M6 4h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    b: `<svg viewBox="0 0 24 24" fill="none">${RECT}<path d="M6 20h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    l: `<svg viewBox="0 0 24 24" fill="none">${RECT}<path d="M4 6v12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    r: `<svg viewBox="0 0 24 24" fill="none">${RECT}<path d="M20 6v12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  };
  // border-radius の各隅アイコン
  const CORNER_ICON = {
    tl: `<svg viewBox="0 0 24 24" fill="none"><path d="M6.4 17.6V10.6A4.2 4.2 0 0 1 10.6 6.4H17.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    tr: `<svg viewBox="0 0 24 24" fill="none"><path d="M6.4 6.4H13.4A4.2 4.2 0 0 1 17.6 10.6V17.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    bl: `<svg viewBox="0 0 24 24" fill="none"><path d="M17.6 17.6H10.6A4.2 4.2 0 0 1 6.4 13.4V6.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    br: `<svg viewBox="0 0 24 24" fill="none"><path d="M17.6 6.4V13.4A4.2 4.2 0 0 1 13.4 17.6H6.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  };

  // 表示する状態。hover / focus は該当 CSS ルールの selectorText を一時的に
  // マーカークラスへ書き換え、対象要素にそのクラスを付けて状態を強制する。
  const STATES = {
    default: null,
    hover: {},
    focus: {},
  };

  let enabled = false;
  let locked = false; // パネル固定中（ホバー追従を止める）
  let currentState = "default";
  let root = null;
  let sidebar = null;
  let highlight = null;
  let regionEl = null; // padding/margin バンドのハイライト用オーバーレイ
  let killStyle = null; // 検査中の transition 無効化用 <style>
  let bodyEl = null;
  let typeEl = null;
  let currentEl = null;
  // ホバーの滞留判定（タブへ移動する途中で通過した要素を拾わないため）
  let pendingEl = null;
  let hoverTimer = null;
  const HOVER_DWELL = 80;

  // 表示モード: "sidebar"（右パネル）/ "popup"（カーソル周辺の浮遊パネル）
  let mode = "popup";
  let popup = null; // ポップアップのシェル
  let content = null; // ヘッダー+タブ+ボディの共有パネル（モード間で出し入れ）
  let modeBtn = null;
  const popupAnchor = { x: 0, y: 0 }; // ポップアップ位置（カーソル基準）

  // ---- ユーティリティ ---------------------------------------------------

  function parseRGB(str) {
    const m = str && str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(",").map((s) => s.trim());
    const r = parseFloat(parts[0]);
    const g = parseFloat(parts[1]);
    const b = parseFloat(parts[2]);
    const a = parts.length > 3 ? parseFloat(parts[3]) : 1;
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return { r, g, b, a };
  }

  function toHex2(n) {
    return Math.round(n).toString(16).padStart(2, "0");
  }

  function round(n, d = 0) {
    const p = Math.pow(10, d);
    return Math.round(n * p) / p;
  }

  function px(str) {
    const n = parseFloat(str);
    if (Number.isNaN(n)) return str;
    return round(n, 2) + "px";
  }

  // 単位なしの数値表示（"10px" → "10"、"auto" などはそのまま）
  function numOnly(str) {
    const n = parseFloat(str);
    if (Number.isNaN(n)) return str;
    return String(round(n, 2));
  }

  // hex は # なし大文字、不透明度は % 別表示。コピーは # 付き。
  function colorParts(str) {
    const c = parseRGB(str);
    if (!c) return { hex: "—", pct: "", copy: "", swatch: str };
    if (c.a === 0) return { hex: "Transparent", pct: "0", copy: "transparent", swatch: "transparent" };
    const hex = (toHex2(c.r) + toHex2(c.g) + toHex2(c.b)).toUpperCase();
    return { hex, pct: String(round(c.a * 100)), copy: "#" + hex, swatch: str };
  }

  function shorthand4(t, r, b, l) {
    const vals = [t, r, b, l].map((v) => px(v));
    if (vals.every((v) => v === vals[0])) return vals[0];
    if (vals[0] === vals[2] && vals[1] === vals[3]) return `${vals[0]} ${vals[1]}`;
    return vals.join(" ");
  }

  // トップレベル（括弧の外）のカンマで分割
  function splitTopComma(str) {
    const out = [];
    let depth = 0;
    let cur = "";
    for (const c of str) {
      if (c === "(") depth++;
      else if (c === ")") depth--;
      if (c === "," && depth === 0) {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    if (cur.trim()) out.push(cur);
    return out;
  }

  // 1つの box-shadow を {inset, color, x, y, blur, spread} に分解
  function parseShadow(s) {
    s = s.trim();
    let inset = false;
    if (/(^|\s)inset(\s|$)/.test(s)) {
      inset = true;
      s = s.replace(/\binset\b/, " ").trim();
    }
    let color = "rgb(0, 0, 0)";
    const m = s.match(/rgba?\([^)]*\)|#[0-9a-fA-F]+/);
    if (m) {
      color = m[0];
      s = (s.slice(0, m.index) + s.slice(m.index + m[0].length)).trim();
    }
    const nums = s.split(/\s+/).filter(Boolean);
    return {
      inset,
      color,
      x: nums[0] || "0px",
      y: nums[1] || "0px",
      blur: nums[2] || "0px",
      spread: nums[3] || "0px",
    };
  }

  function lineHeight(cs) {
    if (cs.lineHeight === "normal") return "Auto";
    const lh = parseFloat(cs.lineHeight);
    const fs = parseFloat(cs.fontSize);
    const ratio = fs ? round(lh / fs, 2) : null;
    return ratio ? `${px(cs.lineHeight)} · ${ratio}` : px(cs.lineHeight);
  }

  function weightName(w) {
    const map = {
      100: "Thin",
      200: "Extra Light",
      300: "Light",
      400: "Regular",
      500: "Medium",
      600: "Semi Bold",
      700: "Bold",
      800: "Extra Bold",
      900: "Black",
    };
    return map[w] ? `${map[w]} · ${w}` : String(w);
  }

  function cleanFamily(f) {
    return f.replace(/"/g, "").split(",")[0].trim() || f.replace(/"/g, "");
  }

  // その要素が自前のテキストを表示するか
  function showsText(el) {
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") {
      return (
        (!!el.value && !!el.value.trim()) ||
        (!!el.placeholder && !!el.placeholder.trim())
      );
    }
    if (tag === "SELECT") {
      const opt = el.selectedOptions && el.selectedOptions[0];
      return !!(opt && opt.textContent.trim());
    }
    // 直下に空白でないテキストノードがあるか
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim()) return true;
    }
    return false;
  }

  // ---- DOM 構築 ---------------------------------------------------------

  function buildUI() {
    root = document.createElement("div");
    root.id = UI_ID;
    root.setAttribute("data-whaaaa", "ui");

    highlight = document.createElement("div");
    highlight.className = "wa-highlight";
    highlight.setAttribute("data-whaaaa", "ui");

    regionEl = document.createElement("div");
    regionEl.className = "wa-region";
    regionEl.setAttribute("data-whaaaa", "ui");

    // サイドバー / ポップアップのシェル（中身は共有 content を出し入れする）
    sidebar = document.createElement("div");
    sidebar.className = "wa-sidebar";
    sidebar.setAttribute("data-whaaaa", "ui");

    popup = document.createElement("div");
    popup.className = "wa-popup";
    popup.setAttribute("data-whaaaa", "ui");
    popup.style.display = "none";

    // 共有パネル（ヘッダー + タブ + ボディ）。モード切替でシェル間を移動する。
    content = document.createElement("div");
    content.className = "wa-panel";
    content.innerHTML = `
      <div class="wa-header">
        <div class="wa-type"><span class="wa-hint">ページの要素にカーソルを合わせてください</span></div>
        <button class="wa-mode" type="button" title="ポップアップ表示に切替">${ICON_TO_POPUP}</button>
        <button class="wa-close" title="閉じる (Esc)">×</button>
      </div>
      <div class="wa-tabs">
        <button class="wa-tab wa-tab-active" data-state="default">Default</button>
        <button class="wa-tab" data-state="hover">Hover</button>
        <button class="wa-tab" data-state="focus">Focus</button>
      </div>
      <div class="wa-body"></div>
    `;
    sidebar.appendChild(content); // 初期配置（実際の表示先は applyMode() が決める）

    root.appendChild(highlight);
    root.appendChild(regionEl);
    root.appendChild(sidebar);
    root.appendChild(popup);
    document.documentElement.appendChild(root);

    typeEl = content.querySelector(".wa-type");
    bodyEl = content.querySelector(".wa-body");
    modeBtn = content.querySelector(".wa-mode");

    content.querySelector(".wa-close").addEventListener("click", disable);
    content.querySelectorAll(".wa-tab").forEach((t) =>
      t.addEventListener("click", () => setState(t.dataset.state))
    );
    modeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setMode(mode === "sidebar" ? "popup" : "sidebar");
    });
    // ヘッダーの要素名/セレクタをクリックで文字列コピー（見た目は変えない）
    typeEl.title = "クリックでセレクタをコピー";
    typeEl.addEventListener("click", () => {
      if (currentEl) copySelector(currentEl);
    });
  }

  // ---- 表示モード（サイドバー / ポップアップ）----------------------------

  function updateModeButton() {
    if (!modeBtn) return;
    if (mode === "popup") {
      modeBtn.innerHTML = ICON_TO_SIDEBAR;
      modeBtn.title = "サイドバー表示に切替";
    } else {
      modeBtn.innerHTML = ICON_TO_POPUP;
      modeBtn.title = "ポップアップ表示に切替";
    }
  }

  // モードに応じて content をシェルへ移し、表示と本体押し出しを切り替える
  function applyMode() {
    if (!root) return;
    if (mode === "popup") {
      if (content.parentElement !== popup) popup.appendChild(content);
      popup.style.display = enabled ? "flex" : "none";
      sidebar.style.display = "none";
      document.documentElement.classList.remove("wa-pushed");
      if (enabled) positionPopup();
    } else {
      if (content.parentElement !== sidebar) sidebar.appendChild(content);
      sidebar.style.display = enabled ? "flex" : "none";
      popup.style.display = "none";
      document.documentElement.classList.toggle("wa-pushed", enabled);
    }
    updateModeButton();
  }

  function setMode(m) {
    if (m !== "sidebar" && m !== "popup") return;
    mode = m;
    applyMode();
    if (currentEl) render(currentEl); // 移動先で描き直し
    if (mode === "popup") positionPopup(); // 中身確定後に位置決め（切替時の1回だけ）
  }

  // ポップアップを基本カーソルの右下に配置する。
  // 縦は通常カーソルの下に出し、長い内容は「カーソル下〜画面下端」に max-height を収めて
  // 内部スクロール。ただし下に取れる高さが小さすぎ、かつ上の方が広ければ上に逃がす。
  // 横は右側優先で、右にはみ出すときだけ左へ回す。
  const POPUP_MIN_H = 180; // 下にこれ未満しか取れず上の方が広ければ上に出す
  function positionPopup() {
    if (!popup || mode !== "popup" || !enabled) return;
    const OFF = 16;
    const M = 8;
    const below = window.innerHeight - (popupAnchor.y + OFF) - M; // 下に取れる高さ
    const above = popupAnchor.y - OFF - M; // 上に取れる高さ
    const placeAbove = below < POPUP_MIN_H && above > below;

    // その方向に取れる空間を最大高さにし、高さ確定後に縦位置を決める
    popup.style.maxHeight = Math.max(0, placeAbove ? above : below) + "px";
    const rect = popup.getBoundingClientRect();
    let top = placeAbove
      ? popupAnchor.y - OFF - rect.height // 上: カーソルの上に積む
      : popupAnchor.y + OFF; // 下: カーソルの右下（基本）
    if (top < M) top = M;
    popup.style.top = Math.round(top) + "px";

    // 横: 右側優先。右にはみ出すときだけ左へ回し、最後に画面内へクランプ。
    let left = popupAnchor.x + OFF;
    if (left + rect.width > window.innerWidth - M) left = popupAnchor.x - OFF - rect.width;
    if (left < M) left = M;
    popup.style.left = Math.round(left) + "px";
  }

  // ---- 部品 -------------------------------------------------------------

  function field(label, value, opts = {}) {
    const f = document.createElement("button");
    f.className =
      "wa-field" + (opts.color ? " wa-field-color" : "");
    f.type = "button";

    if (opts.color) {
      const chip = document.createElement("span");
      chip.className = "wa-chip";
      chip.style.setProperty("--c", opts.swatch || "transparent");
      f.appendChild(chip);
    } else if (opts.icon) {
      const ic = document.createElement("span");
      ic.className = "wa-ficon";
      ic.innerHTML = opts.icon;
      f.appendChild(ic);
    } else if (label) {
      const lab = document.createElement("span");
      lab.className = "wa-flabel";
      lab.textContent = label;
      f.appendChild(lab);
    }

    const val = document.createElement("span");
    val.className = "wa-fval";
    val.textContent = value == null || value === "" ? "—" : value;
    f.appendChild(val);

    if (opts.suffix) {
      const sfx = document.createElement("span");
      sfx.className = "wa-fsuffix";
      sfx.textContent = opts.suffix;
      f.appendChild(sfx);
    }

    const copied = document.createElement("span");
    copied.className = "wa-copied";
    copied.textContent = "Copied";
    f.appendChild(copied);

    const copyVal = opts.copy != null ? opts.copy : value;
    f.addEventListener("click", () => copyValue(copyVal === "—" ? "" : copyVal, f));
    return f;
  }

  function section(title, parent) {
    const s = document.createElement("div");
    s.className = "wa-section";
    const h = document.createElement("div");
    h.className = "wa-sec-title";
    h.textContent = title;
    s.appendChild(h);
    parent.appendChild(s);
    return s;
  }

  function sub(sec, ...labels) {
    const r = document.createElement("div");
    r.className = "wa-sub wa-cols-" + labels.length;
    labels.forEach((t) => {
      const span = document.createElement("span");
      span.textContent = t;
      r.appendChild(span);
    });
    sec.appendChild(r);
  }

  function grid(sec, ...fields) {
    const g = document.createElement("div");
    g.className = "wa-grid wa-cols-" + fields.length;
    fields.forEach((f) => g.appendChild(f));
    sec.appendChild(g);
  }

  // ヘッダーの要素セレクタ（tag#id.class…）を組み立てる。マーカークラスは除外。
  function buildSelector(el) {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const classes = Array.from(el.classList).filter((c) => !c.startsWith("wa-s-"));
    return tag + id + (classes.length ? "." + classes.join(".") : "");
  }

  // ヘッダーのセレクタ文字列をコピーし、wa-type-sel を一瞬 "Copied" に差し替える。
  function copySelector(el) {
    const sel = buildSelector(el);
    if (!sel) return;
    const target = typeEl && typeEl.querySelector(".wa-type-sel");
    const orig = target ? target.textContent : "";
    const done = () => {
      if (!target) return;
      target.textContent = "Copied";
      clearTimeout(target._waT);
      target._waT = setTimeout(() => {
        if (target.textContent === "Copied") target.textContent = orig;
      }, 900);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(sel).then(done, () => fallbackCopy(sel, done));
    } else {
      fallbackCopy(sel, done);
    }
  }

  function copyValue(text, el) {
    if (!text) return;
    const done = () => {
      el.classList.add("wa-show-copied");
      clearTimeout(el._waT);
      el._waT = setTimeout(() => el.classList.remove("wa-show-copied"), 900);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    root.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      done();
    } catch (e) {}
    ta.remove();
  }

  // ---- 状態（hover / focus）のスタイル取得 ------------------------------

  const SNAP_PROPS = [
    "color", "backgroundColor", "backgroundImage",
    "borderTopColor", "borderTopStyle", "borderTopWidth",
    "borderRightColor", "borderRightStyle", "borderRightWidth",
    "borderBottomColor", "borderBottomStyle", "borderBottomWidth",
    "borderLeftColor", "borderLeftStyle", "borderLeftWidth",
    "borderTopLeftRadius", "borderTopRightRadius",
    "borderBottomRightRadius", "borderBottomLeftRadius", "fontFamily",
    "fontSize", "fontWeight", "lineHeight", "letterSpacing",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "marginTop", "marginRight", "marginBottom", "marginLeft",
    "opacity", "boxShadow",
    "display", "rowGap", "columnGap",
  ];

  function snapshot(cs) {
    const o = {};
    for (const p of SNAP_PROPS) o[p] = cs[p];
    return o;
  }

  // ---- selectorText のその場書き換え（Storybook pseudo-states 方式）-----
  // :hover / :focus 系のセレクタをマーカークラスへ置換し、対象要素にクラスを
  // 付けて状態を強制する。クラスは擬似クラスと同じ詳細度(0,1,0)で位置も不変な
  // ため、カスケード・詳細度・@media/@layer 文脈が正確に保たれる。

  // 書き換え済みルールの記録（restore 用）。{ rule, original }
  let rewrittenRules = [];
  const rewrittenSet = new WeakSet(); // 同じルールを二重に書き換えないため
  let skippedSheets = 0; // クロスオリジン等で読めなかったシート数

  // selectorText を持ち :hover / :focus を含むルールを書き換える。
  // 置換は :focus-within / :focus-visible を先に処理してから素の :focus を処理。
  function rewriteSelector(sel) {
    return sel
      .replace(/:focus-within/g, ".wa-s-fw")
      .replace(/:focus-visible/g, ".wa-s-focus")
      .replace(/:focus/g, ".wa-s-focus")
      .replace(/:hover/g, ".wa-s-hover");
  }

  // document.styleSheets + adoptedStyleSheets を再帰走査して書き換える。
  // 書き換え済み（selectorText に .wa-s- を含む / rewrittenSet 登録済み）は飛ばす
  // ため冪等。SPA が後からシートを注入するケースに備え随時呼べる。
  function rewriteSheets() {
    skippedSheets = 0;

    function walk(rules) {
      for (const rule of rules) {
        // スタイルルール（CSS ネストで子ルールを持つこともある）
        if (rule.selectorText != null && rule.style) {
          const sel = rule.selectorText;
          if (
            !rewrittenSet.has(rule) &&
            sel.indexOf(".wa-s-") === -1 &&
            (sel.indexOf(":hover") !== -1 || sel.indexOf(":focus") !== -1)
          ) {
            const next = rewriteSelector(sel);
            if (next !== sel) {
              try {
                rule.selectorText = next;
                rewrittenSet.add(rule);
                rewrittenRules.push({ rule, original: sel });
              } catch (e) {
                // パーサが拒否したら元のまま放置してスキップ
              }
            }
          }
          // 子ルール（CSS ネスト）も辿る
          if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules);
        } else if (rule.styleSheet) {
          // @import
          try {
            if (rule.styleSheet.cssRules) walk(rule.styleSheet.cssRules);
          } catch (e) {
            skippedSheets++;
          }
        } else if (rule.cssRules) {
          // @media / @layer / @supports / @container / @scope などのグループ
          walk(rule.cssRules);
        }
      }
    }

    const sheets = Array.from(document.styleSheets);
    // Constructable Stylesheet（CSS-in-JS / Web Components）も対象に
    if (document.adoptedStyleSheets) sheets.push(...document.adoptedStyleSheets);
    for (const sheet of sheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch (e) {
        skippedSheets++; // クロスオリジンのシートは読めない
        continue;
      }
      if (rules) walk(rules);
    }
  }

  // 書き換えたセレクタを元へ戻す（逆順）。disable() から呼ぶ。
  function restoreRewrites() {
    for (let i = rewrittenRules.length - 1; i >= 0; i--) {
      const { rule, original } = rewrittenRules[i];
      try {
        rule.selectorText = original;
      } catch (e) {
      } finally {
        // selectorText 代入が throw しても rewrittenSet からは必ず外す。
        // 残すと再 enable 時に rewriteSheets() でスキップされ二度と書き換わらない。
        rewrittenSet.delete(rule);
      }
    }
    rewrittenRules = [];
  }

  // ---- 状態マーカーの適用 -----------------------------------------------

  // いまマーカークラスを付けている要素群（restore 用）
  let markedEls = [];

  // 付けたマーカークラスを全部外す
  function removeStateMarkers() {
    for (const el of markedEls) {
      el.classList.remove("wa-s-hover", "wa-s-focus", "wa-s-fw");
    }
    markedEls = [];
  }

  // 指定要素の祖先チェーン（documentElement まで。自前 UI は除く）
  function ancestorChain(el) {
    const out = [];
    let n = el.parentElement;
    while (n) {
      if (!isOurUI(n)) out.push(n);
      n = n.parentElement;
    }
    return out;
  }

  // 書き換え後ルールのうち、対応マーカーを含むものに el / 子孫 / 祖先のどれかが
  // matches するか調べ、この状態の指定が存在すれば true を返す。
  function hasStateRule(el, markerSels) {
    const chain = ancestorChain(el);
    for (const { rule } of rewrittenRules) {
      const sel = rule.selectorText;
      if (!markerSels.some((m) => sel.indexOf(m) !== -1)) continue;
      // セレクタリスト（.a:hover, .b → .a.wa-s-hover, .b）では、マーカーと無関係な
      // パート（.b）にマッチしただけで誤判定するのを避けるため、トップレベルカンマで
      // 分割しマーカークラスを含むパートだけを判定対象にする。
      for (const part of splitTopComma(sel)) {
        const p = part.trim();
        if (!markerSels.some((m) => p.indexOf(m) !== -1)) continue;
        try {
          if (el.matches(p)) return true;
          if (el.querySelector(p)) return true; // 子孫（.card:hover .title 等）
          for (const a of chain) {
            if (a.matches(p)) return true; // 祖先（group-hover 等）
          }
        } catch (e) {}
      }
    }
    return false;
  }

  // 指定状態（hover/focus）のマーカークラスを要素群に付与し、その状態の指定が
  // 存在するか（プレビューで値が変わりうるか）を boolean で返す。
  function applyStateMarkers(el, stateName) {
    removeStateMarkers();
    rewriteSheets(); // SPA の後追い注入に備え再走査（冪等・低コスト）

    if (stateName === "hover") {
      // 実ホバーは祖先全部に :hover が立つので el ＋全祖先に付与
      el.classList.add("wa-s-hover");
      markedEls.push(el);
      for (const a of ancestorChain(el)) {
        a.classList.add("wa-s-hover");
        markedEls.push(a);
      }
      return hasStateRule(el, [".wa-s-hover"]);
    }

    if (stateName === "focus") {
      // :focus は el 自身のみ、:focus-within は el ＋全祖先
      el.classList.add("wa-s-focus", "wa-s-fw");
      markedEls.push(el);
      for (const a of ancestorChain(el)) {
        a.classList.add("wa-s-fw");
        markedEls.push(a);
      }
      return hasStateRule(el, [".wa-s-focus", ".wa-s-fw"]);
    }

    return false;
  }

  // ---- 描画 -------------------------------------------------------------

  function render(el) {
    // 非 default タブなら、その状態のマーカークラスを要素群に付ける
    // （セレクタ書き換えによりページ側も実際にその状態の見た目になる）
    const cfg = STATES[currentState];
    let noState = false;
    if (cfg) {
      noState = !applyStateMarkers(el, currentState);
    } else {
      removeStateMarkers();
    }
    const isState = !!cfg;

    const cs = snapshot(getComputedStyle(el));
    const rect = el.getBoundingClientRect();

    // タイプ名 + 状態ヒント
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    // マーカークラス（wa-s-*）はヘッダーのセレクタ表示に混ぜない
    const userClasses = Array.from(el.classList).filter((c) => !c.startsWith("wa-s-"));
    const cls = userClasses.length ? "." + userClasses.slice(0, 2).join(".") : "";
    const noStateHint =
      skippedSheets > 0
        ? `:${currentState} の指定なし（読み取れない外部CSSあり）`
        : `:${currentState} の指定なし`;
    const stateHint =
      isState && noState ? `<span class="wa-nostate">${noStateHint}</span>` : "";
    typeEl.innerHTML =
      `<span class="wa-type-name">${tag}</span><span class="wa-type-sel">${id}${cls}</span>` +
      stateHint;

    bodyEl.innerHTML = "";

    const layout = section("Layout", bodyEl);
    sub(layout, "Size");
    grid(
      layout,
      field("W", round(rect.width, 2) + "px", { copy: round(rect.width, 2) + "px" }),
      field("H", round(rect.height, 2) + "px", { copy: round(rect.height, 2) + "px" })
    );
    // Gap（flex / grid で gap が効いているときだけ）
    const isFlexGrid = /flex|grid/.test(cs.display);
    const rowGap = parseFloat(cs.rowGap);
    const colGap = parseFloat(cs.columnGap);
    if (isFlexGrid && (rowGap > 0 || colGap > 0)) {
      const gapText = cs.rowGap === cs.columnGap ? px(cs.rowGap) : `${px(cs.rowGap)} ${px(cs.columnGap)}`;
      sub(layout, "Gap");
      grid(layout, field(null, gapText, { copy: gapText }));
    }
    // Padding / Margin（全辺 0 のものは出さない）
    const allZero = (props) => props.every((p) => parseFloat(cs[p]) === 0);
    const padZero = allZero(["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]);
    const marZero = allZero(["marginTop", "marginRight", "marginBottom", "marginLeft"]);

    // アイコン + 数値の 2x2（辺セルは type を渡すと hover でページ側バンドをハイライト）
    const quad = (type, defs) => {
      const g = document.createElement("div");
      g.className = "wa-grid wa-quad";
      defs.forEach((d) => {
        const f = field(null, numOnly(cs[d.prop]), { icon: d.icon, copy: px(cs[d.prop]) });
        if (type) {
          f.addEventListener("mouseenter", () => showRegion(type, d.side));
          f.addEventListener("mouseleave", hideRegion);
        }
        g.appendChild(f);
      });
      return g;
    };

    if (!padZero) {
      sub(layout, "Padding");
      layout.appendChild(quad("padding", [
        { icon: SIDE_ICON.l, prop: "paddingLeft", side: "l" },
        { icon: SIDE_ICON.t, prop: "paddingTop", side: "t" },
        { icon: SIDE_ICON.r, prop: "paddingRight", side: "r" },
        { icon: SIDE_ICON.b, prop: "paddingBottom", side: "b" },
      ]));
    }
    if (!marZero) {
      sub(layout, "Margin");
      layout.appendChild(quad("margin", [
        { icon: SIDE_ICON.l, prop: "marginLeft", side: "l" },
        { icon: SIDE_ICON.t, prop: "marginTop", side: "t" },
        { icon: SIDE_ICON.r, prop: "marginRight", side: "r" },
        { icon: SIDE_ICON.b, prop: "marginBottom", side: "b" },
      ]));
    }

    // Appearance（Opacity は 100% 未満のとき / Corner radius は 0 でないときだけ）
    const radiusZero = allZero([
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomRightRadius",
      "borderBottomLeftRadius",
    ]);
    const opacity = parseFloat(cs.opacity);
    const showOpacity = !Number.isNaN(opacity) && opacity < 1;
    if (showOpacity || !radiusZero) {
      const appearance = section("Appearance", bodyEl);
      if (showOpacity) {
        sub(appearance, "Opacity");
        grid(
          appearance,
          field(null, round(opacity * 100, 1) + "%", { copy: cs.opacity })
        );
      }
      if (!radiusZero) {
        sub(appearance, "Corner radius");
        appearance.appendChild(quad(null, [
          { icon: CORNER_ICON.tl, prop: "borderTopLeftRadius" },
          { icon: CORNER_ICON.tr, prop: "borderTopRightRadius" },
          { icon: CORNER_ICON.bl, prop: "borderBottomLeftRadius" },
          { icon: CORNER_ICON.br, prop: "borderBottomRightRadius" },
        ]));
      }
    }

    // Text（タイポグラフィ + 文字色）— 自前テキストを持つ要素のときだけ表示
    if (showsText(el)) {
      const text = section("Text", bodyEl);
      grid(text, field(null, cleanFamily(cs.fontFamily), {
        copy: cs.fontFamily.replace(/"/g, ""),
      }));
      grid(
        text,
        field(null, weightName(cs.fontWeight), { copy: cs.fontWeight }),
        field(null, px(cs.fontSize), { copy: px(cs.fontSize) })
      );
      sub(text, "Line height", "Letter spacing");
      grid(
        text,
        field("LH", lineHeight(cs), {
          copy: cs.lineHeight === "normal" ? "normal" : px(cs.lineHeight),
        }),
        field("LS", cs.letterSpacing === "normal" ? "Auto" : px(cs.letterSpacing), {
          copy: cs.letterSpacing === "normal" ? "normal" : px(cs.letterSpacing),
        })
      );
      sub(text, "Color");
      const tc = colorParts(cs.color);
      grid(text, field(null, tc.hex, {
        color: true, swatch: tc.swatch, suffix: tc.pct ? tc.pct + " %" : "", copy: tc.copy,
      }));
    }

    // Fill（背景色）— 透明（塗りなし）かつ背景画像も無ければ非表示
    const bgc = parseRGB(cs.backgroundColor);
    const hasBgImage = cs.backgroundImage && cs.backgroundImage !== "none";
    const hasFill = (bgc && bgc.a > 0) || hasBgImage;
    if (hasFill) {
      const fill = section("Fill", bodyEl);
      const bg = colorParts(cs.backgroundColor);
      grid(fill, field(null, bg.hex, {
        color: true, swatch: bg.swatch, suffix: bg.pct ? bg.pct + " %" : "", copy: bg.copy,
      }));
    }

    // Stroke（ボーダー）— 四辺いずれかにボーダーがある時だけ。辺ごとに異なれば各辺を表示。
    const SIDES = [
      { key: "Top", w: "borderTopWidth", s: "borderTopStyle", c: "borderTopColor" },
      { key: "Right", w: "borderRightWidth", s: "borderRightStyle", c: "borderRightColor" },
      { key: "Bottom", w: "borderBottomWidth", s: "borderBottomStyle", c: "borderBottomColor" },
      { key: "Left", w: "borderLeftWidth", s: "borderLeftStyle", c: "borderLeftColor" },
    ];
    const presentSides = SIDES.filter(
      (sd) => cs[sd.s] !== "none" && parseFloat(cs[sd.w]) > 0
    );
    if (presentSides.length) {
      const stroke = section("Stroke", bodyEl);
      const first = presentSides[0];
      const colorsSame = presentSides.every((sd) => cs[sd.c] === cs[first.c]);
      const stylesSame = presentSides.every((sd) => cs[sd.s] === cs[first.s]);

      // Color（表示中の辺が全部同じ色なら1つ、違えば各辺）
      if (colorsSame) {
        const cp = colorParts(cs[first.c]);
        grid(stroke, field(null, cp.hex, {
          color: true, swatch: cp.swatch, suffix: cp.pct ? cp.pct + " %" : "", copy: cp.copy,
        }));
      } else {
        presentSides.forEach((sd) => {
          sub(stroke, sd.key);
          const cp = colorParts(cs[sd.c]);
          grid(stroke, field(null, cp.hex, {
            color: true, swatch: cp.swatch, suffix: cp.pct ? cp.pct + " %" : "", copy: cp.copy,
          }));
        });
      }

      // Style + Weight を 2 列で並べる（辺ごとに違えば space 区切りの shorthand）
      const styleVal = stylesSame
        ? cs[first.s]
        : presentSides.map((sd) => cs[sd.s]).join(" ");
      const weightVal = shorthand4(
        cs.borderTopWidth,
        cs.borderRightWidth,
        cs.borderBottomWidth,
        cs.borderLeftWidth
      );
      sub(stroke, "Style", "Weight");
      grid(
        stroke,
        field(null, styleVal, { copy: styleVal }),
        field(null, weightVal, { copy: weightVal })
      );
    }

    // Effects（実際に見える box-shadow がある時だけ）
    const shadows =
      cs.boxShadow && cs.boxShadow !== "none"
        ? splitTopComma(cs.boxShadow)
            .map((raw) => ({ raw, p: parseShadow(raw) }))
            .filter(({ p }) => {
              const c = parseRGB(p.color);
              const visible = !c || c.a > 0; // 透明は影なし扱い
              const moved = [p.x, p.y, p.blur, p.spread].some((v) => parseFloat(v) !== 0);
              return visible && moved;
            })
        : [];
    if (shadows.length) {
      const effects = section("Effects", bodyEl);
      shadows.forEach(({ raw, p }) => {
        sub(effects, p.inset ? "Inner shadow" : "Drop shadow");
        const cp = colorParts(p.color);
        grid(
          effects,
          field(null, cp.hex, {
            color: true,
            swatch: cp.swatch,
            suffix: cp.pct ? cp.pct + " %" : "",
            copy: raw.trim(), // CSS にそのまま貼れる値
          })
        );
        // X/Y/Blur/Spread のうち 0 でないものだけ表示
        const metrics = [
          { label: "X", v: p.x },
          { label: "Y", v: p.y },
          { label: "Blur", v: p.blur },
          { label: "Spread", v: p.spread },
        ].filter((m) => parseFloat(m.v) !== 0);
        if (metrics.length) {
          sub(effects, ...metrics.map((m) => m.label));
          const g = document.createElement("div");
          g.className = "wa-grid";
          g.style.gridTemplateColumns = "1fr ".repeat(metrics.length).trim();
          metrics.forEach((m) =>
            g.appendChild(field(null, px(m.v), { copy: px(m.v) }))
          );
          effects.appendChild(g);
        }
      });
    }
  }

  function setState(s) {
    if (!STATES.hasOwnProperty(s) || currentState === s) return;
    currentState = s;
    content.querySelectorAll(".wa-tab").forEach((t) =>
      t.classList.toggle("wa-tab-active", t.dataset.state === s)
    );
    // Hover/Focus プレビューは実ホバーに依存しないよう自動で固定する。
    // （固定すればマウスを離しても状態が保たれ、Default との比較もできる）
    if (STATES[s] && currentEl && !locked) {
      setLocked(true, currentEl); // 内部で render される
    } else if (currentEl) {
      render(currentEl);
    }
  }

  // ---- ハイライト -------------------------------------------------------

  const HL_GAP = 6; // 要素の外側にこのぶん離して枠を描く（中身を隠さない）

  function moveHighlight(el) {
    const rect = el.getBoundingClientRect();
    highlight.style.display = "block";
    highlight.style.top = rect.top - HL_GAP + "px";
    highlight.style.left = rect.left - HL_GAP + "px";
    highlight.style.width = rect.width + HL_GAP * 2 + "px";
    highlight.style.height = rect.height + HL_GAP * 2 + "px";
  }

  // padding / margin の該当バンドをページ側にハイライト（DevTools 風）
  function sideCap(s) {
    return s === "t" ? "Top" : s === "b" ? "Bottom" : s === "l" ? "Left" : "Right";
  }

  function showRegion(type, sideName) {
    if (!currentEl || !regionEl) return;
    const r = currentEl.getBoundingClientRect();
    const s = getComputedStyle(currentEl);
    const num = (v) => parseFloat(v) || 0;
    const bt = num(s.borderTopWidth);
    const bb = num(s.borderBottomWidth);
    const bl = num(s.borderLeftWidth);
    const br = num(s.borderRightWidth);
    let x, y, w, h;
    if (type === "padding") {
      const p = num(s["padding" + sideCap(sideName)]);
      if (p <= 0) return hideRegion();
      if (sideName === "t") { x = r.left + bl; y = r.top + bt; w = r.width - bl - br; h = p; }
      else if (sideName === "b") { x = r.left + bl; y = r.bottom - bb - p; w = r.width - bl - br; h = p; }
      else if (sideName === "l") { x = r.left + bl; y = r.top + bt; w = p; h = r.height - bt - bb; }
      else { x = r.right - br - p; y = r.top + bt; w = p; h = r.height - bt - bb; }
    } else {
      const m = num(s["margin" + sideCap(sideName)]);
      if (m <= 0) return hideRegion();
      if (sideName === "t") { x = r.left; y = r.top - m; w = r.width; h = m; }
      else if (sideName === "b") { x = r.left; y = r.bottom; w = r.width; h = m; }
      else if (sideName === "l") { x = r.left - m; y = r.top; w = m; h = r.height; }
      else { x = r.right; y = r.top; w = m; h = r.height; }
    }
    regionEl.style.display = "block";
    regionEl.style.left = x + "px";
    regionEl.style.top = y + "px";
    regionEl.style.width = Math.max(0, w) + "px";
    regionEl.style.height = Math.max(0, h) + "px";
    regionEl.style.background =
      type === "padding" ? "rgba(120, 200, 120, 0.5)" : "rgba(228, 170, 110, 0.5)";
  }

  function hideRegion() {
    if (regionEl) regionEl.style.display = "none";
  }

  // ---- 階層ナビ ---------------------------------------------------------

  // 自分の UI 要素を除いた最初の子要素
  function firstChildEl(el) {
    if (!el || !el.children) return null;
    for (const c of el.children) {
      if (isOurUI(c)) continue;
      return c;
    }
    return null;
  }

  // 自分の UI を除いた前/次の兄弟
  function siblingEl(el, forward) {
    let n = el;
    do {
      n = forward ? n.nextElementSibling : n.previousElementSibling;
    } while (n && isOurUI(n));
    return n;
  }

  // 親→子へ戻るとき、どの子から上がってきたかを覚えておく（parent => その子）
  const navDescend = new WeakMap();

  // 上=親 / 下=子 へ選択を移す（固定状態は維持）
  function selectHierarchy(dir) {
    if (!currentEl) return;
    let next = null;
    if (dir === "up") {
      next = currentEl.parentElement;
      if (!next || isOurUI(next)) return;
      navDescend.set(next, currentEl); // この親に下がるときは元の子へ戻す
    } else {
      // 上がったときの元の子が今も子なら、それを優先（無ければ最初の子）
      const remembered = navDescend.get(currentEl);
      next =
        remembered && remembered.parentElement === currentEl
          ? remembered
          : firstChildEl(currentEl);
      if (!next) return;
    }
    currentEl = next;
    moveHighlight(next);
    render(next);
  }

  // 同じ親の中だけを前/次へ（兄弟移動のみ。グループはまたがない）。
  function selectSibling(dir) {
    if (!currentEl) return;
    const target = siblingEl(currentEl, dir === "next");
    if (!target) return; // 端まで来たら止まる
    const parent = target.parentElement;
    if (parent) navDescend.set(parent, target);
    currentEl = target;
    moveHighlight(target);
    render(target);
  }

  // ---- イベント ---------------------------------------------------------

  function isOurUI(el) {
    return el && el.closest && el.closest('[data-whaaaa="ui"]');
  }

  function onMouseMove(e) {
    if (locked) return; // 固定中は追従しない
    const el = e.target;
    if (!el || isOurUI(el)) {
      // パネル（自分の UI）へ入った時点で保留中の選択を確定させない＝
      // タブへ移動する途中で通過した要素を拾わないようにする
      clearTimeout(hoverTimer);
      pendingEl = null;
      return;
    }
    if (mode === "popup") {
      popupAnchor.x = e.clientX;
      popupAnchor.y = e.clientY;
    }
    if (el === currentEl) {
      // 既に確定済みの要素上 → 保留をクリアし、ポップアップ位置だけ追従
      clearTimeout(hoverTimer);
      pendingEl = null;
      if (mode === "popup") positionPopup();
      return;
    }
    // 新しい要素は少し滞留してから確定（素早く通過した要素は無視）
    if (el !== pendingEl) {
      pendingEl = el;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        if (!pendingEl || pendingEl === currentEl) return;
        currentEl = pendingEl;
        pendingEl = null;
        moveHighlight(currentEl);
        render(currentEl);
        if (mode === "popup") positionPopup();
      }, HOVER_DWELL);
    }
  }

  function onScroll() {
    if (currentEl && !isOurUI(currentEl)) moveHighlight(currentEl);
  }

  // ウィンドウの高さ/幅が変わったら追従する。サイドバーは CSS の 100vh で自動的に
  // 縮むが、ポップアップは表示位置を固定したままなので、ビューポートに収まるよう
  // 位置を再クランプする（max-height は CSS 側でビューポートに追従済み）。
  function onResize() {
    if (!enabled) return;
    if (currentEl && !isOurUI(currentEl)) moveHighlight(currentEl);
    if (mode === "popup") positionPopup();
  }

  function onKey(e) {
    if (e.key === "Escape") {
      disable();
      return;
    }
    // 固定中の移動。←/↑=前の兄弟、→/↓=次の兄弟、Enter=子へ / Shift+Enter=親へ。
    if (locked && currentEl) {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        selectSibling("prev");
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        selectSibling("next");
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        selectHierarchy(e.shiftKey ? "up" : "down");
      }
    }
  }

  // ページのクリック等を抑制（ブラウザ側を動かさない）。UI 上は通す。
  function suppress(e) {
    if (isOurUI(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
  }

  // クリックした要素を選択（固定）。同じ要素を再クリックしたら解除。
  function onClick(e) {
    if (isOurUI(e.target)) return; // コピーボタン等は通す
    e.preventDefault();
    e.stopPropagation();
    const el = e.target;
    if (locked && el === currentEl) {
      setLocked(false); // 同じ要素をもう一度 → 解除してホバーに戻す
    } else {
      // クリック固定は常に Default から始める（マウスが乗っている＝hover の
      // 見え方や、直前のタブ状態を引きずらないように）。hover/focus を見たい
      // ときは固定後にタブを押せばよい。
      currentState = "default";
      content.querySelectorAll(".wa-tab").forEach((t) =>
        t.classList.toggle("wa-tab-active", t.dataset.state === "default")
      );
      setLocked(true, el); // クリックした要素へ選択を移す（Default で描画）
    }
    blurPageFocus(); // クリックでフォーカスが付いても塗りを残さない
  }

  function setLocked(on, el) {
    locked = on;
    if (on && el && !isOurUI(el)) {
      currentEl = el;
      moveHighlight(el);
    }
    if (highlight) highlight.classList.toggle("wa-hl-locked", on);
    if (currentEl) render(currentEl); // 固定バッジ・ナビ状態を反映
  }

  // ---- 有効 / 無効 ------------------------------------------------------

  // 抑制対象イベント（ページ側を動かさないため capture で握りつぶす）
  const SUPPRESS_EVENTS = [
    "mousedown",
    "mouseup",
    "pointerdown",
    "pointerup",
    "dblclick",
    "auxclick",
    "contextmenu",
    "submit",
  ];

  // 検査中はページ要素にフォーカスを残さない（:focus / :focus-within の塗りを防ぐ）
  function onFocusIn(e) {
    if (isOurUI(e.target)) return;
    if (e.target && typeof e.target.blur === "function") e.target.blur();
  }

  function blurPageFocus() {
    const a = document.activeElement;
    if (a && !isOurUI(a) && typeof a.blur === "function") a.blur();
  }

  function enable() {
    if (enabled) return;
    enabled = true;
    if (!root) buildUI();
    root.style.display = "block";
    // :hover / :focus セレクタを書き換えてネイティブ状態を無効化＆強制可能に
    rewriteSheets();
    // 検査中は transition を停止（適用直後でも遷移後の値が読めるように）。
    // 自前 UI のアニメは殺さない。animation は触らない。
    if (!killStyle) {
      killStyle = document.createElement("style");
      killStyle.setAttribute("data-whaaaa", "ui");
      killStyle.textContent =
        ":where(:not(#whaaaa-root):not(#whaaaa-root *)) { transition: none !important; }";
    }
    document.documentElement.appendChild(killStyle);
    applyMode(); // モードに応じてサイドバー/ポップアップを表示・本体押し出し
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("focusin", onFocusIn, true);
    SUPPRESS_EVENTS.forEach((t) => document.addEventListener(t, suppress, true));
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    document.addEventListener("keydown", onKey, true);
    blurPageFocus();
  }

  function disable() {
    if (!enabled) return;
    enabled = false;
    clearTimeout(hoverTimer);
    pendingEl = null;
    setLocked(false);
    removeStateMarkers(); // 付けた状態マーカークラスを外す
    restoreRewrites(); // 書き換えた selectorText を元に戻す
    if (killStyle && killStyle.parentNode) killStyle.parentNode.removeChild(killStyle); // transition 無効化を解除
    currentEl = null;
    if (root) root.style.display = "none";
    if (highlight) highlight.style.display = "none";
    document.documentElement.classList.remove("wa-pushed");
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("focusin", onFocusIn, true);
    SUPPRESS_EVENTS.forEach((t) => document.removeEventListener(t, suppress, true));
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("keydown", onKey, true);
  }

  function toggle() {
    enabled ? disable() : enable();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "WHAAAA_TOGGLE") toggle();
  });
})();
