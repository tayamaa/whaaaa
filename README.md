# whaaaa — hover したら色とか値とか教えてくれる Chrome 拡張

拡張ボタンを押すとポップアップインスペクターが開きます。


## インストール（開発者モード）

1. Chrome で `chrome://extensions` を開く
2. 右上の「デベロッパーモード」を ON
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. このフォルダ（`whaaaa`）を選択


## 状態の切り替え （Default / Hover / Focus）

上部のタブで、表示する状態を切り替えられます。

- **Default**: 通常時の computed style
- **Hover / Focus**: 該当する CSS ルールの**セレクタを一時的に書き換えて状態を強制**します。`:hover` → `.wa-s-hover`、`:focus`/`:focus-visible` → `.wa-s-focus`、`:focus-within` → `.wa-s-fw` のように置き換え、対象要素（および祖先）にそのクラスを付けて表示します。


## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `manifest.json` | 拡張の定義（Manifest V3） |
| `background.js` | 拡張ボタンのクリックで content script にトグル通知 |
| `content.js` | サイドバー生成・ホバー検出・スタイル表示・コピー |
| `content.css` | サイドバーとハイライトのスタイル |
| `icons/` | アイコン（16 / 32 / 48 / 128px） |


## 補足・既知の制限

- `chrome://` や Chrome ウェブストアなど、拡張を注入できないページでは動作しません。
- 値はレンダリング後の computed style です（`width`/`height` は実際の描画サイズ）。
- 色は不透明なら HEX、半透明なら `rgba(...)`です。


## クレジット

- 一部の UI アイコン（展開/折りたたみ）は [Heroicons](https://heroicons.com/)（MIT License）の SVG パスを使用しています。


## ライセンス・免責

- 本ソフトウェアは [MIT License](LICENSE) のもとで提供されます。
- 「現状のまま」提供され、いかなる保証もありません。**利用は自己責任**でお願いします。本ソフトウェアの使用により生じたいかなる損害についても、作者は責任を負いません。
