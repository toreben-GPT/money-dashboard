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
    const event = { target: this, preventDefault() {}, ...extras };
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
assert.equal(readState().version, 2.1, "保存データをv2.1として正規化");
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
  "2026-06-27,980,日用品,日用品,コンビニ",
  "2026-06-26,1350,食費,家飲み,ビールなど"
].join("\n");
getElement("csvSource").value = "receipt";
await getElement("previewCsvButton").dispatch("click");
assert.match(getElement("csvPreviewSummary").textContent, /2件を選択/, "CSVプレビュー");
assert.match(getElement("csvPreviewList").innerHTML, /class="csv-date-input" type="text"/, "取り込み日付はSafari固有のdate入力を使わない");
assert.match(getElement("csvPreviewList").innerHTML, /value="2026-06-27"/, "取り込み日付を固定形式で表示");
assert.match(styleText, /\.csv-preview-card\s*\{[^}]*overflow:\s*hidden/s, "取り込みカードの横はみ出しを抑制");
assert.match(styleText, /\.csv-edit-grid \.csv-date-input\s*\{[^}]*max-width:\s*100%/s, "iPhoneの日付入力をカード幅以内に制限");
assert.match(styleText, /@media \(max-width: 620px\)[\s\S]*?\.csv-date-field,[\s\S]*?grid-column:\s*1 \/ -1/, "狭い画面で日付欄を1列表示");
assert.match(indexText, /style\.css\?v=2\.1/, "Safariに最新CSSを読み込ませる");
assert.match(indexText, /app\.js\?v=2\.1/, "Safariに最新JavaScriptを読み込ませる");
await getElement("importCsvButton").dispatch("click");
assert.equal(readState().expenses.length, 3, "CSV取り込み");
assert.equal(readState().expenses.filter(item => item.source === "receipt").length, 2, "選択したデータ元を保存");
assert.equal(getElement("drinkMonthRemaining").textContent, "¥5,650", "家飲み月残り");
assert.equal(getElement("drinkWeekRemaining").textContent, "¥283", "家飲み週目安と残り");

getElement("filterMajor").value = "日用品";
await getElement("filterMajor").dispatch("change");
assert.equal(getElement("transactionCount").textContent, "1件", "カテゴリ絞り込み");

const dailyExpenseId = readState().expenses.find(item => item.majorCategory === "日用品").id;
await getElement("transactionList").dispatch("click", {
  target: { closest: () => ({ dataset: { expenseId: dailyExpenseId } }) }
});
await getElement("detailDeleteButton").dispatch("click");
assert.equal(readState().expenses.length, 2, "明細削除");

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
await getElement("quickAddCategoryButton").dispatch("click");
getElement("categoryName").value = "ペット";
getElement("categoryGroup").value = "生活費";
getElement("categoryBudget").value = "5000";
await getElement("categoryForm").dispatch("submit");
assert.ok(readState().categories.some(item => item.name === "ペット"), "カテゴリ追加");
assert.equal(getElement("expenseMajor").value, "ペット", "クイック追加後に新カテゴリを自動選択");
assert.equal(getElement("expenseSub").value, "ペット", "クイック追加後に新しい小カテゴリを自動選択");
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
prompts.push("外食");
await getElement("categoryEditorList").dispatch("click", { target: makeCategoryButton("add-sub") });
assert.ok(readState().categories.find(item => item.id === foodCategory.id).subCategories.includes("外食"), "小カテゴリ追加");
const addedSubIndex = readState().categories.find(item => item.id === foodCategory.id).subCategories.indexOf("外食");
prompts.push("外食・昼");
await getElement("categoryEditorList").dispatch("click", { target: makeCategoryButton("rename-sub", addedSubIndex) });
assert.ok(readState().categories.find(item => item.id === foodCategory.id).subCategories.includes("外食・昼"), "小カテゴリ名変更");
await getElement("categoryEditorList").dispatch("click", { target: makeCategoryButton("delete-sub", addedSubIndex) });
assert.ok(!readState().categories.find(item => item.id === foodCategory.id).subCategories.includes("外食・昼"), "小カテゴリ削除");

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
assert.equal(readState().expenses.length, 2, "JSON復元");

await getElement("deleteAllButton").dispatch("click");
assert.equal(readState().expenses.length, 0, "全データ削除");
assert.equal(readState().budgets.living, 150000, "全削除後は初期予算");

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

console.log("SMOKE TEST OK: v2.1キャッシュ対策・日額計算・予算合計・入力中カテゴリ追加・iPhone日付表示・既存機能");
