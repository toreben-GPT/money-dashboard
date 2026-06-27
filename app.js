(() => {
  "use strict";

  const STORAGE_KEY = "mainichiKakeibo_v1";
  const APP_VERSION = 1.1;
  const DONUT_COLORS = ["#207a52", "#e5a72f", "#4b79b9", "#df7650", "#7d65b3", "#43a5a1", "#b76386", "#7e9251"];

  const DEFAULT_CATEGORIES = [
    { id: "cat-food", name: "食費", group: "生活費", budget: 35000, subCategories: ["食費", "仕事中食費", "家飲み"] },
    { id: "cat-social", name: "交際費", group: "生活費", budget: 50000, subCategories: ["交際費", "デート代", "プレゼント代"] },
    { id: "cat-daily", name: "日用品", group: "生活費", budget: 18000, subCategories: ["日用品", "タバコ"] },
    { id: "cat-beauty", name: "衣服・美容", group: "生活費", budget: 8000, subCategories: ["衣服", "美容院・理髪"] },
    { id: "cat-hobby", name: "趣味・娯楽", group: "生活費", budget: 0, subCategories: ["趣味・娯楽", "本"] },
    { id: "cat-health", name: "健康・医療", group: "生活費", budget: 8000, subCategories: ["医療費", "フィットネス"] },
    { id: "cat-misc", name: "雑費", group: "生活費", budget: 12000, subCategories: ["雑費"] },
    { id: "cat-utilities", name: "水道・光熱費", group: "生活費", budget: 12000, subCategories: ["電気代", "ガス代", "水道代"] },
    { id: "cat-transport", name: "交通費", group: "固定費", budget: 121300, subCategories: ["交通費"] },
    { id: "cat-payment", name: "支払い", group: "固定費", budget: 96000, subCategories: ["支払い"] },
    { id: "cat-communication", name: "通信費", group: "固定費", budget: 15000, subCategories: ["携帯電話", "その他通信費"] },
    { id: "cat-subscription", name: "サブスク", group: "固定費", budget: 7000, subCategories: ["サブスク"] }
  ];
  const CATEGORY_INPUT_ORDER = DEFAULT_CATEGORIES.map(category => category.name);

  let state = loadState();
  let lastSavedId = null;
  let detailExpenseId = null;
  let csvPreviewRows = [];
  let toastTimer = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const els = {
    headerMonth: $("#headerMonth"),
    screenTitle: $("#screenTitle"),
    headerAddButton: $("#headerAddButton"),
    monthTotal: $("#monthTotal"),
    livingTotalText: $("#livingTotalText"),
    livingProgress: $("#livingProgress"),
    livingRemainingText: $("#livingRemainingText"),
    todayAvailable: $("#todayAvailable"),
    todayBasis: $("#todayBasis"),
    weekRemaining: $("#weekRemaining"),
    weekDetail: $("#weekDetail"),
    monthRemaining: $("#monthRemaining"),
    monthDetail: $("#monthDetail"),
    drinkUsage: $("#drinkUsage"),
    drinkWeekRemaining: $("#drinkWeekRemaining"),
    drinkWeekDetail: $("#drinkWeekDetail"),
    drinkMonthRemaining: $("#drinkMonthRemaining"),
    drinkMonthDetail: $("#drinkMonthDetail"),
    categoryProgressList: $("#categoryProgressList"),
    donutArea: $("#donutArea"),
    donutChart: $("#donutChart"),
    donutTotal: $("#donutTotal"),
    donutLegend: $("#donutLegend"),
    donutEmpty: $("#donutEmpty"),
    recentList: $("#recentList"),
    quickInputList: $("#quickInputList"),
    quickInputEmpty: $("#quickInputEmpty"),
    expenseForm: $("#expenseForm"),
    expenseId: $("#expenseId"),
    expenseDate: $("#expenseDate"),
    expenseDateDisplay: $("#expenseDateDisplay"),
    expenseAmount: $("#expenseAmount"),
    expenseMajor: $("#expenseMajor"),
    expenseSub: $("#expenseSub"),
    expenseMemo: $("#expenseMemo"),
    expenseFormTitle: $("#expenseFormTitle"),
    saveExpenseButton: $("#saveExpenseButton"),
    cancelEditButton: $("#cancelEditButton"),
    filterMonth: $("#filterMonth"),
    filterMonthDisplay: $("#filterMonthDisplay"),
    filterMajor: $("#filterMajor"),
    filterSub: $("#filterSub"),
    transactionCount: $("#transactionCount"),
    transactionFilteredTotal: $("#transactionFilteredTotal"),
    transactionList: $("#transactionList"),
    budgetForm: $("#budgetForm"),
    livingBudgetInput: $("#livingBudgetInput"),
    drinkBudgetInput: $("#drinkBudgetInput"),
    tobaccoBudgetInput: $("#tobaccoBudgetInput"),
    categoryEditorList: $("#categoryEditorList"),
    settingsQuickList: $("#settingsQuickList"),
    settingsQuickEmpty: $("#settingsQuickEmpty"),
    csvSource: $("#csvSource"),
    csvPaste: $("#csvPaste"),
    csvPreviewList: $("#csvPreviewList"),
    csvPreviewSummary: $("#csvPreviewSummary"),
    importCsvButton: $("#importCsvButton"),
    toast: $("#toast")
  };

  initialize();

  function initialize() {
    saveState();
    els.expenseDate.value = todayISO();
    els.filterMonth.value = monthKey(todayISO());
    updatePickerDisplays();
    bindEvents();
    populateExpenseCategories();
    renderAll();
    navigate("home", false);
  }

  function createDefaultState() {
    return {
      version: APP_VERSION,
      expenses: [],
      categories: DEFAULT_CATEGORIES.map(category => ({ ...category, subCategories: [...category.subCategories] })),
      budgets: {
        living: 150000,
        homeDrinking: 7000,
        tobacco: 7000
      },
      quickInputs: [],
      settings: {
        weekStartsOn: "monday",
        currency: "JPY"
      },
      updatedAt: new Date().toISOString()
    };
  }

  function normalizeState(raw) {
    const defaults = createDefaultState();
    if (!raw || typeof raw !== "object") return defaults;

    const categories = Array.isArray(raw.categories)
      ? raw.categories
          .filter(item => item && typeof item.name === "string")
          .map(item => ({
            id: String(item.id || uid("cat")),
            name: String(item.name).trim(),
            group: item.group === "固定費" ? "固定費" : "生活費",
            budget: nonNegativeNumber(item.budget),
            subCategories: Array.isArray(item.subCategories)
              ? [...new Set(item.subCategories.map(String).map(value => value.trim()).filter(Boolean))]
              : []
          }))
      : defaults.categories;

    return {
      version: APP_VERSION,
      expenses: Array.isArray(raw.expenses)
        ? raw.expenses.filter(Boolean).map(expense => ({
            id: String(expense.id || uid("exp")),
            date: validDateString(expense.date) ? expense.date : todayISO(),
            amount: nonNegativeNumber(expense.amount),
            majorCategory: String(expense.majorCategory || "未分類"),
            subCategory: String(expense.subCategory || "未分類"),
            memo: String(expense.memo || ""),
            createdAt: String(expense.createdAt || new Date().toISOString()),
            updatedAt: String(expense.updatedAt || expense.createdAt || new Date().toISOString()),
            source: ["manual", "chatgpt", "csv", "rakuten", "receipt"].includes(expense.source) ? expense.source : "manual"
          }))
        : [],
      categories: orderCategories(categories.length ? categories : defaults.categories),
      budgets: {
        living: nonNegativeNumber(raw.budgets?.living ?? defaults.budgets.living),
        homeDrinking: nonNegativeNumber(raw.budgets?.homeDrinking ?? defaults.budgets.homeDrinking),
        tobacco: nonNegativeNumber(raw.budgets?.tobacco ?? defaults.budgets.tobacco)
      },
      quickInputs: Array.isArray(raw.quickInputs)
        ? raw.quickInputs.filter(Boolean).map(item => ({
            id: String(item.id || uid("quick")),
            label: String(item.label || item.memo || item.subCategory || "クイック入力"),
            amount: nonNegativeNumber(item.amount),
            majorCategory: String(item.majorCategory || ""),
            subCategory: String(item.subCategory || ""),
            memo: String(item.memo || "")
          }))
        : [],
      settings: { ...defaults.settings, ...(raw.settings || {}) },
      updatedAt: String(raw.updatedAt || new Date().toISOString())
    };
  }

  function loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? normalizeState(JSON.parse(stored)) : createDefaultState();
    } catch (error) {
      console.warn("保存データを読み込めませんでした。", error);
      return createDefaultState();
    }
  }

  function saveState() {
    state.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.error("保存できませんでした。", error);
      alert("ブラウザにデータを保存できませんでした。空き容量やプライベートブラウズ設定を確認してください。");
      return false;
    }
  }

  function bindEvents() {
    $$("[data-tab]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.tab)));
    $$("[data-go-screen]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.goScreen)));
    els.headerAddButton.addEventListener("click", () => {
      resetExpenseForm();
      navigate("input");
      window.setTimeout(() => els.expenseAmount.focus(), 120);
    });

    els.expenseMajor.addEventListener("change", () => populateSubSelect(els.expenseMajor, els.expenseSub));
    els.expenseDate.addEventListener("change", updatePickerDisplays);
    els.expenseForm.addEventListener("submit", handleExpenseSubmit);
    els.cancelEditButton.addEventListener("click", () => resetExpenseForm());
    els.quickInputList.addEventListener("click", handleQuickInputClick);
    $("#openImportButton").addEventListener("click", () => openModal("importModal"));

    els.filterMonth.addEventListener("change", () => {
      updatePickerDisplays();
      renderTransactions();
    });
    els.filterMajor.addEventListener("change", () => {
      populateFilterSubs();
      renderTransactions();
    });
    els.filterSub.addEventListener("change", renderTransactions);
    els.transactionList.addEventListener("click", event => {
      const row = event.target.closest("[data-expense-id]");
      if (row) openExpenseDetail(row.dataset.expenseId);
    });
    els.recentList.addEventListener("click", event => {
      const row = event.target.closest("[data-expense-id]");
      if (row) openExpenseDetail(row.dataset.expenseId);
    });

    $("#completeButton").addEventListener("click", () => {
      closeModal("saveCompleteModal");
      resetExpenseForm();
      navigate("home");
    });
    $("#modifyLastButton").addEventListener("click", () => {
      closeModal("saveCompleteModal");
      if (lastSavedId) startExpenseEdit(lastSavedId);
    });
    $("#continueButton").addEventListener("click", () => {
      const keepDate = els.expenseDate.value || todayISO();
      closeModal("saveCompleteModal");
      resetExpenseForm(keepDate);
      navigate("input");
      window.setTimeout(() => els.expenseAmount.focus(), 120);
    });
    $("#saveQuickButton").addEventListener("click", () => {
      const expense = state.expenses.find(item => item.id === lastSavedId);
      if (expense) createQuickFromExpense(expense);
    });

    $("#detailEditButton").addEventListener("click", () => {
      if (detailExpenseId) {
        closeModal("transactionDetailModal");
        startExpenseEdit(detailExpenseId);
      }
    });
    $("#detailDeleteButton").addEventListener("click", deleteDetailedExpense);
    $("#detailQuickButton").addEventListener("click", () => {
      const expense = state.expenses.find(item => item.id === detailExpenseId);
      if (expense) createQuickFromExpense(expense);
    });

    els.budgetForm.addEventListener("submit", saveBudgets);
    $("#addCategoryButton").addEventListener("click", () => openCategoryModal());
    $("#categoryForm").addEventListener("submit", saveCategoryFromModal);
    els.categoryEditorList.addEventListener("click", handleCategoryAction);

    els.settingsQuickList.addEventListener("click", handleSettingsQuickAction);
    $("#quickEditMajor").addEventListener("change", () => populateSubSelect($("#quickEditMajor"), $("#quickEditSub")));
    $("#quickEditForm").addEventListener("submit", saveQuickEdit);

    $("#previewCsvButton").addEventListener("click", prepareCsvPreview);
    els.csvPreviewList.addEventListener("change", handleCsvPreviewChange);
    els.csvPreviewList.addEventListener("input", handleCsvPreviewChange);
    els.importCsvButton.addEventListener("click", importCsvRows);
    $("#exportCsvButton").addEventListener("click", exportCsv);
    $("#exportJsonButton").addEventListener("click", exportJson);
    $("#restoreJsonButton").addEventListener("click", () => $("#restoreJsonFile").click());
    $("#restoreJsonFile").addEventListener("change", restoreJson);
    $("#deleteAllButton").addEventListener("click", deleteAllData);

    $$('[data-close-modal]').forEach(button => button.addEventListener("click", () => closeModal(button.dataset.closeModal)));
    $$(".modal-backdrop").forEach(backdrop => {
      backdrop.addEventListener("click", event => {
        if (event.target === backdrop && backdrop.id !== "saveCompleteModal") closeModal(backdrop.id);
      });
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        const openModalElement = $(".modal-backdrop:not(.is-hidden)");
        if (openModalElement && openModalElement.id !== "saveCompleteModal") closeModal(openModalElement.id);
      }
    });
  }

  function renderAll() {
    renderHome();
    renderQuickInputs();
    populateExpenseCategories(els.expenseMajor.value, els.expenseSub.value);
    populateTransactionFilters();
    renderTransactions();
    renderSettings();
  }

  function navigate(screen, scroll = true) {
    const titles = { home: "ホーム", input: "入力", transactions: "明細", settings: "設定" };
    $$(".screen").forEach(element => element.classList.toggle("is-active", element.dataset.screen === screen));
    $$("[data-tab]").forEach(button => {
      const active = button.dataset.tab === screen;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    els.screenTitle.textContent = titles[screen] || "家計簿";
    els.headerAddButton.classList.toggle("is-hidden", screen === "input");
    if (screen === "home") renderHome();
    if (screen === "transactions") renderTransactions();
    if (screen === "settings") renderSettings();
    if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderHome() {
    const today = parseLocalDate(todayISO());
    const currentMonth = monthKey(todayISO());
    const monthStart = `${currentMonth}-01`;
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const monthEnd = `${currentMonth}-${String(lastDay).padStart(2, "0")}`;
    const weekStartDate = startOfWeek(today);
    const weekEndDate = addDays(weekStartDate, 6);
    const weekStart = dateToISO(weekStartDate);
    const weekEnd = dateToISO(weekEndDate);
    const monthExpenses = expensesBetween(monthStart, monthEnd);
    const weekExpenses = expensesBetween(weekStart, weekEnd);
    const livingCategories = new Set(state.categories.filter(category => category.group === "生活費").map(category => category.name));
    const monthLiving = sum(monthExpenses.filter(expense => livingCategories.has(expense.majorCategory)).map(expense => expense.amount));
    const weekLiving = sum(weekExpenses.filter(expense => livingCategories.has(expense.majorCategory)).map(expense => expense.amount));
    const monthTotal = sum(monthExpenses.map(expense => expense.amount));
    const daysInMonth = lastDay;
    const weeklyLivingBudget = Math.round(state.budgets.living / daysInMonth * 7);
    const weekRemaining = weeklyLivingBudget - weekLiving;
    const monthRemaining = state.budgets.living - monthLiving;
    const daysRemainingWeek = ((7 - normalizeWeekday(today.getDay())) || 7);
    const daysRemainingMonth = lastDay - today.getDate() + 1;
    const weekPerDay = weekRemaining / daysRemainingWeek;
    const monthPerDay = monthRemaining / daysRemainingMonth;
    const todayAvailable = Math.max(0, Math.floor(Math.min(weekPerDay, monthPerDay)));

    els.headerMonth.textContent = `${today.getFullYear()}年${today.getMonth() + 1}月`;
    els.monthTotal.textContent = yen(monthTotal);
    els.livingTotalText.textContent = `${yen(monthLiving)} / ${yen(state.budgets.living)}`;
    setProgress(els.livingProgress, percent(monthLiving, state.budgets.living));
    els.livingRemainingText.textContent = `残り ${yen(monthRemaining)}`;
    els.todayAvailable.textContent = yen(todayAvailable);
    const limiting = weekPerDay <= monthPerDay ? "週の残り" : "月の残り";
    els.todayBasis.textContent = `${limiting}を基準に算出・今日を含む`;
    setSignedAmount(els.weekRemaining, weekRemaining);
    els.weekDetail.textContent = `${formatShortDate(weekStart)}〜${formatShortDate(weekEnd)}・目安 ${yen(weeklyLivingBudget)}`;
    setSignedAmount(els.monthRemaining, monthRemaining);
    els.monthDetail.textContent = `${daysRemainingMonth}日分・予算 ${yen(state.budgets.living)}`;

    const drinkMonthSpent = sum(monthExpenses.filter(expense => expense.subCategory === "家飲み").map(expense => expense.amount));
    const drinkWeekSpent = sum(weekExpenses.filter(expense => expense.subCategory === "家飲み").map(expense => expense.amount));
    const drinkWeekBudget = Math.round(state.budgets.homeDrinking / daysInMonth * 7);
    const drinkWeekRemaining = drinkWeekBudget - drinkWeekSpent;
    const drinkMonthRemaining = state.budgets.homeDrinking - drinkMonthSpent;
    els.drinkUsage.textContent = `${yen(drinkMonthSpent)} / ${yen(state.budgets.homeDrinking)}`;
    setSignedAmount(els.drinkWeekRemaining, drinkWeekRemaining);
    els.drinkWeekDetail.textContent = `使用 ${yen(drinkWeekSpent)}・週目安 ${yen(drinkWeekBudget)}`;
    setSignedAmount(els.drinkMonthRemaining, drinkMonthRemaining);
    els.drinkMonthDetail.textContent = `使用 ${yen(drinkMonthSpent)}・月予算 ${yen(state.budgets.homeDrinking)}`;

    renderCategoryProgress(monthExpenses);
    renderDonut(monthExpenses, livingCategories);
    renderRecent();
  }

  function renderCategoryProgress(monthExpenses) {
    const blocks = [];
    ["生活費", "固定費"].forEach(group => {
      blocks.push(`<p class="progress-group-title">${group}</p>`);
      state.categories.filter(category => category.group === group).forEach(category => {
        const spent = sum(monthExpenses.filter(expense => expense.majorCategory === category.name).map(expense => expense.amount));
        blocks.push(progressCardHtml(category.name, spent, category.budget));
      });
      if (group === "生活費") {
        const tobaccoSpent = sum(monthExpenses.filter(expense => expense.subCategory === "タバコ").map(expense => expense.amount));
        blocks.push(progressCardHtml("タバコ（小カテゴリ）", tobaccoSpent, state.budgets.tobacco));
      }
    });
    els.categoryProgressList.innerHTML = blocks.join("");
  }

  function progressCardHtml(name, spent, budget) {
    const rate = percent(spent, budget);
    const status = progressStatus(rate, budget, spent);
    const remaining = budget - spent;
    const rateText = budget === 0 ? (spent > 0 ? "予算超過" : "予算未設定") : `${Math.round(rate)}%`;
    return `
      <article class="progress-card">
        <div class="progress-card-head">
          <h3>${escapeHtml(name)}</h3>
          <strong>${yen(spent)} / ${yen(budget)}</strong>
        </div>
        <div class="progress-track"><div class="progress-fill ${status.className}" style="width:${Math.min(Math.max(rate, spent > 0 && budget === 0 ? 100 : 0), 100)}%"></div></div>
        <div class="progress-card-meta">
          <span>残り ${yen(remaining)}</span>
          <span class="status-label ${status.labelClass}">${status.label} ${rateText}</span>
        </div>
      </article>`;
  }

  function renderDonut(monthExpenses, livingCategories) {
    const data = state.categories
      .filter(category => category.group === "生活費")
      .map(category => ({
        name: category.name,
        amount: sum(monthExpenses.filter(expense => expense.majorCategory === category.name && livingCategories.has(expense.majorCategory)).map(expense => expense.amount))
      }))
      .filter(item => item.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const total = sum(data.map(item => item.amount));
    els.donutTotal.textContent = yen(total);
    if (!total) {
      els.donutArea.classList.add("is-hidden");
      els.donutEmpty.classList.remove("is-hidden");
      return;
    }
    els.donutArea.classList.remove("is-hidden");
    els.donutEmpty.classList.add("is-hidden");
    let current = 0;
    const segments = data.map((item, index) => {
      const start = current;
      current += item.amount / total * 100;
      return `${DONUT_COLORS[index % DONUT_COLORS.length]} ${start.toFixed(2)}% ${current.toFixed(2)}%`;
    });
    els.donutChart.style.background = `conic-gradient(${segments.join(",")})`;
    els.donutLegend.innerHTML = data.slice(0, 6).map((item, index) => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${DONUT_COLORS[index % DONUT_COLORS.length]}"></span>
        <span class="legend-name">${escapeHtml(item.name)}</span>
        <span class="legend-amount">${Math.round(item.amount / total * 100)}%</span>
      </div>`).join("");
  }

  function renderRecent() {
    const recent = sortedExpenses(state.expenses).slice(0, 5);
    els.recentList.innerHTML = recent.length
      ? recent.map(transactionRowHtml).join("")
      : `<p class="empty-state">まだ支出がありません。<br>「入力」から最初の1件を登録しましょう。</p>`;
  }

  function renderQuickInputs() {
    els.quickInputList.innerHTML = state.quickInputs.map(item => `
      <button class="quick-chip" type="button" data-quick-id="${escapeAttr(item.id)}">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${yen(item.amount)}・${escapeHtml(item.subCategory)}</span>
      </button>`).join("");
    els.quickInputEmpty.classList.toggle("is-hidden", state.quickInputs.length > 0);
  }

  function populateExpenseCategories(selectedMajor = "", selectedSub = "") {
    const priorMajor = selectedMajor || els.expenseMajor.value;
    els.expenseMajor.innerHTML = state.categories.map(category => `<option value="${escapeAttr(category.name)}">${escapeHtml(category.name)}（${category.group}）</option>`).join("");
    if (state.categories.some(category => category.name === priorMajor)) els.expenseMajor.value = priorMajor;
    populateSubSelect(els.expenseMajor, els.expenseSub, selectedSub);
  }

  function populateSubSelect(majorSelect, subSelect, selected = "") {
    const category = state.categories.find(item => item.name === majorSelect.value);
    const prior = selected || subSelect.value;
    const subs = category?.subCategories || [];
    subSelect.innerHTML = subs.length
      ? subs.map(sub => `<option value="${escapeAttr(sub)}">${escapeHtml(sub)}</option>`).join("")
      : `<option value="">小カテゴリを設定してください</option>`;
    if (subs.includes(prior)) subSelect.value = prior;
  }

  function handleExpenseSubmit(event) {
    event.preventDefault();
    const id = els.expenseId.value;
    const amount = Number(els.expenseAmount.value);
    if (!validDateString(els.expenseDate.value) || !Number.isFinite(amount) || amount <= 0) {
      alert("日付と1円以上の金額を入力してください。");
      return;
    }
    if (!els.expenseMajor.value || !els.expenseSub.value) {
      alert("大カテゴリと小カテゴリを選択してください。");
      return;
    }
    const now = new Date().toISOString();
    if (id) {
      const index = state.expenses.findIndex(item => item.id === id);
      if (index < 0) return;
      state.expenses[index] = {
        ...state.expenses[index],
        date: els.expenseDate.value,
        amount: Math.round(amount),
        majorCategory: els.expenseMajor.value,
        subCategory: els.expenseSub.value,
        memo: els.expenseMemo.value.trim(),
        updatedAt: now
      };
      saveState();
      renderAll();
      resetExpenseForm();
      navigate("transactions");
      showToast("明細を更新しました");
      return;
    }

    const expense = {
      id: uid("exp"),
      date: els.expenseDate.value,
      amount: Math.round(amount),
      majorCategory: els.expenseMajor.value,
      subCategory: els.expenseSub.value,
      memo: els.expenseMemo.value.trim(),
      createdAt: now,
      updatedAt: now,
      source: "manual"
    };
    state.expenses.push(expense);
    if (!saveState()) return;
    lastSavedId = expense.id;
    renderAll();
    $("#saveCompleteSummary").textContent = `${yen(expense.amount)}・${expense.majorCategory} ＞ ${expense.subCategory}`;
    openModal("saveCompleteModal");
  }

  function resetExpenseForm(keepDate = todayISO()) {
    els.expenseForm.reset();
    els.expenseId.value = "";
    els.expenseDate.value = keepDate;
    updatePickerDisplays();
    els.expenseFormTitle.textContent = "支出を入力";
    els.saveExpenseButton.textContent = "支出を登録";
    els.cancelEditButton.classList.add("is-hidden");
    populateExpenseCategories();
  }

  function startExpenseEdit(id) {
    const expense = state.expenses.find(item => item.id === id);
    if (!expense) return;
    els.expenseId.value = expense.id;
    els.expenseDate.value = expense.date;
    updatePickerDisplays();
    els.expenseAmount.value = expense.amount;
    populateExpenseCategories(expense.majorCategory, expense.subCategory);
    els.expenseMemo.value = expense.memo;
    els.expenseFormTitle.textContent = "支出を編集";
    els.saveExpenseButton.textContent = "変更を保存";
    els.cancelEditButton.classList.remove("is-hidden");
    navigate("input");
    window.setTimeout(() => els.expenseAmount.focus(), 120);
  }

  function handleQuickInputClick(event) {
    const button = event.target.closest("[data-quick-id]");
    if (!button) return;
    const quick = state.quickInputs.find(item => item.id === button.dataset.quickId);
    if (!quick) return;
    els.expenseId.value = "";
    els.expenseAmount.value = quick.amount;
    populateExpenseCategories(quick.majorCategory, quick.subCategory);
    els.expenseMemo.value = quick.memo;
    els.expenseFormTitle.textContent = "支出を入力";
    els.saveExpenseButton.textContent = "支出を登録";
    els.cancelEditButton.classList.add("is-hidden");
    els.expenseForm.scrollIntoView({ behavior: "smooth", block: "start" });
    showToast("入力欄に反映しました。確認して登録してください");
  }

  function createQuickFromExpense(expense) {
    const defaultLabel = expense.memo || expense.subCategory;
    const label = prompt("クイック入力の表示名", defaultLabel);
    if (label === null) return;
    if (!label.trim()) {
      alert("表示名を入力してください。");
      return;
    }
    state.quickInputs.push({
      id: uid("quick"),
      label: label.trim(),
      amount: expense.amount,
      majorCategory: expense.majorCategory,
      subCategory: expense.subCategory,
      memo: expense.memo
    });
    saveState();
    renderQuickInputs();
    renderSettingsQuickInputs();
    showToast("クイック入力に登録しました");
  }

  function populateTransactionFilters() {
    const currentMajor = els.filterMajor.value;
    const currentSub = els.filterSub.value;
    const majorNames = [...new Set([...state.categories.map(item => item.name), ...state.expenses.map(item => item.majorCategory)])].sort(localeSort);
    els.filterMajor.innerHTML = `<option value="">すべて</option>${majorNames.map(name => `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`).join("")}`;
    if (majorNames.includes(currentMajor)) els.filterMajor.value = currentMajor;
    populateFilterSubs(currentSub);
  }

  function populateFilterSubs(preferred = "") {
    const major = els.filterMajor.value;
    const previous = preferred || els.filterSub.value;
    const categorySubs = state.categories.filter(category => !major || category.name === major).flatMap(category => category.subCategories);
    const expenseSubs = state.expenses.filter(expense => !major || expense.majorCategory === major).map(expense => expense.subCategory);
    const subs = [...new Set([...categorySubs, ...expenseSubs])].filter(Boolean).sort(localeSort);
    els.filterSub.innerHTML = `<option value="">すべて</option>${subs.map(name => `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`).join("")}`;
    if (subs.includes(previous)) els.filterSub.value = previous;
  }

  function renderTransactions() {
    const selectedMonth = els.filterMonth.value || monthKey(todayISO());
    const major = els.filterMajor.value;
    const sub = els.filterSub.value;
    const filtered = sortedExpenses(state.expenses.filter(expense =>
      monthKey(expense.date) === selectedMonth &&
      (!major || expense.majorCategory === major) &&
      (!sub || expense.subCategory === sub)
    ));
    els.transactionCount.textContent = `${filtered.length}件`;
    els.transactionFilteredTotal.textContent = yen(sum(filtered.map(item => item.amount)));
    els.transactionList.innerHTML = filtered.length
      ? filtered.map(transactionRowHtml).join("")
      : `<p class="empty-state">この条件の明細はありません。</p>`;
  }

  function transactionRowHtml(expense) {
    return `
      <button class="transaction-row" type="button" data-expense-id="${escapeAttr(expense.id)}">
        <span class="transaction-date">${formatShortDate(expense.date)}</span>
        <span class="transaction-main">
          <span class="transaction-category">${escapeHtml(expense.majorCategory)} ＞ ${escapeHtml(expense.subCategory)}</span>
          <span class="transaction-memo">${escapeHtml(expense.memo || "メモなし")}</span>
        </span>
        <span class="transaction-amount">${yen(expense.amount)}</span>
      </button>`;
  }

  function openExpenseDetail(id) {
    const expense = state.expenses.find(item => item.id === id);
    if (!expense) return;
    detailExpenseId = id;
    $("#detailTitle").textContent = yen(expense.amount);
    $("#detailContent").innerHTML = `
      <div class="detail-row"><span>日付</span><strong>${formatLongDate(expense.date)}</strong></div>
      <div class="detail-row"><span>カテゴリ</span><strong>${escapeHtml(expense.majorCategory)} ＞ ${escapeHtml(expense.subCategory)}</strong></div>
      <div class="detail-row"><span>メモ</span><strong>${escapeHtml(expense.memo || "—")}</strong></div>
      <div class="detail-row"><span>登録元</span><strong>${sourceLabel(expense.source)}</strong></div>`;
    openModal("transactionDetailModal");
  }

  function deleteDetailedExpense() {
    const expense = state.expenses.find(item => item.id === detailExpenseId);
    if (!expense) return;
    if (!confirm(`${formatShortDate(expense.date)} ${yen(expense.amount)} の明細を削除しますか？`)) return;
    state.expenses = state.expenses.filter(item => item.id !== detailExpenseId);
    saveState();
    closeModal("transactionDetailModal");
    detailExpenseId = null;
    renderAll();
    showToast("明細を削除しました");
  }

  function renderSettings() {
    els.livingBudgetInput.value = state.budgets.living;
    els.drinkBudgetInput.value = state.budgets.homeDrinking;
    els.tobaccoBudgetInput.value = state.budgets.tobacco;
    renderCategoryEditor();
    renderSettingsQuickInputs();
  }

  function saveBudgets(event) {
    event.preventDefault();
    state.budgets.living = nonNegativeNumber(els.livingBudgetInput.value);
    state.budgets.homeDrinking = nonNegativeNumber(els.drinkBudgetInput.value);
    state.budgets.tobacco = nonNegativeNumber(els.tobaccoBudgetInput.value);
    saveState();
    renderHome();
    showToast("予算を保存しました");
  }

  function renderCategoryEditor() {
    els.categoryEditorList.innerHTML = state.categories.map(category => `
      <article class="category-editor-item" data-category-id="${escapeAttr(category.id)}">
        <div class="category-main-row">
          <div>
            <h3>${escapeHtml(category.name)}</h3>
            <p>${category.group}・月予算 ${yen(category.budget)}</p>
          </div>
          <div class="inline-actions">
            <button class="mini-action" type="button" data-category-action="edit">編集</button>
            <button class="mini-action danger" type="button" data-category-action="delete">削除</button>
          </div>
        </div>
        <div class="sub-list">
          ${category.subCategories.map((sub, index) => `
            <div class="sub-row" data-sub-index="${index}">
              <span>${escapeHtml(sub)}</span>
              <span class="sub-actions">
                <button type="button" data-category-action="rename-sub">変更</button>
                <button type="button" data-category-action="delete-sub">削除</button>
              </span>
            </div>`).join("")}
        </div>
        <button class="add-sub-button" type="button" data-category-action="add-sub">＋ 小カテゴリを追加</button>
      </article>`).join("");
  }

  function openCategoryModal(category = null) {
    $("#categoryModalTitle").textContent = category ? "大カテゴリを編集" : "大カテゴリを追加";
    $("#categoryId").value = category?.id || "";
    $("#categoryName").value = category?.name || "";
    $("#categoryGroup").value = category?.group || "生活費";
    $("#categoryBudget").value = category?.budget ?? 0;
    openModal("categoryModal");
    window.setTimeout(() => $("#categoryName").focus(), 100);
  }

  function saveCategoryFromModal(event) {
    event.preventDefault();
    const id = $("#categoryId").value;
    const name = $("#categoryName").value.trim();
    if (!name) return;
    const duplicate = state.categories.some(category => category.name === name && category.id !== id);
    if (duplicate) {
      alert("同じ名前の大カテゴリがすでにあります。");
      return;
    }
    if (id) {
      const category = state.categories.find(item => item.id === id);
      if (!category) return;
      const oldName = category.name;
      category.name = name;
      category.group = $("#categoryGroup").value;
      category.budget = nonNegativeNumber($("#categoryBudget").value);
      if (oldName !== name) {
        state.expenses.forEach(expense => { if (expense.majorCategory === oldName) expense.majorCategory = name; });
        state.quickInputs.forEach(quick => { if (quick.majorCategory === oldName) quick.majorCategory = name; });
      }
    } else {
      state.categories.push({
        id: uid("cat"),
        name,
        group: $("#categoryGroup").value,
        budget: nonNegativeNumber($("#categoryBudget").value),
        subCategories: [name]
      });
    }
    state.categories = orderCategories(state.categories);
    saveState();
    closeModal("categoryModal");
    renderAll();
    showToast("カテゴリを保存しました");
  }

  function handleCategoryAction(event) {
    const button = event.target.closest("[data-category-action]");
    if (!button) return;
    const item = button.closest("[data-category-id]");
    const category = state.categories.find(entry => entry.id === item?.dataset.categoryId);
    if (!category) return;
    const action = button.dataset.categoryAction;
    if (action === "edit") openCategoryModal(category);
    if (action === "delete") deleteCategory(category);
    if (action === "add-sub") addSubCategory(category);
    if (action === "rename-sub") {
      const index = Number(button.closest("[data-sub-index]")?.dataset.subIndex);
      renameSubCategory(category, index);
    }
    if (action === "delete-sub") {
      const index = Number(button.closest("[data-sub-index]")?.dataset.subIndex);
      deleteSubCategory(category, index);
    }
  }

  function deleteCategory(category) {
    const related = state.expenses.filter(expense => expense.majorCategory === category.name).length;
    const warning = related
      ? `「${category.name}」には${related}件の支出があります。明細は残りますが、生活費集計やカテゴリ選択の対象外になります。\n\n本当に削除しますか？`
      : `大カテゴリ「${category.name}」を削除しますか？`;
    if (!confirm(warning)) return;
    state.categories = state.categories.filter(item => item.id !== category.id);
    state.quickInputs = state.quickInputs.filter(item => item.majorCategory !== category.name);
    saveState();
    renderAll();
    showToast("大カテゴリを削除しました");
  }

  function addSubCategory(category) {
    const value = prompt(`「${category.name}」に追加する小カテゴリ名`);
    if (value === null) return;
    const name = value.trim();
    if (!name) return;
    if (category.subCategories.includes(name)) {
      alert("同じ名前の小カテゴリがすでにあります。");
      return;
    }
    category.subCategories.push(name);
    saveState();
    renderAll();
    showToast("小カテゴリを追加しました");
  }

  function renameSubCategory(category, index) {
    const oldName = category.subCategories[index];
    if (oldName === undefined) return;
    const value = prompt("小カテゴリ名を変更", oldName);
    if (value === null) return;
    const name = value.trim();
    if (!name || name === oldName) return;
    if (category.subCategories.includes(name)) {
      alert("同じ名前の小カテゴリがすでにあります。");
      return;
    }
    category.subCategories[index] = name;
    state.expenses.forEach(expense => {
      if (expense.majorCategory === category.name && expense.subCategory === oldName) expense.subCategory = name;
    });
    state.quickInputs.forEach(quick => {
      if (quick.majorCategory === category.name && quick.subCategory === oldName) quick.subCategory = name;
    });
    saveState();
    renderAll();
    showToast("小カテゴリ名を変更しました");
  }

  function deleteSubCategory(category, index) {
    const name = category.subCategories[index];
    if (name === undefined) return;
    if (category.subCategories.length <= 1) {
      alert("入力に必要なため、小カテゴリを最低1つ残してください。");
      return;
    }
    const related = state.expenses.filter(expense => expense.majorCategory === category.name && expense.subCategory === name).length;
    const warning = related
      ? `「${category.name} ＞ ${name}」には${related}件の支出があります。明細は残りますが選択肢から外れます。\n\n削除しますか？`
      : `小カテゴリ「${name}」を削除しますか？`;
    if (!confirm(warning)) return;
    category.subCategories.splice(index, 1);
    state.quickInputs = state.quickInputs.filter(item => !(item.majorCategory === category.name && item.subCategory === name));
    saveState();
    renderAll();
    showToast("小カテゴリを削除しました");
  }

  function renderSettingsQuickInputs() {
    els.settingsQuickList.innerHTML = state.quickInputs.map(quick => `
      <div class="settings-quick-row" data-quick-id="${escapeAttr(quick.id)}">
        <div><strong>${escapeHtml(quick.label)}・${yen(quick.amount)}</strong><small>${escapeHtml(quick.majorCategory)} ＞ ${escapeHtml(quick.subCategory)}${quick.memo ? `・${escapeHtml(quick.memo)}` : ""}</small></div>
        <div class="inline-actions">
          <button class="mini-action" type="button" data-quick-action="edit">編集</button>
          <button class="mini-action danger" type="button" data-quick-action="delete">削除</button>
        </div>
      </div>`).join("");
    els.settingsQuickEmpty.classList.toggle("is-hidden", state.quickInputs.length > 0);
  }

  function handleSettingsQuickAction(event) {
    const button = event.target.closest("[data-quick-action]");
    if (!button) return;
    const row = button.closest("[data-quick-id]");
    const quick = state.quickInputs.find(item => item.id === row?.dataset.quickId);
    if (!quick) return;
    if (button.dataset.quickAction === "delete") {
      if (!confirm(`クイック入力「${quick.label}」を削除しますか？`)) return;
      state.quickInputs = state.quickInputs.filter(item => item.id !== quick.id);
      saveState();
      renderQuickInputs();
      renderSettingsQuickInputs();
      showToast("クイック入力を削除しました");
      return;
    }
    $("#quickEditId").value = quick.id;
    $("#quickEditLabel").value = quick.label;
    $("#quickEditAmount").value = quick.amount;
    $("#quickEditMajor").innerHTML = state.categories.map(category => `<option value="${escapeAttr(category.name)}">${escapeHtml(category.name)}</option>`).join("");
    $("#quickEditMajor").value = quick.majorCategory;
    populateSubSelect($("#quickEditMajor"), $("#quickEditSub"), quick.subCategory);
    $("#quickEditMemo").value = quick.memo;
    openModal("quickEditModal");
  }

  function saveQuickEdit(event) {
    event.preventDefault();
    const quick = state.quickInputs.find(item => item.id === $("#quickEditId").value);
    if (!quick) return;
    quick.label = $("#quickEditLabel").value.trim();
    quick.amount = nonNegativeNumber($("#quickEditAmount").value);
    quick.majorCategory = $("#quickEditMajor").value;
    quick.subCategory = $("#quickEditSub").value;
    quick.memo = $("#quickEditMemo").value.trim();
    if (!quick.label || quick.amount <= 0 || !quick.subCategory) {
      alert("表示名、1円以上の金額、カテゴリを入力してください。");
      return;
    }
    saveState();
    closeModal("quickEditModal");
    renderQuickInputs();
    renderSettingsQuickInputs();
    showToast("クイック入力を更新しました");
  }

  function prepareCsvPreview() {
    const text = els.csvPaste.value.trim();
    if (!text) {
      alert("CSVデータを貼り付けてください。");
      return;
    }
    let records;
    try {
      records = parseCsv(text);
    } catch (error) {
      alert(`CSVを読み取れませんでした。\n${error.message}`);
      return;
    }
    if (!records.length) {
      alert("取り込める行がありません。");
      return;
    }
    const first = records[0].map(value => String(value).trim().toLowerCase());
    const hasHeader = first.includes("date") && first.includes("amount");
    let indexes = { date: 0, amount: 1, majorCategory: 2, subCategory: 3, memo: 4 };
    if (hasHeader) {
      indexes = {
        date: first.indexOf("date"),
        amount: first.indexOf("amount"),
        majorCategory: first.indexOf("majorcategory"),
        subCategory: first.indexOf("subcategory"),
        memo: first.indexOf("memo")
      };
      records = records.slice(1);
    }
    csvPreviewRows = records.filter(row => row.some(value => String(value).trim())).map(row => ({
      tempId: uid("csv"),
      include: true,
      date: String(row[indexes.date] ?? "").trim(),
      amount: Number(String(row[indexes.amount] ?? "").replace(/[¥￥,\s]/g, "")),
      majorCategory: String(row[indexes.majorCategory] ?? "").trim(),
      subCategory: String(row[indexes.subCategory] ?? "").trim(),
      memo: String(row[indexes.memo] ?? "").trim(),
      duplicate: false
    }));
    if (!csvPreviewRows.length) {
      alert("取り込める明細行がありません。");
      return;
    }
    recomputePreviewFlags();
    renderCsvPreview();
    closeModal("importModal");
    openModal("csvPreviewModal");
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (char === '"') {
        if (quoted && next === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === "," && !quoted) {
        row.push(field);
        field = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") index += 1;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }
    if (quoted) throw new Error("引用符（\"）が閉じられていません。");
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function renderCsvPreview() {
    els.csvPreviewList.innerHTML = csvPreviewRows.map((row, index) => {
      const category = state.categories.find(item => item.name === row.majorCategory);
      const errors = previewErrors(row);
      const badge = errors.length
        ? `<span class="error-badge">${escapeHtml(errors[0])}</span>`
        : row.duplicate ? `<span class="duplicate-badge">重複候補</span>` : "";
      return `
        <article class="csv-preview-card" data-csv-id="${escapeAttr(row.tempId)}">
          <div class="csv-card-head">
            <label class="include-toggle"><input type="checkbox" data-csv-field="include" ${row.include ? "checked" : ""}>取り込む</label>
            ${badge}
          </div>
          <div class="csv-edit-grid">
            <label>日付<input type="date" data-csv-field="date" value="${escapeAttr(row.date)}"></label>
            <label>金額<input type="number" inputmode="numeric" min="1" data-csv-field="amount" value="${Number.isFinite(row.amount) ? row.amount : ""}"></label>
            <label>大カテゴリ<select data-csv-field="majorCategory">
              <option value="">選択</option>
              ${state.categories.map(item => `<option value="${escapeAttr(item.name)}" ${item.name === row.majorCategory ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
            </select></label>
            <label>小カテゴリ<select data-csv-field="subCategory">
              <option value="">選択</option>
              ${(category?.subCategories || []).map(sub => `<option value="${escapeAttr(sub)}" ${sub === row.subCategory ? "selected" : ""}>${escapeHtml(sub)}</option>`).join("")}
            </select></label>
            <label class="wide">メモ<input type="text" maxlength="80" data-csv-field="memo" value="${escapeAttr(row.memo)}"></label>
          </div>
        </article>`;
    }).join("");
    updatePreviewSummary();
  }

  function handleCsvPreviewChange(event) {
    const field = event.target.dataset.csvField;
    const card = event.target.closest("[data-csv-id]");
    if (!field || !card) return;
    const row = csvPreviewRows.find(item => item.tempId === card.dataset.csvId);
    if (!row) return;
    if (field === "include") row.include = event.target.checked;
    else if (field === "amount") row.amount = Number(event.target.value);
    else row[field] = event.target.value;
    if (field === "majorCategory") {
      const category = state.categories.find(item => item.name === row.majorCategory);
      if (!category?.subCategories.includes(row.subCategory)) row.subCategory = category?.subCategories[0] || "";
      recomputePreviewFlags();
      renderCsvPreview();
      return;
    }
    recomputePreviewFlags();
    updatePreviewSummary();
    const errors = previewErrors(row);
    let badge = $(".duplicate-badge, .error-badge", card);
    const badgeText = errors[0] || (row.duplicate ? "重複候補" : "");
    if (badgeText && !badge) {
      badge = document.createElement("span");
      $(".csv-card-head", card).appendChild(badge);
    }
    if (badge) {
      badge.className = errors.length ? "error-badge" : "duplicate-badge";
      badge.textContent = badgeText;
      if (!badgeText) badge.remove();
    }
  }

  function recomputePreviewFlags() {
    csvPreviewRows.forEach(row => {
      row.duplicate = [...state.expenses, ...csvPreviewRows.filter(other => other.tempId !== row.tempId)].some(other =>
        other.date === row.date && Number(other.amount) === Number(row.amount) && similarMemo(other.memo, row.memo)
      );
    });
  }

  function previewErrors(row) {
    const errors = [];
    if (!validDateString(row.date)) errors.push("日付を確認");
    if (!Number.isFinite(row.amount) || row.amount <= 0) errors.push("金額を確認");
    const category = state.categories.find(item => item.name === row.majorCategory);
    if (!category) errors.push("大カテゴリを選択");
    else if (!category.subCategories.includes(row.subCategory)) errors.push("小カテゴリを選択");
    return errors;
  }

  function updatePreviewSummary() {
    const included = csvPreviewRows.filter(row => row.include);
    const duplicates = included.filter(row => row.duplicate).length;
    els.csvPreviewSummary.textContent = `${included.length}件を選択・合計 ${yen(sum(included.map(row => Number.isFinite(row.amount) ? row.amount : 0)))}${duplicates ? `・重複候補 ${duplicates}件` : ""}`;
  }

  function importCsvRows() {
    const selected = csvPreviewRows.filter(row => row.include);
    if (!selected.length) {
      alert("取り込む明細を1件以上選んでください。");
      return;
    }
    const invalid = selected.find(row => previewErrors(row).length);
    if (invalid) {
      alert("入力に不備がある行があります。赤い表示の項目を修正するか、「取り込む」を外してください。");
      return;
    }
    const duplicateCount = selected.filter(row => row.duplicate).length;
    if (duplicateCount && !confirm(`重複候補が${duplicateCount}件含まれています。選択したまま取り込みますか？`)) return;
    const now = new Date().toISOString();
    state.expenses.push(...selected.map((row, index) => ({
      id: uid("exp"),
      date: row.date,
      amount: Math.round(row.amount),
      majorCategory: row.majorCategory,
      subCategory: row.subCategory,
      memo: row.memo,
      createdAt: new Date(Date.now() + index).toISOString(),
      updatedAt: now,
      source: els.csvSource.value
    })));
    saveState();
    els.csvPaste.value = "";
    csvPreviewRows = [];
    closeModal("csvPreviewModal");
    els.filterMajor.value = "";
    els.filterSub.value = "";
    renderAll();
    els.filterMonth.value = monthKey(selected[0].date);
    updatePickerDisplays();
    renderTransactions();
    navigate("transactions");
    showToast(`${selected.length}件を取り込みました`);
  }

  function exportCsv() {
    const header = ["date", "amount", "majorCategory", "subCategory", "memo", "createdAt", "source"];
    const rows = sortedExpenses(state.expenses).map(expense => [
      expense.date,
      expense.amount,
      expense.majorCategory,
      expense.subCategory,
      expense.memo,
      expense.createdAt,
      expense.source
    ]);
    const content = [header, ...rows].map(row => row.map(csvEscape).join(",")).join("\r\n");
    downloadFile(`kakeibo-${todayISO()}.csv`, `\uFEFF${content}`, "text/csv;charset=utf-8");
    showToast("CSVを出力しました");
  }

  function exportJson() {
    const backup = {
      app: "まいにち家計簿",
      schemaVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      data: state
    };
    downloadFile(`kakeibo-backup-${todayISO()}.json`, JSON.stringify(backup, null, 2), "application/json");
    showToast("JSONバックアップを出力しました");
  }

  async function restoreJson(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (error) {
      alert("JSONファイルを読み取れませんでした。正しいバックアップファイルを選んでください。");
      return;
    }
    const data = parsed?.data || parsed;
    if (!data || !Array.isArray(data.expenses) || !Array.isArray(data.categories)) {
      alert("このファイルは家計簿バックアップとして認識できませんでした。");
      return;
    }
    if (!confirm("現在の支出・カテゴリ・予算・クイック入力を、選択したバックアップで上書きします。続けますか？")) return;
    state = normalizeState(data);
    saveState();
    resetExpenseForm();
    els.filterMonth.value = monthKey(todayISO());
    updatePickerDisplays();
    renderAll();
    navigate("home");
    showToast("バックアップを復元しました");
  }

  function deleteAllData() {
    if (!confirm("すべての支出・カテゴリ・予算・クイック入力を削除し、初期状態に戻します。この操作は取り消せません。")) return;
    if (!confirm("最終確認：本当に全データを削除しますか？必要なら先にJSONバックアップを保存してください。")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = createDefaultState();
    saveState();
    resetExpenseForm();
    els.filterMonth.value = monthKey(todayISO());
    updatePickerDisplays();
    renderAll();
    navigate("home");
    showToast("全データを削除し、初期状態に戻しました");
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove("is-hidden");
    document.body.classList.add("modal-open");
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add("is-hidden");
    if (!$('.modal-backdrop:not(.is-hidden)')) document.body.classList.remove("modal-open");
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 2600);
  }

  function expensesBetween(start, end) {
    return state.expenses.filter(expense => expense.date >= start && expense.date <= end);
  }

  function getCategory(name) {
    return state.categories.find(category => category.name === name);
  }

  function progressStatus(rate, budget, spent) {
    if ((budget === 0 && spent > 0) || rate >= 100) return { label: "アウト", className: "is-over", labelClass: "over" };
    if (rate >= 80) return { label: "危険", className: "is-danger", labelClass: "danger" };
    if (rate >= 60) return { label: "注意", className: "is-caution", labelClass: "caution" };
    return { label: budget === 0 ? "未設定" : "順調", className: "", labelClass: "" };
  }

  function setProgress(element, rate) {
    const status = progressStatus(rate, 1, rate);
    element.style.width = `${Math.min(Math.max(rate, 0), 100)}%`;
    element.className = `progress-fill ${status.className}`.trim();
  }

  function setSignedAmount(element, value) {
    element.textContent = yen(value);
    element.classList.toggle("is-negative", value < 0);
  }

  function percent(value, budget) {
    if (budget === 0) return value > 0 ? 100 : 0;
    return value / budget * 100;
  }

  function sum(values) {
    return values.reduce((total, value) => total + (Number(value) || 0), 0);
  }

  function nonNegativeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
  }

  function yen(value) {
    const number = Number(value) || 0;
    const sign = number < 0 ? "−" : "";
    return `${sign}¥${Math.abs(Math.round(number)).toLocaleString("ja-JP")}`;
  }

  function todayISO() {
    return dateToISO(new Date());
  }

  function dateToISO(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function parseLocalDate(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function validDateString(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
    const date = parseLocalDate(value);
    return !Number.isNaN(date.getTime()) && dateToISO(date) === value;
  }

  function monthKey(date) {
    return String(date).slice(0, 7);
  }

  function startOfWeek(date) {
    return addDays(date, -normalizeWeekday(date.getDay()));
  }

  function normalizeWeekday(day) {
    return day === 0 ? 6 : day - 1;
  }

  function addDays(date, days) {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    result.setDate(result.getDate() + days);
    return result;
  }

  function formatShortDate(value) {
    const date = typeof value === "string" ? parseLocalDate(value) : value;
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  function formatLongDate(value) {
    const date = parseLocalDate(value);
    const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（${weekday}）`;
  }

  function sortedExpenses(expenses) {
    return [...expenses].sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function similarMemo(a, b) {
    const normalize = value => String(value || "").toLowerCase().replace(/[\s　\-ー・,.、。]/g, "");
    const left = normalize(a);
    const right = normalize(b);
    if (!left && !right) return true;
    if (left === right) return true;
    return left.length >= 3 && right.length >= 3 && (left.includes(right) || right.includes(left));
  }

  function sourceLabel(source) {
    return { manual: "手入力", chatgpt: "ChatGPT", csv: "CSV", rakuten: "楽天カード", receipt: "レシート" }[source] || source;
  }

  function orderCategories(categories) {
    return categories
      .map((category, index) => ({ category, index }))
      .sort((left, right) => {
        const leftRank = CATEGORY_INPUT_ORDER.indexOf(left.category.name);
        const rightRank = CATEGORY_INPUT_ORDER.indexOf(right.category.name);
        const leftKnown = leftRank >= 0;
        const rightKnown = rightRank >= 0;
        if (leftKnown && rightKnown) return leftRank - rightRank;
        if (leftKnown !== rightKnown) {
          const known = leftKnown ? left : right;
          const custom = leftKnown ? right : left;
          const customBeforeFixed = custom.category.group === "生活費" && known.category.group === "固定費";
          return (leftKnown === customBeforeFixed) ? 1 : -1;
        }
        if (left.category.group !== right.category.group) return left.category.group === "生活費" ? -1 : 1;
        return left.index - right.index;
      })
      .map(item => item.category);
  }

  function updatePickerDisplays() {
    if (els.expenseDateDisplay) {
      els.expenseDateDisplay.textContent = validDateString(els.expenseDate.value)
        ? formatLongDate(els.expenseDate.value)
        : "日付を選択";
    }
    if (els.filterMonthDisplay) {
      const match = /^(\d{4})-(\d{2})$/.exec(els.filterMonth.value);
      els.filterMonthDisplay.textContent = match ? `${match[1]}年${Number(match[2])}月` : "月を選択";
    }
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function uid(prefix) {
    const random = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${random}`;
  }

  function localeSort(a, b) {
    return String(a).localeCompare(String(b), "ja");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
