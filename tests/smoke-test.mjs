import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const NativeDate = Date;
const FIXED_NOW = NativeDate.parse("2026-06-27T12:00:00+09:00");
globalThis.Date = class FixedDate extends NativeDate {
  constructor(...args) {
    super(...(args.length ? args : [FIXED_NOW]));
  }
  static now() { return FIXED_NOW; }
};

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  toggle(name, force) {
    const active = force === undefined ? !this.values.has(name) : Boolean(force);
    if (active) this.values.add(name); else this.values.delete(name);
    return active;
  }
  contains(name) { return this.values.has(name); }
}

const elements = new Map();
const downloads = [];

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.value = "";
    this.checked = false;
    this.dataset = {};
    this.classList = new FakeClassList();
    this.style = {};
    this.handlers = new Map();
    this._innerHTML = "";
    this.textContent = "";
    this.files = [];
  }
  set innerHTML(value) {
    this._innerHTML = String(value);
    if (this.id.includes("Major") || this.id.includes("Sub") || this.id === "expenseMajor" || this.id === "expenseSub") {
      const options = this._innerHTML.match(/<option\b[^>]*>/g) || [];
      const chosen = options.find(option => /\bselected\b/.test(option)) || options[0];
      const match = chosen?.match(/value="([^"]*)"/);
      this.value = match ? match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&") : "";
    }
  }
  get innerHTML() { return this._innerHTML; }
  addEventListener(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(handler);
  }
  async dispatch(type, extras = {}) {
    const event = { type, target: this, preventDefault() {}, stopPropagation() {}, ...extras };
    for (const handler of this.handlers.get(type) || []) await handler(event);
  }
  setAttribute(name, value) { this[name] = String(value); }
  removeAttribute(name) { delete this[name]; }
  querySelector() { return null; }
  closest() { return null; }
  scrollIntoView() {}
  focus() {}
  remove() {}
  click() { downloads.push({ filename: this.download, href: this.href }); }
  reset() {
    if (this.id === "expenseForm") {
      ["expenseId", "expenseDate", "expenseAmount", "expenseMajor", "expenseSub", "expenseMemo"].forEach(id => { getElement(id).value = ""; });
    }
  }
}

function getElement(id) {
  if (!elements.has(id)) elements.set(id, new FakeElement(id));
  return elements.get(id);
}

globalThis.document = {
  body: new FakeElement("body"),
  querySelector(selector) {
    if (selector.startsWith("#")) return getElement(selector.slice(1));
    return null;
  },
  querySelectorAll() { return []; },
  getElementById: getElement,
  createElement(tag) { return new FakeElement(tag); },
  addEventListener() {}
};
document.body.appendChild = () => {};

globalThis.window = {
  scrollTo() {},
  setTimeout,
  clearTimeout
};

const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.get(key) ?? null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); }
};

const prompts = [];
globalThis.prompt = (_message, defaultValue = "") => prompts.shift() ?? defaultValue ?? "テスト";
globalThis.confirm = () => true;
globalThis.alert = message => { throw new Error(`Unexpected alert: ${message}`); };

await import("../app.js");

const key = "mainichiKakeibo_v1";
const readState = () => JSON.parse(storage.get(key));
const styleText = await readFile(new URL("../style.css", import.meta.url), "utf8");
const indexText = await readFile(new URL("../index.html", import.meta.url), "utf8");

assert.equal(readState().categories.length, 12, "初期カテゴリ数");
assert.equal(readState().version, 2.3, "保存データをv2.3として正規化");
assert.deepEqual(readState().categories.slice(0, 3).map(item => item.name), ["食費", "交際費", "日用品"], "よく使うカテゴリを先頭に表示");
assert.ok(readState().categories.slice(-4).every(item => item.group === "固定費"), "固定費カテゴリを下に表示");
assert.equal(readState().budgets.living, 150000, "生活費初期予算");
assert.equal(readState().categories.filter(item => item.group === "固定費").reduce((total, item) => total + item.budget, 0), 239300, "固定費初期予算合計");
assert.equal(readState().categories.filter(item => item.group === "生活費").reduce((total, item) => total + item.budget, 0) + readState().budgets.tobacco, 150000, "生活費カテゴリ予算とタバコ専用予算の合計");
assert.equal(getElement("livingCategoryBudgetTotal").textContent, "¥143,000", "生活費の大カテゴリ予算合計");
assert.equal(getElement("fixedCategoryBudgetTotal").textContent, "¥239,300", "固定費の大カテゴリ予算合計");
assert.equal(getElement("allCategoryBudgetTotal").textContent, "¥382,300", "全体の大カテゴリ予算合計");
assert.equal(getElement("monthTotal").textContent, "¥0", "初期ホーム合計");
assert.equal(getElement("todayAvailable").textContent, "¥32,750", "対象日常費を月末までの日数で割る");
assert.ok(getElement("categoryProgressList").innerHTML.indexOf("生活費") < getElement("categoryProgressList").innerHTML.indexOf("固定費"), "予算進捗は生活費を先に表示");
assert.match(getElement("expenseDateDisplay").textContent, /^\d{4}年\d{1,2}月\d{1,2}日/, "日付を読みやすく表示");
assert.match(getElement("filterMonthDisplay").textContent, /^\d{4}年\d{1,2}月$/, "表示月を読みやすく表示");

getElement("expenseDate").value = "2026-06-27";
getElement("expenseAmount").value = "1100";
getElement("expenseMajor").value = "食費";
await getElement("expenseMajor").dispatch("change");
getElement("expenseSub").value = "仕事中食費";
getElement("expenseMemo").value = "ラーメン";
await getElement("expenseForm").dispatch("submit");

assert.equal(readState().expenses.length, 1, "手入力登録");
assert.equal(readState().expenses[0].source, "manual", "手入力source");
assert.equal(getElement("monthTotal").textContent, "¥1,100", "登録後ホーム更新");
assert.equal(getElement("todayAvailable").textContent, "¥32,475", "対象日常費の支出を差し引いて日額を算出");

prompts.push("昼ごはん");
await getElement("saveQuickButton").dispatch("click");
assert.equal(readState().quickInputs.length, 1, "クイック入力登録");

await getElement("continueButton").dispatch("click");
assert.equal(getElement("expenseDate").value, "2026-06-27", "連続入力の日付維持");
assert.equal(getElement("expenseAmount").value, "", "連続入力の金額リセット");

const quickId = readState().quickInputs[0].id;
await getElement("quickInputList").dispatch("click", {
  target: { closest: () => ({ dataset: { quickId } }) }
});
assert.equal(getElement("expenseAmount").value, 1100, "クイック入力の反映");
assert.equal(readState().expenses.length, 1, "クイック入力は即登録しない");

const firstExpenseId = readState().expenses[0].id;
await getElement("transactionList").dispatch("click", {
  target: { closest: () => ({ dataset: { expenseId: firstExpenseId } }) }
});
await getElement("detailEditButton").dispatch("click");
getElement("expenseAmount").value = "1200";
getElement("expenseMemo").value = "ラーメン大盛り";
await getElement("expenseForm").dispatch("submit");
assert.equal(readState().expenses[0].amount, 1200, "明細編集");

await getElement("transactionList").dispatch("click", {
  target: { closest: () => ({ dataset: { expenseId: firstExpenseId } }) }
});
prompts.push("大盛りランチ");
await getElement("detailQuickButton").dispatch("click");
assert.equal(readState().quickInputs.length, 2, "明細詳細からクイック入力登録");

const firstQuickId = readState().quickInputs[0].id;
const quickEditButton = {
  dataset: { quickAction: "edit" },
  closest(selector) {
    if (selector === "[data-quick-action]") return this;
    if (selector === "[data-quick-id]") return { dataset: { quickId: firstQuickId } };
    return null;
  }
};
await getElement("settingsQuickList").dispatch("click", { target: quickEditButton });
getElement("quickEditLabel").value = "昼ごはん更新";
getElement("quickEditAmount").value = "1250";
await getElement("quickEditForm").dispatch("submit");
assert.equal(readState().quickInputs[0].label, "昼ごはん更新", "クイック入力編集");

const secondQuickId = readState().quickInputs[1].id;
const quickDeleteButton = {
  dataset: { quickAction: "delete" },
  closest(selector) {
    if (selector === "[data-quick-action]") return this;
    if (selector === "[data-quick-id]") return { dataset: { quickId: secondQuickId } };
    return null;
  }
};
await getElement("settingsQuickList").dispatch("click", { target: quickDeleteButton });
assert.equal(readState().quickInputs.length, 1, "クイック入力削除");

getElement("csvPaste").value = [
  "date,amount,majorCategory,subCategory,memo",
  "2026-06-28,712,食費,食費,テスト1",
  "2026-06-28,1926,食費,家飲み,テスト2",
  "2026-06-25,4654,日用品,日用品,テスト3"
].join("\n");
getElement("csvSource").value = "receipt";
await getElement("previewCsvButton").dispatch("click");
assert.match(getElement("csvPreviewSummary").textContent, /3件を選択・合計 ¥7,292/, "指定CSV3件のプレビュー");
assert.match(getElement("csvPreviewList").innerHTML, /6\/28/, "通常表示の日付は短く表示");
assert.match(getElement("csvPreviewList").innerHTML, /食費 <span>＞<\/span> 食費/, "通常カードにカテゴリを表示");
assert.match(getElement("csvPreviewList").innerHTML, /テスト1/, "通常カードにメモを表示");
assert.match(getElement("csvPreviewList").innerHTML, />編集<\/button>/, "通常カードに編集ボタンを表示");
assert.doesNotMatch(getElement("csvPreviewList").innerHTML, /class="csv-inline-editor"/, "通常表示では編集パネルを出さない");
const firstCsvId = getElement("csvPreviewList").innerHTML.match(/data-csv-id="([^"]+)"/)?.[1];
const csvActionTarget = (action, rowId = firstCsvId) => ({
  closest(selector) {
    if (selector === "[data-csv-action]") return { dataset: { csvAction: action } };
    if (selector === "[data-csv-id]") return { dataset: { csvId: rowId } };
    return null;
  }
});
const csvInteractiveTarget = {
  closest(selector) {
    if (selector === "[data-csv-id]") return { dataset: { csvId: firstCsvId } };
    if (selector === "input, select, label, button") return {};
    return null;
  }
};
await getElement("csvPreviewList").dispatch("click", { target: csvInteractiveTarget });
assert.doesNotMatch(getElement("csvPreviewList").innerHTML, /class="csv-inline-editor"/, "チェックボックス操作では編集パネルを誤展開しない");
await getElement("csvPreviewList").dispatch("click", { target: csvActionTarget("toggle") });
assert.match(getElement("csvPreviewList").innerHTML, /<\/article>\s*<section class="csv-inline-editor"/, "編集パネルをカード直後の独立要素として表示");
assert.match(getElement("csvPreviewList").innerHTML, /class="csv-date-input" type="text"/, "展開時の日付は固定形式で編集");
assert.match(getElement("csvPreviewList").innerHTML, /data-csv-field="amount"/, "編集パネルに金額入力を表示");
assert.match(getElement("csvPreviewList").innerHTML, /data-csv-field="majorCategory"/, "編集パネルに大カテゴリ選択を表示");
assert.match(getElement("csvPreviewList").innerHTML, /data-csv-field="subCategory"/, "編集パネルに小カテゴリ選択を表示");
assert.match(getElement("csvPreviewList").innerHTML, /data-csv-field="memo"/, "編集パネルにメモ入力を表示");
const csvIds = [...getElement("csvPreviewList").innerHTML.matchAll(/<article class="csv-preview-card[^>]*data-csv-id="([^"]+)"/g)].map(match => match[1]);
await getElement("csvPreviewList").dispatch("click", { target: csvActionTarget("toggle", csvIds[1]) });
assert.equal((getElement("csvPreviewList").innerHTML.match(/class="csv-inline-editor"/g) || []).length, 1, "同時に開く編集パネルは1件だけ");
assert.match(getElement("csvPreviewList").innerHTML, new RegExp(`<section class="csv-inline-editor" data-csv-id="${csvIds[1]}`), "2件目のカード直下へ編集パネルを移動");
const amountEditTarget = {
  dataset: { csvField: "amount" },
  value: "2000",
  closest(selector) { return selector === "[data-csv-id]" ? { dataset: { csvId: csvIds[1] } } : null; }
};
await getElement("csvPreviewList").dispatch("input", { target: amountEditTarget });
assert.match(getElement("csvPreviewSummary").textContent, /¥7,366/, "金額編集をサマリーへ即時反映");
const memoEditTarget = {
  dataset: { csvField: "memo" },
  value: "テスト2更新",
  closest(selector) { return selector === "[data-csv-id]" ? { dataset: { csvId: csvIds[1] } } : null; }
};
await getElement("csvPreviewList").dispatch("input", { target: memoEditTarget });
await getElement("csvPreviewList").dispatch("click", { target: csvActionTarget("toggle", csvIds[1]) });
assert.match(getElement("csvPreviewList").innerHTML, /¥2,000/, "編集後の金額を一覧へ反映");
assert.match(getElement("csvPreviewList").innerHTML, /テスト2更新/, "編集後のメモを一覧へ反映");
assert.match(styleText, /\.csv-preview-card\s*\{[^}]*overflow:\s*visible/s, "コンパクトカードの高さを制限しない");
assert.match(styleText, /\.csv-inline-editor \.csv-date-input\s*\{[^}]*max-width:\s*100%/s, "iPhoneの日付入力をパネル幅以内に制限");
assert.match(styleText, /\.csv-inline-editor\s*\{[^}]*display:\s*grid[^}]*width:\s*100%[^}]*gap:/s, "独立編集パネルを縦並び・全幅表示");
assert.match(indexText, /style\.css\?v=2\.3/, "Safariに最新CSSを読み込ませる");
assert.match(indexText, /app\.js\?v=2\.3/, "Safariに最新JavaScriptを読み込ませる");
await getElement("importCsvButton").dispatch("click");
assert.equal(readState().expenses.length, 4, "CSV取り込み");
assert.equal(readState().expenses.filter(item => item.source === "receipt").length, 3, "選択したデータ元を保存");
assert.equal(getElement("filterMonth").value, "2026-06", "取り込み後は一番新しい日付の月を表示");
assert.equal(getElement("drinkMonthRemaining").textContent, "¥5,000", "家飲み月残り");
assert.equal(getElement("drinkWeekRemaining").textContent, "−¥367", "家飲み週目安と残り");

getElement("filterMajor").value = "日用品";
await getElement("filterMajor").dispatch("change");
assert.equal(getElement("transactionCount").textContent, "1件", "カテゴリ絞り込み");

const dailyExpenseId = readState().expenses.find(item => item.majorCategory === "日用品").id;
await getElement("transactionList").dispatch("click", {
  target: { closest: () => ({ dataset: { expenseId: dailyExpenseId } }) }
});
await getElement("detailDeleteButton").dispatch("click");
assert.equal(readState().expenses.length, 3, "明細削除");

getElement("csvPaste").value = [
  "date,amount,majorCategory,subCategory,memo",
  "2026-06-27,1200,食費,仕事中食費,ラーメン大盛り",
  "2026-06-29,333,食費,食費,CSV重複テスト",
  "2026-06-29,333,食費,食費,CSV重複テスト"
].join("\n");
await getElement("previewCsvButton").dispatch("click");
const duplicateCards = getElement("csvPreviewList").innerHTML.split("<article").slice(1);
const registeredDuplicateCard = duplicateCards.find(card => card.includes("ラーメン大盛り"));
const csvOnlyDuplicateCards = duplicateCards.filter(card => card.includes("CSV重複テスト"));
assert.match(registeredDuplicateCard, /登録済みかも/, "登録済み明細との重複を区別");
assert.doesNotMatch(registeredDuplicateCard, /data-csv-field="include" checked/, "登録済み重複は初期チェックOFF");
assert.equal(csvOnlyDuplicateCards.length, 2, "CSV内の重複候補を2件表示");
assert.ok(csvOnlyDuplicateCards.every(card => /CSV内で重複かも/.test(card)), "CSV内重複の専用バッジ");
assert.ok(csvOnlyDuplicateCards.every(card => /data-csv-field="include" checked/.test(card)), "CSV内重複は初期チェックON");

getElement("csvPaste").value = [
  "date,amount,majorCategory,subCategory,memo",
  "2026-06-27,1100,食費,外食,ラーメン"
].join("\n");
await getElement("previewCsvButton").dispatch("click");
assert.match(getElement("csvPreviewList").innerHTML, /小カテゴリを確認/, "未登録小カテゴリをエラー表示");
const missingSubRowId = getElement("csvPreviewList").innerHTML.match(/data-csv-id="([^"]+)"/)?.[1];
await getElement("csvPreviewList").dispatch("click", { target: csvActionTarget("add-sub", missingSubRowId) });
assert.ok(readState().categories.find(item => item.name === "食費").subCategories.includes("外食"), "プレビューから小カテゴリ追加");
assert.doesNotMatch(getElement("csvPreviewList").innerHTML, /小カテゴリを確認/, "小カテゴリ追加後にエラー解消");

getElement("csvPaste").value = [
  "date,amount,majorCategory,subCategory,memo",
  "2026-06-30,5000,車関係,ガソリン,給油"
].join("\n");
await getElement("previewCsvButton").dispatch("click");
assert.match(getElement("csvPreviewList").innerHTML, /大カテゴリを確認/, "未登録大カテゴリをエラー表示");
const missingMajorRowId = getElement("csvPreviewList").innerHTML.match(/data-csv-id="([^"]+)"/)?.[1];
await getElement("csvPreviewList").dispatch("click", { target: csvActionTarget("add-major", missingMajorRowId) });
assert.equal(getElement("categoryName").value, "車関係", "CSVの大カテゴリ名を追加画面へ引き継ぐ");
assert.equal(getElement("categoryFirstSub").value, "ガソリン", "CSVの小カテゴリ名を追加画面へ引き継ぐ");
getElement("categoryGroup").value = "生活費";
getElement("categoryBudget").value = "0";
await getElement("categoryForm").dispatch("submit");
assert.ok(readState().categories.some(item => item.name === "車関係" && item.subCategories.includes("ガソリン")), "プレビューから大カテゴリごと追加");
assert.doesNotMatch(getElement("csvPreviewList").innerHTML, /大カテゴリを確認/, "大カテゴリ追加後にエラー解消");

await getElement("exportCsvButton").dispatch("click");
await getElement("exportJsonButton").dispatch("click");
assert.equal(downloads.length, 2, "CSV・JSON出力");

getElement("livingBudgetInput").value = "160000";
getElement("drinkBudgetInput").value = "8000";
getElement("tobaccoBudgetInput").value = "7500";
await getElement("budgetForm").dispatch("submit");
assert.equal(readState().budgets.living, 160000, "予算変更");

getElement("expenseDate").value = "2026-06-27";
getElement("expenseAmount").value = "777";
getElement("expenseMemo").value = "入力保持テスト";
getElement("expenseMajor").value = "食費";
await getElement("quickAddCategoryButton").dispatch("click");
const categoryChoiceTarget = choice => ({
  closest(selector) {
    return selector === "[data-category-choice]" ? { dataset: { categoryChoice: choice } } : null;
  }
});
await getElement("categoryChoiceModal").dispatch("click", { target: categoryChoiceTarget("sub") });
getElement("subCategoryName").value = "プロテインバー";
await getElement("subCategoryForm").dispatch("submit");
assert.ok(readState().categories.find(item => item.name === "食費").subCategories.includes("プロテインバー"), "入力中の小カテゴリ追加");
assert.equal(getElement("expenseMajor").value, "食費", "小カテゴリ追加後も大カテゴリを保持");
assert.equal(getElement("expenseSub").value, "プロテインバー", "追加した小カテゴリを自動選択");
assert.equal(getElement("expenseAmount").value, "777", "小カテゴリ追加中も金額を保持");
assert.equal(getElement("expenseMemo").value, "入力保持テスト", "小カテゴリ追加中もメモを保持");

await getElement("quickAddCategoryButton").dispatch("click");
await getElement("categoryChoiceModal").dispatch("click", { target: categoryChoiceTarget("major") });
getElement("categoryName").value = "ペット";
getElement("categoryFirstSub").value = "ペット用品";
getElement("categoryGroup").value = "生活費";
getElement("categoryBudget").value = "5000";
await getElement("categoryForm").dispatch("submit");
assert.ok(readState().categories.some(item => item.name === "ペット"), "カテゴリ追加");
assert.equal(getElement("expenseMajor").value, "ペット", "クイック追加後に新カテゴリを自動選択");
assert.equal(getElement("expenseSub").value, "ペット用品", "指定した最初の小カテゴリを自動選択");
assert.equal(getElement("expenseAmount").value, "777", "カテゴリ追加中も金額を保持");
assert.equal(getElement("expenseMemo").value, "入力保持テスト", "カテゴリ追加中もメモを保持");
assert.equal(getElement("livingCategoryBudgetTotal").textContent, "¥148,000", "生活費カテゴリ追加で合計更新");
assert.equal(getElement("allCategoryBudgetTotal").textContent, "¥387,300", "カテゴリ追加で全体合計更新");

const createdPet = readState().categories.find(item => item.name === "ペット");
const petEditButton = {
  dataset: { categoryAction: "edit" },
  closest(selector) {
    if (selector === "[data-category-action]") return this;
    if (selector === "[data-category-id]") return { dataset: { categoryId: createdPet.id } };
    return null;
  }
};
await getElement("categoryEditorList").dispatch("click", { target: petEditButton });
getElement("categoryName").value = "ペット用品";
getElement("categoryGroup").value = "固定費";
getElement("categoryBudget").value = "6000";
await getElement("categoryForm").dispatch("submit");
const editedPet = readState().categories.find(item => item.id === createdPet.id);
assert.equal(editedPet.name, "ペット用品", "大カテゴリ名変更");
assert.equal(editedPet.group, "固定費", "カテゴリグループ変更");
assert.equal(editedPet.budget, 6000, "カテゴリ予算変更");
assert.equal(getElement("livingCategoryBudgetTotal").textContent, "¥143,000", "生活費から固定費への変更を合計に反映");
assert.equal(getElement("fixedCategoryBudgetTotal").textContent, "¥245,300", "固定費予算の変更を合計に反映");
assert.equal(getElement("allCategoryBudgetTotal").textContent, "¥388,300", "予算変更を全体合計に反映");

const foodCategory = readState().categories.find(item => item.name === "食費");
const makeCategoryButton = (action, subIndex = null) => ({
  dataset: { categoryAction: action },
  closest(selector) {
    if (selector === "[data-category-action]") return this;
    if (selector === "[data-category-id]") return { dataset: { categoryId: foodCategory.id } };
    if (selector === "[data-sub-index]") return { dataset: { subIndex: String(subIndex) } };
    return null;
  }
});
prompts.push("夕食");
await getElement("categoryEditorList").dispatch("click", { target: makeCategoryButton("add-sub") });
assert.ok(readState().categories.find(item => item.id === foodCategory.id).subCategories.includes("夕食"), "小カテゴリ追加");
const addedSubIndex = readState().categories.find(item => item.id === foodCategory.id).subCategories.indexOf("夕食");
prompts.push("夕食・外食");
await getElement("categoryEditorList").dispatch("click", { target: makeCategoryButton("rename-sub", addedSubIndex) });
assert.ok(readState().categories.find(item => item.id === foodCategory.id).subCategories.includes("夕食・外食"), "小カテゴリ名変更");
await getElement("categoryEditorList").dispatch("click", { target: makeCategoryButton("delete-sub", addedSubIndex) });
assert.ok(!readState().categories.find(item => item.id === foodCategory.id).subCategories.includes("夕食・外食"), "小カテゴリ削除");

const petCategory = readState().categories.find(item => item.name === "ペット用品");
const petDeleteButton = {
  dataset: { categoryAction: "delete" },
  closest(selector) {
    if (selector === "[data-category-action]") return this;
    if (selector === "[data-category-id]") return { dataset: { categoryId: petCategory.id } };
    return null;
  }
};
await getElement("categoryEditorList").dispatch("click", { target: petDeleteButton });
assert.ok(!readState().categories.some(item => item.name === "ペット用品"), "大カテゴリ削除");
assert.equal(getElement("fixedCategoryBudgetTotal").textContent, "¥239,300", "カテゴリ削除を固定費合計に反映");
assert.equal(getElement("allCategoryBudgetTotal").textContent, "¥382,300", "カテゴリ削除を全体合計に反映");

const backup = { app: "まいにち家計簿", schemaVersion: 1, data: readState() };
const restoreFile = { text: async () => JSON.stringify(backup) };
await getElement("restoreJsonFile").dispatch("change", { target: { files: [restoreFile], value: "" } });
assert.equal(readState().expenses.length, 3, "JSON復元");

await getElement("deleteAllButton").dispatch("click");
assert.equal(readState().expenses.length, 0, "全データ削除");
assert.equal(readState().budgets.living, 150000, "全削除後は初期予算");

getElement("csvPaste").value = [
  "date,amount,majorCategory,subCategory,memo",
  "2026-06-27,138,食費,食費,カットトマト（SUNNY）",
  "2026-06-27,570,食費,食費,若鶏むね肉1kg（SUNNY）",
  "2026-06-28,596,食費,食費,チョコ効果72%×2（SUNNY）",
  "2026-07-01,1100,食費,仕事中食費,ラーメン"
].join("\n");
await getElement("previewCsvButton").dispatch("click");
assert.match(getElement("csvPreviewSummary").textContent, /4件を選択・合計 ¥2,404/, "指定CSV4件の件数と合計");
assert.equal((getElement("csvPreviewList").innerHTML.match(/class="csv-preview-card/g) || []).length, 4, "指定CSVを4枚のコンパクトカードで表示");
assert.doesNotMatch(getElement("csvPreviewList").innerHTML, /class="csv-inline-editor"/, "指定CSVも初期状態は一覧確認表示");
await getElement("importCsvButton").dispatch("click");
assert.equal(readState().expenses.length, 4, "指定CSV4件を登録");
assert.equal(getElement("filterMonth").value, "2026-07", "指定CSV登録後は2026年7月を表示");

await getElement("deleteAllButton").dispatch("click");
assert.equal(readState().expenses.length, 0, "指定CSV確認後にテスト状態を初期化");

const excludedExpenses = [
  ["水道・光熱費", "電気代"],
  ["交通費", "交通費"],
  ["支払い", "支払い"],
  ["通信費", "携帯電話"],
  ["サブスク", "サブスク"]
];
for (const [major, sub] of excludedExpenses) {
  getElement("expenseDate").value = "2026-06-27";
  getElement("expenseAmount").value = "1000";
  getElement("expenseMajor").value = major;
  await getElement("expenseMajor").dispatch("change");
  getElement("expenseSub").value = sub;
  await getElement("expenseForm").dispatch("submit");
  assert.equal(getElement("todayAvailable").textContent, "¥32,750", `${major}は今日使える金額の対象外`);
  await getElement("continueButton").dispatch("click");
}

getElement("expenseDate").value = "2026-06-27";
getElement("expenseAmount").value = "1000";
getElement("expenseMajor").value = "食費";
await getElement("expenseMajor").dispatch("change");
getElement("expenseSub").value = "食費";
await getElement("expenseForm").dispatch("submit");
assert.equal(getElement("todayAvailable").textContent, "¥32,500", "対象生活費の支出だけ日額から差し引く");

console.log("SMOKE TEST OK: v2.3 Safari向け独立編集パネル・一覧型CSVプレビュー・カテゴリ追加・最新月表示・日額計算・予算合計・既存機能");
