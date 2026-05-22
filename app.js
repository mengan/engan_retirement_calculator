// ===== State =====
const LS_KEY = "retirement-calc-v1";
const fmt = n => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString();
const uid = () => Math.random().toString(36).slice(2, 10);

const DEFAULT_TAX_BRACKETS_MFJ_2024 = [
  { rate: 10, upTo: 23200 },
  { rate: 12, upTo: 94300 },
  { rate: 22, upTo: 201050 },
  { rate: 24, upTo: 383900 },
  { rate: 32, upTo: 487450 },
  { rate: 35, upTo: 731200 },
  { rate: 37, upTo: 0 }, // 0 = no cap
];
const DEFAULT_LTCG_BRACKETS_MFJ_2024 = [
  { rate: 0,  upTo: 94050 },
  { rate: 15, upTo: 583750 },
  { rate: 20, upTo: 0 },
];

const defaultState = () => ({
  version: 2,
  settings: {
    currentYear: 2026, endYear: 2065,
    taxRate: 18, cgRate: 15, salaryReal: false,
    // Investment return range (low/high). Mid is computed.
    defaultReturnLow: 4.5,
    defaultReturnHigh: 7.5,
    // Inflation range (low/high). Mid is computed.
    defaultInflationLow: 2.0,
    defaultInflationHigh: 4.0,
    defaultPropertyAppreciation: 3,
    defaultRentGrowth: 3,
    // Bracket taxation
    useTaxBrackets: true,
    stdDeduction: 29200,
    taxRisePct: 0,       // extra percentage points added to all bracket rates after taxRiseYear
    taxRiseYear: 2026,   // year the rate increase takes effect
    // % of any taxable-brokerage withdrawal assumed to be realized capital gains
    // (when you don't track basis precisely). 50% is a common rough default for
    // long-held portfolios that have roughly doubled.
    taxableCapGainsPct: 50,
    filingStatus: "mfj",
    taxBrackets: DEFAULT_TAX_BRACKETS_MFJ_2024.map(b => ({...b})),
    ltcgBrackets: DEFAULT_LTCG_BRACKETS_MFJ_2024.map(b => ({...b})),
    // Withdrawal strategy. "traditional" covers both IRA and 401(k)
    // (assumed rolled into a traditional IRA at retirement).
    withdrawalOrder: ["taxable", "roth", "traditional", "inherited_ira", "hsa"],
    // When true and a Roth fill_X strategy is active, cash-gap withdrawals from
    // traditional/inherited IRA are capped at the bracket headroom — non-ordinary
    // accounts cover any overflow before the model would bust into a higher bracket.
    bracketAwareWithdrawals: true,
    // Safe-Withdrawal-Rate guardrails (separate from expense forecast)
    swr: 3.5,
    swrMethod: "dynamic",     // static | dynamic | guyton_klinger
    swrUpperBand: 20,         // % over initial WR → cut spending
    swrLowerBand: 20,         // % under initial WR → raise spending
    swrAdjust: 10,            // % cut/raise size
    swrIncludeRealEstate: false,
    // Roth conversion strategy
    rothConv: {
      strategy: "fill_12",     // none | fill_12 | fill_22 | fill_24 | fill_32 | custom
      startYear: 2035,
      endYear: 2042,
      customAmount: 0,
      // When true, conversions are suppressed in any year inherited IRA still has balance,
      // so they "kick in" the year the inherited IRA goes to zero (overrides startYear).
      startAfterInheritedDepleted: true,
    },
    // Inherited IRA strategy (10-year drain rule)
    inheritedIra: {
      strategy: "fill_first",  // rmd_only | fill_first | split_50_50 | custom | even_drain
      splitPct: 50,            // when strategy === custom: % of bracket headroom from inherited IRA
      // Opt-in: cap the mandatory inherited drain at the Roth bracket-fill target.
      // Off by default so the IRS annual-RMD obligation (for post-RBD inheritances) is
      // respected. Turn on only if your inheritance qualifies for skipping annual RMDs.
      capAtBracketFill: false,
    },
    hasSpouse2: true,
    s1: { name: "Spouse 1", age: 50, salary: 120000, salaryGrowth: 3, retireYear: 2035, contrib: 23000, ssAge: 67, ssAmt: 36000 },
    s2: { name: "Spouse 2", age: 48, salary: 90000,  salaryGrowth: 3, retireYear: 2037, contrib: 20000, ssAge: 67, ssAmt: 28000 },
  },
  expenses: {
    base: 7500, inflation: 3, preRetMult: 100,
    phases: [
      { start: 65, end: 74, mult: 110 },
      { start: 75, end: 84, mult: 85 },
      { start: 85, end: 110, mult: 120 },
    ],
    large: [
      { id: uid(), desc: "Wedding gift", year: 2030, amount: 30000, inflate: false },
      { id: uid(), desc: "New car",      year: 2032, amount: 45000, inflate: true  },
    ],
    recurring: [
      { id: uid(), desc: "Healthcare",        amount: 1500, period: "monthly", inflate: true,  startYear: 2035, endYear: 2065 },
      { id: uid(), desc: "Travel",            amount: 10000, period: "annual",  inflate: true,  startYear: 2035, endYear: 2050 },
      { id: uid(), desc: "Vehicle financing", amount: 500,  period: "monthly", inflate: false, startYear: 2032, endYear: 2039 },
    ],
  },
  accounts: [
    { id: uid(), name: "Joint Brokerage", type: "taxable",       owner: "Joint",    balance: 250000, basis: 180000, returnPct: 6, contribution: 12000, dividendYield: 2.0 },
    { id: uid(), name: "S1 401k",         type: "401k",          owner: "Spouse 1", balance: 600000, basis: 0,      returnPct: 6.5, contribution: 23000 },
    { id: uid(), name: "S2 IRA",          type: "ira",           owner: "Spouse 2", balance: 220000, basis: 0,      returnPct: 6, contribution: 7000 },
    { id: uid(), name: "S1 Roth",         type: "roth",          owner: "Spouse 1", balance: 150000, basis: 0,      returnPct: 6.5, contribution: 7000 },
  ],
  properties: [
    { id: uid(), name: "Primary Home", type: "primary", value: 750000, appreciation: 3,
      loanBalance: 280000, payment: 2800, escrow: 700, interestRate: 4.25,
      isRental: false, rent: 0, rentGrowth: 0, basis: 0, sellYear: 0, accumDepreciation: 0, taxablePct: 0 },
    { id: uid(), name: "Rental Condo", type: "investment", value: 350000, appreciation: 3,
      loanBalance: 120000, payment: 1400, escrow: 350, interestRate: 5.0,
      isRental: true, rent: 2400, rentGrowth: 3, basis: 220000, sellYear: 2040, accumDepreciation: 60000, taxablePct: 30 },
  ],
});

let state;
let saveTimer = null;

function migrate(s) {
  // Fill in any newly added fields from defaults so older state files keep working.
  const d = defaultState();

  // Schema version 2: expenses.base changed from annual to monthly.
  s.version = s.version || 1;
  if (s.version < 2 && s.expenses && typeof s.expenses.base === "number") {
    s.expenses.base = Math.round(s.expenses.base / 12);
    s.version = 2;
  }

  // Schema version 3: replace single defaultReturn/defaultInflation with low/high ranges.
  if (s.settings) {
    if (s.settings.defaultReturnLow == null && s.settings.defaultReturn != null) {
      s.settings.defaultReturnLow  = Math.max(0, s.settings.defaultReturn - 1.5);
      s.settings.defaultReturnHigh = s.settings.defaultReturn + 1.5;
    }
    if (s.settings.defaultInflationLow == null && s.settings.defaultInflation != null) {
      s.settings.defaultInflationLow  = Math.max(0, s.settings.defaultInflation - 1);
      s.settings.defaultInflationHigh = s.settings.defaultInflation + 1;
    }
    if (s.settings.defaultReturnLow == null)  s.settings.defaultReturnLow  = 4.5;
    if (s.settings.defaultReturnHigh == null) s.settings.defaultReturnHigh = 7.5;
    if (s.settings.defaultInflationLow == null)  s.settings.defaultInflationLow  = 2.0;
    if (s.settings.defaultInflationHigh == null) s.settings.defaultInflationHigh = 4.0;
  }
  // Init recurring expenses list
  if (s.expenses && !Array.isArray(s.expenses.recurring)) s.expenses.recurring = [];

  s.settings = { ...d.settings, ...(s.settings || {}) };
  s.settings.rothConv     = { ...d.settings.rothConv,     ...(s.settings.rothConv     || {}) };
  s.settings.inheritedIra = { ...d.settings.inheritedIra, ...(s.settings.inheritedIra || {}) };
  // Flip leftover capAtBracketFill: previously defaulted to true (which violated the
  // SECURE Act annual-RMD rule for post-RBD inheritances). Reset on first load.
  if (s.settings.inheritedIra._capMigrated !== true) {
    s.settings.inheritedIra.capAtBracketFill = false;
    s.settings.inheritedIra._capMigrated = true;
  }
  // Default inheritance year on any inherited_ira account that doesn't have one
  if (Array.isArray(s.accounts)) {
    s.accounts.forEach(a => {
      if (a.type === "inherited_ira" && !a.inheritanceYear) a.inheritanceYear = (s.settings.currentYear || 2026) - 1;
      if (a.type === "taxable" && a.dividendYield == null) a.dividendYield = 2.0;
    });
  }
  if (Array.isArray(s.properties)) {
    s.properties.forEach(p => {
      if (p.isRental && p.taxablePct == null) p.taxablePct = 30;
      if (p.escrow == null) p.escrow = 0;
    });
  }
  if (!Array.isArray(s.settings.taxBrackets) || !s.settings.taxBrackets.length)
    s.settings.taxBrackets = d.settings.taxBrackets;
  if (!Array.isArray(s.settings.ltcgBrackets) || !s.settings.ltcgBrackets.length)
    s.settings.ltcgBrackets = d.settings.ltcgBrackets;
  if (!Array.isArray(s.settings.withdrawalOrder) || !s.settings.withdrawalOrder.length) {
    s.settings.withdrawalOrder = d.settings.withdrawalOrder;
  } else {
    // Collapse legacy "401k" + "ira" buckets into single "traditional"; dedupe.
    const out = [];
    s.settings.withdrawalOrder.forEach(k => {
      const mapped = (k === "401k" || k === "ira") ? "traditional" : k;
      if (!out.includes(mapped)) out.push(mapped);
    });
    // Ensure all known buckets still appear (preserving user order)
    ["taxable", "roth", "traditional", "inherited_ira", "hsa"].forEach(k => {
      if (!out.includes(k)) out.push(k);
    });
    s.settings.withdrawalOrder = out;
  }
  s.expenses = { ...d.expenses, ...(s.expenses || {}) };
  if (!Array.isArray(s.expenses.phases) || s.expenses.phases.length !== 3)
    s.expenses.phases = d.expenses.phases;
  if (!Array.isArray(s.expenses.large)) s.expenses.large = [];
  if (!Array.isArray(s.accounts)) s.accounts = d.accounts;
  if (!Array.isArray(s.properties)) s.properties = d.properties;
  return s;
}

async function loadState() {
  // Try server first (persists across reloads + server restarts)
  try {
    const res = await fetch("/api/state");
    if (res.ok) {
      const data = await res.json();
      if (data && data.settings) {
        state = migrate(data);
        return;
      }
    }
  } catch (e) { /* fall through to localStorage */ }

  const raw = localStorage.getItem(LS_KEY);
  state = raw ? migrate(JSON.parse(raw)) : defaultState();
}

function saveState() {
  // Local copy for offline fallback
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  // Debounced server save
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
    } catch (e) { /* silent */ }
  }, 400);
}

// ===== Tabs =====
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

// Intro "Get Started" button navigates to General Settings
document.getElementById("intro-start-btn").addEventListener("click", () => {
  document.querySelector(".tab[data-tab='settings']").click();
});

// ===== Settings UI =====
const settingsBindings = [
  ["set-current-year", "settings.currentYear", "int"],
  ["set-end-year",     "settings.endYear", "int"],
  ["set-default-return-low",  "settings.defaultReturnLow",  "float"],
  ["set-default-return-high", "settings.defaultReturnHigh", "float"],
  ["set-default-inflation-low",  "settings.defaultInflationLow",  "float"],
  ["set-default-inflation-high", "settings.defaultInflationHigh", "float"],
  ["set-default-property-appreciation", "settings.defaultPropertyAppreciation", "float"],
  ["set-default-rent-growth", "settings.defaultRentGrowth", "float"],
  ["set-salary-real",  "settings.salaryReal", "bool"],

  ["s1-name", "settings.s1.name", "str"],
  ["s1-age", "settings.s1.age", "int"],
  ["s1-salary", "settings.s1.salary", "float"],
  ["s1-salary-growth", "settings.s1.salaryGrowth", "float"],
  ["s1-retire-year", "settings.s1.retireYear", "int"],
  ["s1-contrib", "settings.s1.contrib", "float"],
  ["s1-ss-age", "settings.s1.ssAge", "int"],
  ["s1-ss-amt", "settings.s1.ssAmt", "float"],

  ["s2-name", "settings.s2.name", "str"],
  ["s2-age", "settings.s2.age", "int"],
  ["s2-salary", "settings.s2.salary", "float"],
  ["s2-salary-growth", "settings.s2.salaryGrowth", "float"],
  ["s2-retire-year", "settings.s2.retireYear", "int"],
  ["s2-contrib", "settings.s2.contrib", "float"],
  ["s2-ss-age", "settings.s2.ssAge", "int"],
  ["s2-ss-amt", "settings.s2.ssAmt", "float"],

  ["exp-base", "expenses.base", "float"],
  ["exp-preret", "expenses.preRetMult", "float"],

  ["phase1-start", "expenses.phases.0.start", "int"],
  ["phase1-end",   "expenses.phases.0.end", "int"],
  ["phase1-mult",  "expenses.phases.0.mult", "float"],
  ["phase2-start", "expenses.phases.1.start", "int"],
  ["phase2-end",   "expenses.phases.1.end", "int"],
  ["phase2-mult",  "expenses.phases.1.mult", "float"],
  ["phase3-start", "expenses.phases.2.start", "int"],
  ["phase3-end",   "expenses.phases.2.end", "int"],
  ["phase3-mult",  "expenses.phases.2.mult", "float"],
];

function getByPath(obj, path) {
  return path.split(".").reduce((o, k) => o[isNaN(k) ? k : parseInt(k)], obj);
}
function setByPath(obj, path, val) {
  const parts = path.split(".");
  const last = parts.pop();
  const parent = parts.reduce((o, k) => o[isNaN(k) ? k : parseInt(k)], obj);
  parent[isNaN(last) ? last : parseInt(last)] = val;
}
function applySpouse2Visibility() {
  const has = state.settings.hasSpouse2 !== false;
  const fs = document.getElementById("spouse2-fieldset");
  const btn = document.getElementById("spouse2-toggle");
  if (fs) {
    fs.style.opacity = has ? "" : "0.35";
    fs.querySelectorAll("input").forEach(el => el.disabled = !has);
  }
  if (btn) btn.textContent = has ? "✕" : "✚";
  if (btn) btn.title = has ? "Remove Spouse 2" : "Add Spouse 2";
  renderSSTab();
}

function bindSettings() {
  // Wire spouse2 toggle button (× to disable, ✚ to re-enable)
  const sp2btn = document.getElementById("spouse2-toggle");
  if (sp2btn) {
    sp2btn.addEventListener("click", () => {
      state.settings.hasSpouse2 = !(state.settings.hasSpouse2 !== false);
      applySpouse2Visibility();
      saveState();
      recalc();
    });
  }

  settingsBindings.forEach(([id, path, type]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = getByPath(state, path);
    if (type === "bool") el.value = String(val);
    else el.value = val;
    el.addEventListener("change", () => {
      let v = el.value;
      if (type === "int") v = parseInt(v) || 0;
      else if (type === "float") v = parseFloat(v) || 0;
      else if (type === "bool") v = v === "true";
      setByPath(state, path, v);
      saveState();
      recalc();
    });
  });
}

// ===== Large Expenses =====
function renderLargeExpenses() {
  const tbody = document.querySelector("#large-expenses-table tbody");
  tbody.innerHTML = "";
  state.expenses.large.forEach(ex => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" value="${ex.desc}" data-field="desc"/></td>
      <td><input type="number" value="${ex.year}" data-field="year"/></td>
      <td><input type="number" value="${ex.amount}" data-field="amount"/></td>
      <td><input type="checkbox" ${ex.inflate ? "checked" : ""} data-field="inflate"/></td>
      <td><button class="small danger" data-action="del">×</button></td>
    `;
    tr.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("change", () => {
        const f = inp.dataset.field;
        if (f === "inflate") ex.inflate = inp.checked;
        else if (f === "desc") ex.desc = inp.value;
        else ex[f] = parseFloat(inp.value) || 0;
        saveState(); recalc();
      });
    });
    tr.querySelector("[data-action='del']").addEventListener("click", () => {
      state.expenses.large = state.expenses.large.filter(e => e.id !== ex.id);
      saveState(); renderLargeExpenses(); recalc();
    });
    tbody.appendChild(tr);
  });
}
// ===== Recurring Expenses =====
function renderRecurringExpenses() {
  const tbody = document.querySelector("#recurring-expenses-table tbody");
  tbody.innerHTML = "";

  // Synthetic read-only Mortgage row from Real Estate (non-rental properties).
  const monthlyMortgage = (state.properties || [])
    .filter(p => !p.isRental && p.loanBalance > 0)
    .reduce((sum, p) => sum + (p.payment || 0), 0);
  const mortgageRow = document.createElement("tr");
  mortgageRow.style.background = "#f1f5f9";
  mortgageRow.innerHTML = `
    <td><em>Mortgage (auto from Real Estate)</em></td>
    <td>${fmt(monthlyMortgage)}</td>
    <td>per month</td>
    <td>—</td>
    <td>—</td>
    <td style="text-align:center;color:#94a3b8;">auto</td>
    <td></td>
  `;
  mortgageRow.querySelectorAll("td").forEach(td => td.style.color = "#475569");
  tbody.appendChild(mortgageRow);

  state.expenses.recurring.forEach(ex => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" value="${ex.desc}" data-field="desc"/></td>
      <td><input type="number" value="${ex.amount}" data-field="amount"/></td>
      <td>
        <select data-field="period">
          <option value="monthly" ${ex.period === "monthly" ? "selected" : ""}>per month</option>
          <option value="annual"  ${ex.period === "annual"  ? "selected" : ""}>per year</option>
        </select>
      </td>
      <td><input type="number" value="${ex.startYear}" data-field="startYear"/></td>
      <td><input type="number" value="${ex.endYear}" data-field="endYear"/></td>
      <td style="text-align:center;"><input type="checkbox" ${ex.inflate ? "checked" : ""} data-field="inflate"/></td>
      <td><button class="small danger" data-action="del">×</button></td>
    `;
    tr.querySelectorAll("input, select").forEach(inp => {
      inp.addEventListener("change", () => {
        const f = inp.dataset.field;
        if (!f) return;
        if (f === "inflate") ex.inflate = inp.checked;
        else if (f === "desc" || f === "period") ex[f] = inp.value;
        else ex[f] = parseFloat(inp.value) || 0;
        saveState(); recalc();
      });
    });
    tr.querySelector("[data-action='del']").addEventListener("click", () => {
      state.expenses.recurring = state.expenses.recurring.filter(e => e.id !== ex.id);
      saveState(); renderRecurringExpenses(); recalc();
    });
    tbody.appendChild(tr);
  });
}
document.getElementById("add-recurring-expense").addEventListener("click", () => {
  state.expenses.recurring.push({
    id: uid(), desc: "New Recurring", amount: 500, period: "monthly",
    inflate: true, startYear: state.settings.currentYear,
    endYear: state.settings.endYear,
  });
  saveState(); renderRecurringExpenses(); recalc();
});

document.getElementById("add-large-expense").addEventListener("click", () => {
  state.expenses.large.push({ id: uid(), desc: "New Expense", year: state.settings.currentYear + 1, amount: 10000, inflate: false });
  saveState(); renderLargeExpenses(); recalc();
});

// ===== Investment Accounts =====
const ACCOUNT_TYPES = [
  ["taxable", "Taxable Brokerage"],
  ["ira", "Traditional IRA"],
  ["sep_ira", "SEP IRA"],
  ["roth", "Roth IRA"],
  ["401k", "401(k) / 403(b)"],
  ["inherited_ira", "Inherited IRA"],
  ["hsa", "HSA"],
];
function renderAccountTotals() {
  const container = document.getElementById("account-totals-cards");
  if (!container) return;
  const sumOf = (...types) => state.accounts
    .filter(a => types.includes(a.type))
    .reduce((sum, a) => sum + (a.balance || 0), 0);
  const groups = [
    { label: "Taxable Brokerage",      total: sumOf("taxable") },
    { label: "Traditional IRA / 401k", total: sumOf("ira", "401k") },
    { label: "Roth IRA",               total: sumOf("roth") },
    { label: "Inherited IRA",          total: sumOf("inherited_ira") },
    { label: "HSA",                    total: sumOf("hsa") },
  ];
  const grand = groups.reduce((s, g) => s + g.total, 0);
  container.innerHTML = groups.map(g => `
    <div class="card">
      <div class="card-label">${g.label}</div>
      <div class="card-value">${fmt(g.total)}</div>
    </div>
  `).join("") + `
    <div class="card" style="background:#1f3a5f;color:#fff;">
      <div class="card-label" style="color:#cbd5e1;">Total Liquid</div>
      <div class="card-value" style="color:#fff;">${fmt(grand)}</div>
    </div>
  `;
}

function renderAccounts() {
  renderAccountTotals();
  const tbody = document.querySelector("#accounts-table tbody");
  tbody.innerHTML = "";
  let dragSrcId = null;

  state.accounts.forEach(a => {
    const tr = document.createElement("tr");
    tr.draggable = true;
    tr.dataset.id = a.id;
    const typeOpts = ACCOUNT_TYPES.map(([v, label]) =>
      `<option value="${v}" ${a.type === v ? "selected" : ""}>${label}</option>`).join("");
    tr.innerHTML = `
      <td style="cursor:grab;text-align:center;color:#94a3b8;user-select:none;" title="Drag to reorder">&#9651;&#9661;</td>
      <td><input type="text" value="${a.name}" data-field="name"/></td>
      <td><select data-field="type">${typeOpts}</select></td>
      <td>
        <select data-field="owner">
          <option ${a.owner==='Spouse 1'?'selected':''}>Spouse 1</option>
          <option ${a.owner==='Spouse 2'?'selected':''}>Spouse 2</option>
          <option ${a.owner==='Joint'?'selected':''}>Joint</option>
        </select>
      </td>
      <td><input type="number" value="${a.balance}" data-field="balance"/></td>
      <td><input type="number" value="${a.basis}" data-field="basis" ${a.type==='taxable'?'':'disabled'}/></td>
      <td><input type="number" step="0.1" value="${a.dividendYield ?? (a.type==='taxable'?2:0)}" data-field="dividendYield" ${a.type==='taxable'?'':'disabled'}/></td>
      <td><input type="number" value="${a.inheritanceYear || ''}" data-field="inheritanceYear" placeholder="—" ${a.type==='inherited_ira'?'':'disabled'}/></td>
      <td style="text-align:center">${['ira','sep_ira','401k','inherited_ira'].includes(a.type) ? `<input type="checkbox" data-field="rmdTakenAlready" ${a.rmdTakenAlready ? 'checked' : ''} title="Check if full RMD already taken and is in taxable balance"/>` : ''}</td>
      <td><input type="number" value="${a.contribution}" data-field="contribution"/></td>
      <td><button class="small danger" data-action="del">×</button></td>
    `;

    tr.addEventListener("dragstart", e => {
      dragSrcId = a.id;
      e.dataTransfer.effectAllowed = "move";
      tr.style.opacity = "0.4";
    });
    tr.addEventListener("dragend", () => { tr.style.opacity = ""; });
    tr.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; tr.style.background = "#eff6ff"; });
    tr.addEventListener("dragleave", () => { tr.style.background = ""; });
    tr.addEventListener("drop", e => {
      e.preventDefault();
      tr.style.background = "";
      if (dragSrcId === a.id) return;
      const fromIdx = state.accounts.findIndex(x => x.id === dragSrcId);
      const toIdx   = state.accounts.findIndex(x => x.id === a.id);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = state.accounts.splice(fromIdx, 1);
      state.accounts.splice(toIdx, 0, moved);
      saveState(); renderAccounts(); recalc();
    });

    tr.querySelectorAll("input, select").forEach(inp => {
      inp.addEventListener("change", () => {
        const f = inp.dataset.field;
        if (!f) return;
        if (["name","type","owner"].includes(f)) a[f] = inp.value;
        else if (f === "rmdTakenAlready") a[f] = inp.checked;
        else a[f] = parseFloat(inp.value) || 0;
        saveState(); renderAccounts(); recalc();
      });
    });
    tr.querySelector("[data-action='del']").addEventListener("click", () => {
      state.accounts = state.accounts.filter(x => x.id !== a.id);
      saveState(); renderAccounts(); recalc();
    });
    tbody.appendChild(tr);
  });
}
document.getElementById("add-account").addEventListener("click", () => {
  state.accounts.push({ id: uid(), name: "New Account", type: "taxable", owner: "Joint",
    balance: 0, basis: 0, contribution: 0, dividendYield: 2.0 });
  saveState(); renderAccounts(); recalc();
});

// ===== Properties =====
function renderProperties() {
  const container = document.getElementById("properties-container");
  container.innerHTML = "";
  state.properties.forEach(p => {
    const div = document.createElement("div");
    div.className = "property-card" + (p.isRental ? " is-rental" : "");
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h3>${p.name}</h3>
        <button class="small danger" data-action="del">Delete</button>
      </div>
      <div class="grid-2">
        <label>Name <input type="text" value="${p.name}" data-field="name"/></label>
        <label>Type
          <select data-field="type">
            <option value="primary" ${p.type==='primary'?'selected':''}>Primary Residence</option>
            <option value="investment" ${p.type==='investment'?'selected':''}>Investment Property</option>
            <option value="secondary" ${p.type==='secondary'?'selected':''}>Second Home</option>
          </select>
        </label>
        <label>Current Market Value ($) <input type="number" value="${p.value}" data-field="value"/></label>
        <label>Loan Balance ($) <input type="number" value="${p.loanBalance}" data-field="loanBalance"/></label>
        <label>Total Monthly Payment PITI + Escrow ($)
          <input type="number" value="${p.payment}" data-field="payment"/>
          <small>Total monthly check — principal + interest + taxes + insurance.</small>
        </label>
        <label>Monthly Escrow ($)
          <input type="number" value="${p.escrow || 0}" data-field="escrow"/>
          <small>
            Taxes + insurance portion of the PITI above. Used to derive the true P&amp;I
            (PITI − escrow) so the amortization fallback pays the loan off on the right date.
          </small>
        </label>
        <label>Mortgage Interest Rate (%)
          <input type="number" step="0.01" value="${p.interestRate}" data-field="interestRate"/>
          <small>Used only when Loan Payoff Year is left at 0 (amortization fallback).</small>
        </label>
        <label>Loan Payoff Year <strong>(recommended)</strong>
          <input type="number" min="0" value="${p.loanPayoffYear || 0}" data-field="loanPayoffYear"/>
          <small>
            Set this to the year your loan actually ends. The projection will straight-line
            the principal so the balance hits $0 in that year, regardless of the PITI/escrow
            split. Leave at 0 to use the (less accurate) interest-rate amortization fallback.
          </small>
        </label>
        <label>Loan Payoff Month (1–12)
          <input type="number" min="1" max="12" value="${p.loanPayoffMonth || 12}" data-field="loanPayoffMonth"/>
          <small>Partial-year payments in the payoff year scale by month/12.</small>
        </label>
        <label>Treat as Rental?
          <select data-field="isRental">
            <option value="false" ${!p.isRental?'selected':''}>No</option>
            <option value="true" ${p.isRental?'selected':''}>Yes</option>
          </select>
        </label>
      </div>
      <div class="rental-fields">
        <h4>Rental Details</h4>
        <div class="grid-2">
          <label>Current Monthly Rent ($) <input type="number" value="${p.rent}" data-field="rent"/></label>
          <label>Cost Basis ($) <input type="number" value="${p.basis}" data-field="basis"/></label>
          <label>Accumulated Depreciation Already Taken ($) <input type="number" value="${p.accumDepreciation}" data-field="accumDepreciation"/></label>
          <label>% of Rent Collected That's Taxable
            <input type="number" step="1" min="0" max="100" value="${p.taxablePct ?? 30}" data-field="taxablePct"/>
            <small>
              Default 30%. The rest is offset on your tax return by mortgage interest, property tax,
              depreciation, maintenance, etc. Cash flow uses the full rent; only the taxable portion
              is added to ordinary income in the tax calc.
            </small>
          </label>
          <label>Planned Sell Year (0 = never) <input type="number" value="${p.sellYear}" data-field="sellYear"/></label>
          <small style="grid-column: span 2; color:#64748b;">
            Each year held adds ~3.636% of building basis (assume 80% of basis) to depreciation automatically.
            On sale, capital gain = sale price − (basis − accumulated depreciation), taxed at the CG rate.
          </small>
        </div>
      </div>
    `;
    div.querySelectorAll("input, select").forEach(inp => {
      inp.addEventListener("change", () => {
        const f = inp.dataset.field;
        if (!f) return;
        if (f === "name" || f === "type") p[f] = inp.value;
        else if (f === "isRental") {
          p.isRental = inp.value === "true";
          div.classList.toggle("is-rental", p.isRental);
        } else {
          p[f] = parseFloat(inp.value) || 0;
        }
        saveState(); recalc();
      });
    });
    div.querySelector("[data-action='del']").addEventListener("click", () => {
      state.properties = state.properties.filter(x => x.id !== p.id);
      saveState(); renderProperties(); recalc();
    });
    container.appendChild(div);
  });
}
document.getElementById("add-property").addEventListener("click", () => {
  state.properties.push({ id: uid(), name: "New Property", type: "primary",
    value: 400000, loanBalance: 200000, payment: 2000, escrow: 500, interestRate: 5,
    loanPayoffYear: 0, loanPayoffMonth: 12,
    isRental: false, rent: 0, basis: 0, sellYear: 0, accumDepreciation: 0, taxablePct: 30 });
  saveState(); renderProperties(); recalc();
});

// ===== Header Actions =====
document.getElementById("reset-btn").addEventListener("click", () => {
  if (!confirm("Reset all data to defaults?")) return;
  state = defaultState();
  saveState();
  fullRender();
});
document.getElementById("export-btn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "retirement-plan.json"; a.click();
  URL.revokeObjectURL(url);
});
document.getElementById("import-btn").addEventListener("click", () => {
  document.getElementById("import-file").click();
});
document.getElementById("import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    state = JSON.parse(text);
    saveState();
    fullRender();
  } catch (err) {
    alert("Import failed: " + err.message);
  }
});

// ===== Tax Helpers =====
// Same shape as bracketTax but returns one tax-paid number per bracket
// (parallel to `brackets`), so callers can see how the bill is distributed.
function bracketTaxByLine(income, brackets) {
  const out = brackets.map(() => 0);
  if (income <= 0 || !brackets.length) return out;
  let prevCap = 0;
  for (let i = 0; i < brackets.length; i++) {
    const b = brackets[i];
    const cap = b.upTo > 0 ? b.upTo : Infinity;
    if (income <= prevCap) break;
    const slice = Math.min(income, cap) - prevCap;
    if (slice > 0) out[i] = slice * b.rate / 100;
    prevCap = cap;
    if (income <= cap) break;
  }
  return out;
}

function ltcgTaxByLine(ordinaryTaxable, gains, ltcgBrackets) {
  const out = ltcgBrackets.map(() => 0);
  if (gains <= 0 || !ltcgBrackets.length) return out;
  let stack = ordinaryTaxable;
  let remaining = gains;
  for (let i = 0; i < ltcgBrackets.length; i++) {
    const b = ltcgBrackets[i];
    const cap = b.upTo > 0 ? b.upTo : Infinity;
    if (stack >= cap) continue;
    const room = cap - stack;
    const slice = Math.min(remaining, room);
    if (slice > 0) out[i] = slice * b.rate / 100;
    remaining -= slice;
    stack += slice;
    if (remaining <= 0) break;
  }
  return out;
}

function bracketTax(income, brackets) {
  if (income <= 0 || !brackets || !brackets.length) return 0;
  let tax = 0, prevCap = 0;
  for (const b of brackets) {
    const cap = b.upTo > 0 ? b.upTo : Infinity;
    if (income <= prevCap) break;
    const slice = Math.min(income, cap) - prevCap;
    if (slice > 0) tax += slice * b.rate / 100;
    prevCap = cap;
    if (income <= cap) break;
  }
  return tax;
}

function ltcgTaxFn(ordinaryTaxable, gains, ltcgBrackets) {
  if (gains <= 0 || !ltcgBrackets || !ltcgBrackets.length) return 0;
  let tax = 0;
  let stack = ordinaryTaxable;
  let remaining = gains;
  for (const b of ltcgBrackets) {
    const cap = b.upTo > 0 ? b.upTo : Infinity;
    if (stack >= cap) continue;
    const room = cap - stack;
    const slice = Math.min(remaining, room);
    if (slice > 0) tax += slice * b.rate / 100;
    remaining -= slice;
    stack += slice;
    if (remaining <= 0) break;
  }
  return tax;
}

function ssTaxablePortion(ssBenefit, otherIncome) {
  if (ssBenefit <= 0) return 0;
  const combined = otherIncome + ssBenefit * 0.5;
  if (combined <= 32000) return 0;
  if (combined <= 44000) {
    return Math.min((combined - 32000) * 0.5, ssBenefit * 0.85);
  }
  const tier1 = Math.min(6000, ssBenefit * 0.5);
  const tier2 = (combined - 44000) * 0.85;
  return Math.min(tier1 + tier2, ssBenefit * 0.85);
}

function marginalRate(taxable, brackets) {
  if (taxable <= 0) return brackets[0]?.rate || 0;
  let prevCap = 0;
  for (const b of brackets) {
    const cap = b.upTo > 0 ? b.upTo : Infinity;
    if (taxable >= prevCap && taxable < cap) return b.rate;
    prevCap = cap;
  }
  return brackets[brackets.length - 1].rate;
}

// Logical withdrawal-order key → underlying account types it drains.
const ORDER_KEY_TO_TYPES = {
  taxable:        ["taxable"],
  roth:           ["roth"],
  traditional:    ["ira", "sep_ira", "401k"],   // pretax accounts treated identically in retirement
  inherited_ira:  ["inherited_ira"],
  hsa:            ["hsa"],
};

const ORDINARY_INCOME_TYPES = new Set(["ira", "sep_ira", "401k", "inherited_ira"]);

// Withdraw `amount` from accounts following `order`. Optionally caps cumulative
// withdrawals from ordinary-income account types (traditional, inherited IRA) at
// `maxOrdinary` so we don't bust the tax bracket — non-ordinary accounts (taxable,
// roth, hsa) are not subject to the cap.
function withdrawFromAccounts(accounts, amount, order, capGainsPct, maxOrdinary) {
  const result = { byType: {}, gainsRealized: 0, unmet: 0, ordinaryUsed: 0 };
  if (amount <= 0) return result;
  let remaining = amount;
  for (const key of order) {
    if (remaining <= 0) break;
    const types = ORDER_KEY_TO_TYPES[key] || [key];
    const buckets = accounts.filter(a => types.includes(a.type) && a.balance > 0);
    for (const a of buckets) {
      const type = a.type;
      if (remaining <= 0) break;
      let take = Math.min(remaining, a.balance);

      // Cap ordinary-income types when a bracket headroom is provided
      if (maxOrdinary != null && ORDINARY_INCOME_TYPES.has(type)) {
        const room = Math.max(0, maxOrdinary - result.ordinaryUsed);
        take = Math.min(take, room);
        if (take <= 0) continue;
        result.ordinaryUsed += take;
      }
      if (take <= 0) continue;

      if (type === "taxable") {
        const pctFrac = (capGainsPct != null ? capGainsPct : 50) / 100;
        const basisFrac = a.balance > 0 ? Math.max(0, (a.balance - a.basis) / a.balance) : 0;
        const gainFrac = Math.max(pctFrac, basisFrac);
        result.gainsRealized += take * gainFrac;
        const basisPortion = take * (a.basis / Math.max(1, a.balance));
        a.basis = Math.max(0, a.basis - basisPortion);
      }
      a.balance -= take;
      remaining -= take;
      result.byType[type] = (result.byType[type] || 0) + take;
    }
  }
  result.unmet = remaining;
  return result;
}

// IRS Uniform Lifetime Table (2022+) — divisor by age. Required Minimum Distributions
// on Traditional IRA / 401(k) accounts begin at age 73 (current law).
const RMD_DIVISORS = {
  73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1, 80: 20.2,
  81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7,
  89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5,  95: 8.9,
  96:  8.4, 97:  7.8, 98:  7.3, 99:  6.8, 100: 6.4,
};
function getTraditionalRMDDivisor(age) {
  if (age < 73) return null;
  if (age in RMD_DIVISORS) return RMD_DIVISORS[age];
  return Math.max(2.0, 6.4 - (age - 100) * 0.3);
}

function distributeTraditionalRMD(accounts, s1Age, s2Age, isFirstYear = false) {
  // For each traditional IRA / 401k account, distribute (balance / divisor) into
  // taxable brokerage (it's already-taxed cash from there forward). Returns total
  // distributed; this also counts as ordinary income for the year.
  // isFirstYear: if true, subtract any RMD already taken this year from each account.
  let total = 0;
  accounts.forEach(a => {
    if (a.type !== "ira" && a.type !== "sep_ira" && a.type !== "401k") return;
    if (a.balance <= 0) return;
    const age = a.owner === "Spouse 2" ? s2Age : s1Age;
    const divisor = getTraditionalRMDDivisor(age);
    if (!divisor) return;
    if (isFirstYear && a.rmdTakenAlready) return; // full RMD already taken; balance already reflects it
    const fullRmd = Math.min(a.balance / divisor, a.balance);
    a.balance -= fullRmd;
    total += fullRmd;
  });
  if (total > 0) {
    let taxable = accounts.find(a => a.type === "taxable");
    if (!taxable) {
      taxable = { id: uid(), name: "Auto Taxable", type: "taxable", owner: "Joint",
        balance: 0, basis: 0, contribution: 0 };
      accounts.push(taxable);
    }
    taxable.balance += total;
    taxable.basis += total;
  }
  return total;
}

function drainInheritedToTaxable(accounts, amount) {
  // Move up to `amount` from inherited IRA accounts to taxable brokerage
  // (after paying ordinary income tax on the distribution).
  // Returns total drained (counts as ordinary income).
  if (amount <= 0) return 0;
  let remaining = amount;
  let drained = 0;
  const sources = accounts.filter(a => a.type === "inherited_ira" && a.balance > 0);
  for (const src of sources) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, src.balance);
    src.balance -= take;
    remaining -= take;
    drained += take;
  }
  if (drained > 0) {
    let taxable = accounts.find(a => a.type === "taxable");
    if (!taxable) {
      taxable = { id: uid(), name: "Auto Taxable", type: "taxable", owner: "Joint",
        balance: 0, basis: 0, contribution: 0 };
      accounts.push(taxable);
    }
    taxable.balance += drained;
    taxable.basis += drained;
  }
  return drained;
}

function inheritedMandatoryDistribution(accounts, currentYear, isFirstYear = false) {
  // Compute total mandatory distribution this year across all inherited IRAs.
  // inheritanceYear is the year the IRA was inherited (RMD already handled that year
  // by the benefactor / estate). Annual RMDs for the beneficiary begin the FOLLOWING
  // year (elapsed >= 1). The 10-year rule requires full drain by inheritanceYear + 10.
  // - elapsed 0 (the inheritance year itself): no distribution.
  // - elapsed 1..9: distribute balance / yearsLeft (years remaining in the 10-yr window).
  // - elapsed >= 10: must fully drain.
  let mandatory = 0;
  accounts.forEach(a => {
    if (a.type !== "inherited_ira" || a.balance <= 0) return;
    const inhYear = a.inheritanceYear || (currentYear - 1);
    const elapsed = currentYear - inhYear;
    if (elapsed <= 0) return; // inheritance year or future — no RMD yet
    if (isFirstYear && a.rmdTakenAlready) return; // full RMD already taken; balance already reflects it
    const yearsLeft = 10 - elapsed;
    const fullRmd = yearsLeft <= 0 ? a.balance : a.balance / yearsLeft;
    mandatory += fullRmd;
  });
  return mandatory;
}

function performRothConversion(accounts, amount) {
  if (amount <= 0) return 0;
  let remaining = amount;
  let converted = 0;
  for (const type of ["ira", "sep_ira", "401k", "inherited_ira"]) {
    if (remaining <= 0) break;
    const sources = accounts.filter(a => a.type === type && a.balance > 0);
    for (const src of sources) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, src.balance);
      src.balance -= take;
      remaining -= take;
      converted += take;
      let dst = accounts.find(a => a.type === "roth" && a.owner === src.owner);
      if (!dst) dst = accounts.find(a => a.type === "roth");
      if (!dst) {
        dst = { id: uid(), name: "Auto Roth", type: "roth", owner: src.owner,
                balance: 0, basis: 0, returnPct: src.returnPct, contribution: 0 };
        accounts.push(dst);
      }
      dst.balance += take;
    }
  }
  return converted;
}

// ===== Projection Engine =====
function phaseMultiplier(age) {
  for (const ph of state.expenses.phases) {
    if (age >= ph.start && age <= ph.end) return ph.mult / 100;
  }
  return 1;
}

function project(opts) {
  opts = opts || {};
  const noiseReturn = opts.noiseReturn || (() => 0);   // (yearIndex) -> percentage-point delta
  const noiseInfl   = opts.noiseInfl   || (() => 0);

  const s = state.settings;
  const startYear = s.currentYear;
  const endYear = s.endYear;

  // Effective rates for this projection run. If caller didn't override, use the midpoint of the
  // low/high range so the existing tables/tabs see a single "central" trajectory.
  const midReturn = ((s.defaultReturnLow || 0) + (s.defaultReturnHigh || 0)) / 2;
  const midInfl   = ((s.defaultInflationLow || 0) + (s.defaultInflationHigh || 0)) / 2;
  const effReturn = opts.returnPct    != null ? opts.returnPct    : midReturn;
  const effInfl   = opts.inflationPct != null ? opts.inflationPct : midInfl;

  // Working copies
  const accounts = state.accounts.map(a => ({ ...a }));
  const properties = state.properties.map(p => ({ ...p, sold: false }));

  const rows = [];
  let cumInfl = 1;  // cumulative inflation factor (1 at start)

  // Fraction of the current year remaining (e.g. May 20 → ~0.618).
  // Applied to all time-proportional flows in the first year only.
  const now = new Date();
  const dayOfYear = (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    - Date.UTC(now.getFullYear(), 0, 0)) / 86400000;
  const daysInYear = ((now.getFullYear() % 4 === 0 && (now.getFullYear() % 100 !== 0 || now.getFullYear() % 400 === 0)) ? 366 : 365);
  const yearFracRemaining = Math.max(0, Math.min(1, (daysInYear - dayOfYear) / daysInYear));

  for (let year = startYear; year <= endYear; year++) {
    const yearsOut = year - startYear;
    const frac = yearsOut === 0 ? yearFracRemaining : 1;
    const s1Age = s.s1.age + yearsOut;
    const s2Age = s.hasSpouse2 ? s.s2.age + yearsOut : s1Age;
    const olderAge = Math.max(s1Age, s2Age);

    // Inflation for THIS year — use effective inflation rate for the run
    const inflThisYear = (effInfl + noiseInfl(yearsOut)) / 100;
    if (yearsOut > 0) cumInfl *= (1 + inflThisYear);

    // Brackets & deduction inflate over time
    const stdDed = (s.stdDeduction || 29200) * cumInfl;
    const riseAdj = (s.taxRisePct || 0) > 0 && year >= (s.taxRiseYear || 9999) ? (s.taxRisePct || 0) : 0;
    const taxBrackets  = (s.taxBrackets  || []).map(b => ({ rate: b.rate + riseAdj, upTo: b.upTo > 0 ? b.upTo * cumInfl : 0 }));
    const ltcgBrackets = (s.ltcgBrackets || []).map(b => ({ rate: b.rate + riseAdj, upTo: b.upTo > 0 ? b.upTo * cumInfl : 0 }));

    // --- Income ---
    let salary1 = 0, salary2 = 0;
    if (year < s.s1.retireYear) {
      salary1 = (s.salaryReal
        ? s.s1.salary
        : s.s1.salary * Math.pow(1 + s.s1.salaryGrowth / 100, yearsOut)) * frac;
    }
    if (s.hasSpouse2 && year < s.s2.retireYear) {
      salary2 = (s.salaryReal
        ? s.s2.salary
        : s.s2.salary * Math.pow(1 + s.s2.salaryGrowth / 100, yearsOut)) * frac;
    }

    let grossSS = 0;
    if (s1Age >= s.s1.ssAge) grossSS += s.s1.ssAmt * cumInfl * frac;
    if (s.hasSpouse2 && s2Age >= s.s2.ssAge) grossSS += s.s2.ssAmt * cumInfl * frac;

    // --- Rental income & property cash flow ---
    // Convention: of the gross rent collected, the configured taxablePct (default 30%)
    // is treated as both taxable income AND the cash that flows through. The remaining 70%
    // is assumed to cover mortgage P&I, property tax, insurance, maintenance, depreciation,
    // and other deductions — so we don't subtract the rental mortgage separately.
    let rentalGross = 0;      // total rent collected (informational)
    let rentalNet = 0;        // = rentalTaxable; the portion that flows to income/cash
    let rentalTaxable = 0;
    let mortgagePayments = 0;        // non-rental mortgages (these hit expenses)
    let rentalMortgagePayments = 0;  // rental mortgages (informational; netted in 70%)
    let saleProceeds = 0;
    let saleGain = 0;
    properties.forEach(p => {
      if (p.sold) return;

      const propAppr = (s.defaultPropertyAppreciation ?? 3);
      p.value *= 1 + propAppr / 100;

      // Loan payoff: if the user provided an explicit payoff year, straight-line the
      // principal down so the balance hits $0 exactly in that year — and keep PITI
      // fixed at the user's value until then. This avoids the math paying the loan
      // off early (which happens when the PITI is treated as 100% P&I even though it
      // really includes escrow / taxes / insurance).
      // If no payoff year is given, fall back to standard amortization.
      let annualPmt = 0;
      let principalPaid = 0;
      const payoffYear = p.loanPayoffYear || 0;
      if (payoffYear > 0) {
        if (year > payoffYear) {
          p.loanBalance = 0;
        } else {
          const yearsLeft = payoffYear - year + 1; // ≥ 1
          if (year === payoffYear) {
            const m = Math.max(1, Math.min(12, p.loanPayoffMonth || 12));
            annualPmt    = p.payment * m;          // partial year, monthly × months
            principalPaid = p.loanBalance;         // wipe out remainder
          } else {
            annualPmt     = p.payment * 12;
            principalPaid = p.loanBalance / yearsLeft;
          }
          p.loanBalance = Math.max(0, p.loanBalance - principalPaid);
        }
      } else {
        // Amortize using just the P&I portion (PITI − escrow). The full PITI is still
        // what the user pays out of pocket each month, so it's what feeds expenses.
        const escrowMonthly = p.escrow || 0;
        const piMonthly = Math.max(0, (p.payment || 0) - escrowMonthly);
        const annualPI = piMonthly * 12;
        annualPmt = p.payment * 12;            // full PITI for expense reporting
        const annualInterest = p.loanBalance * (p.interestRate / 100);
        principalPaid = Math.max(0, annualPI - annualInterest);
        if (principalPaid > p.loanBalance) principalPaid = p.loanBalance;
        p.loanBalance = Math.max(0, p.loanBalance - principalPaid);
      }

      if (p.isRental && p.basis > 0) {
        p.accumDepreciation = (p.accumDepreciation || 0) + (p.basis * 0.8 * 0.03636);
      }

      if (p.isRental) {
        const rentGrow = (s.defaultRentGrowth ?? 3);
        const grownRent = p.rent * Math.pow(1 + rentGrow / 100, yearsOut);
        const annualRent = grownRent * 12 * frac;
        const taxableShare = annualRent * ((p.taxablePct ?? 30) / 100);
        rentalGross   += annualRent;
        rentalTaxable += taxableShare;
        rentalNet     += taxableShare;
        // Informational only — rental mortgage is conceptually inside the 70% deduction.
        if (annualPmt > 0 && (p.loanBalance > 0 || principalPaid > 0)) {
          rentalMortgagePayments += annualPmt * frac;
        }
      } else {
        if (annualPmt > 0 && (p.loanBalance > 0 || principalPaid > 0)) {
          mortgagePayments += annualPmt * frac;
        }
      }

      if (p.sellYear === year && !p.sold) {
        const adjBasis = Math.max(0, p.basis - (p.accumDepreciation || 0));
        const gain = Math.max(0, p.value - adjBasis);
        saleGain += gain;
        saleProceeds += p.value - p.loanBalance;  // gross of CG tax; tax handled below
        p.sold = true;
        p.loanBalance = 0;
        p.value = 0;
      }
    });

    // --- Expenses ---
    // Pre-retirement multiplier applies until the first spouse retires
    const firstRetireYear = s.hasSpouse2 ? Math.min(s.s1.retireYear, s.s2.retireYear) : s.s1.retireYear;
    const phaseMult = year < firstRetireYear
      ? state.expenses.preRetMult / 100
      : phaseMultiplier(olderAge);

    // expenses.base is MONTHLY in today's dollars — convert to annual here.
    let baseExp = state.expenses.base * 12 * cumInfl * phaseMult * frac;

    let largeExpThisYear = 0;
    state.expenses.large.forEach(ex => {
      if (ex.year === year) {
        largeExpThisYear += ex.inflate ? ex.amount * cumInfl : ex.amount;
      }
    });

    // Recurring expenses (monthly or annual line items on top of baseline)
    let recurringExpThisYear = 0;
    (state.expenses.recurring || []).forEach(ex => {
      const inRange = year >= (ex.startYear || startYear) &&
                      year <= (ex.endYear   || endYear);
      if (!inRange) return;
      const annual = (ex.period === "monthly" ? ex.amount * 12 : ex.amount);
      recurringExpThisYear += (ex.inflate ? annual * cumInfl : annual) * frac;
    });

    const totalExpenses = baseExp + largeExpThisYear + recurringExpThisYear + mortgagePayments;

    // --- Account growth + contributions ---
    const returnDelta = noiseReturn(yearsOut);
    let pretaxContribs = 0;
    let dividendIncome = 0;  // qualified dividends from taxable accounts
    // Once both spouses are retired, dividends are paid out as cash (added to income)
    // rather than reinvested. Pre-retirement they continue to reinvest.
    const bothRetired = year >= (s.hasSpouse2 ? Math.max(s.s1.retireYear, s.s2.retireYear) : s.s1.retireYear);
    accounts.forEach(a => {
      // Dividends are paid from PRE-growth balance (more realistic mid-year)
      if (a.type === "taxable" && a.dividendYield > 0) {
        const div = a.balance * (a.dividendYield / 100) * frac;
        dividendIncome += div;
        if (!bothRetired) {
          // Reinvested: balance grows, basis tracks the new shares.
          a.balance += div;
          a.basis += div;
        }
        // bothRetired: dividends leave the account as cash (still taxed as qualified divs).
      }
      // All accounts use the effective return rate for this projection run.
      a.balance *= 1 + (effReturn + returnDelta) / 100 * frac;
      const ownerWorking =
        (a.owner === "Spouse 1" && year < s.s1.retireYear) ||
        (s.hasSpouse2 && a.owner === "Spouse 2" && year < s.s2.retireYear) ||
        (a.owner === "Joint" && (year < s.s1.retireYear || (s.hasSpouse2 && year < s.s2.retireYear)));
      if (ownerWorking && a.contribution > 0) {
        a.balance += a.contribution * frac;
        if (a.type === "taxable") a.basis += a.contribution * frac;
        if (a.type === "ira" || a.type === "sep_ira" || a.type === "401k") pretaxContribs += a.contribution * frac;
      }
    });

    // --- Apply property sale proceeds (gross) to taxable ---
    if (saleProceeds > 0) {
      let taxable = accounts.find(a => a.type === "taxable");
      if (!taxable) {
        taxable = { id: uid(), name: "Auto Taxable", type: "taxable", owner: "Joint",
          balance: 0, basis: 0, contribution: 0 };
        accounts.push(taxable);
      }
      taxable.balance += saleProceeds;
      // basis bumped by full proceeds; gain is already counted separately in saleGain
      taxable.basis += saleProceeds;
    }

    // --- Bracket-Fill: Inherited IRA distribution + Roth Conversion ---
    let rothConverted = 0;
    let inheritedDrained = 0;
    const rc = s.rothConv || {};
    const ii = s.inheritedIra || {};

    // (1a) Traditional IRA / 401(k) RMD — required from age 73, deposited to taxable.
    const traditionalRMD = distributeTraditionalRMD(accounts, s1Age, s2Age, yearsOut === 0);

    // Compute the bracket-fill target up front so we can use it to cap the inherited
    // mandatory distribution as well as the Roth conversion calc below.
    const rcEarly = s.rothConv || {};
    const iiEarly = s.inheritedIra || {};
    let bracketFillTarget = null;
    if      (rcEarly.strategy === "fill_12") bracketFillTarget = 94300  * cumInfl;
    else if (rcEarly.strategy === "fill_22") bracketFillTarget = 201050 * cumInfl;
    else if (rcEarly.strategy === "fill_24") bracketFillTarget = 383900 * cumInfl;
    else if (rcEarly.strategy === "fill_32") bracketFillTarget = 487450 * cumInfl;

    // (1b) Mandatory inherited IRA distribution.
    // If the original owner was past their Required Beginning Date (RBD) — i.e. they had
    // already started taking RMDs (age 73+) — the SECURE Act requires the beneficiary to
    // continue annual RMDs every year AND fully empty the account by year 10.
    // capAtBracketFill is an opt-in modeling shortcut: skip the annual RMD obligation
    // (treating it like a pre-RBD inheritance) so distributions can stay inside the chosen
    // bracket. Off by default.
    let inheritedRMD = 0;
    let inheritedBracketDrain = 0;
    let mandatoryInherited = inheritedMandatoryDistribution(accounts, year, yearsOut === 0);
    if (iiEarly.capAtBracketFill === true && bracketFillTarget != null) {
      const baseOrdNoDrain = (salary1 + salary2 - pretaxContribs) + rentalTaxable + traditionalRMD;
      const ssTNoDrain     = ssTaxablePortion(grossSS, baseOrdNoDrain);
      const baseTaxNoDrain = Math.max(0, baseOrdNoDrain + ssTNoDrain - stdDed);
      const headroom = Math.max(0, bracketFillTarget - baseTaxNoDrain);
      mandatoryInherited = Math.min(mandatoryInherited, headroom);
    }
    if (mandatoryInherited > 0) {
      inheritedRMD = drainInheritedToTaxable(accounts, mandatoryInherited);
      inheritedDrained = inheritedRMD;
    }

    // (2) Bracket-fill window (Roth conv strategy active) → split headroom between
    //     extra inherited drain and Roth conversions per `inheritedIra.strategy`.
    const inFillWindow = rc.strategy && rc.strategy !== "none"
      && year >= (rc.startYear || s.s1.retireYear)
      && year <= (rc.endYear   || (s.s1.retireYear + 7));
    if (inFillWindow) {
      const baseOrdinary = (salary1 + salary2 - pretaxContribs) + rentalTaxable + inheritedDrained;
      const ssT = ssTaxablePortion(grossSS, baseOrdinary);
      const baseTaxable = Math.max(0, baseOrdinary + ssT - stdDed);

      let target = null;
      if (rc.strategy === "fill_12") target = 94300  * cumInfl;
      else if (rc.strategy === "fill_22") target = 201050 * cumInfl;
      else if (rc.strategy === "fill_24") target = 383900 * cumInfl;
      else if (rc.strategy === "fill_32") target = 487450 * cumInfl;

      let headroom = 0;
      if (rc.strategy === "custom") headroom = rc.customAmount || 0;
      else if (target != null)     headroom = Math.max(0, target - baseTaxable);

      if (headroom > 0) {
        const inhBalance = accounts
          .filter(a => a.type === "inherited_ira")
          .reduce((sum, a) => sum + a.balance, 0);

        // Optional gate: don't start Roth conversions until the inherited IRA is depleted.
        // (Mandatory inherited RMD has already been taken above, so inhBalance here is
        // the post-RMD balance entering the bracket-fill window.)
        const suppressRoth = !!rc.startAfterInheritedDepleted && inhBalance > 0;

        let extraInherited = 0, rothAmt = 0;
        switch (ii.strategy) {
          case "rmd_only":     extraInherited = 0;                                   rothAmt = headroom; break;
          case "fill_first":   extraInherited = Math.min(headroom, inhBalance);      rothAmt = headroom - extraInherited; break;
          case "split_50_50":  extraInherited = Math.min(headroom / 2, inhBalance);  rothAmt = headroom - extraInherited; break;
          case "custom": {
            const inhPct = (ii.splitPct ?? 50) / 100;
            extraInherited = Math.min(headroom * inhPct, inhBalance);
            rothAmt = headroom * (1 - inhPct);
            break;
          }
          default:             extraInherited = Math.min(headroom, inhBalance);      rothAmt = headroom - extraInherited;
        }

        if (extraInherited > 0) {
          const actuallyDrained = drainInheritedToTaxable(accounts, extraInherited);
          inheritedBracketDrain += actuallyDrained;
          inheritedDrained += actuallyDrained;
        }
        if (!suppressRoth && rothAmt > 0) {
          rothConverted = performRothConversion(accounts, rothAmt);
        }
      }
    }

    // --- Withdrawal & Tax Pass ---
    const grossSalaries = salary1 + salary2;
    // Pre-retirement: dividends are reinvested → not cash. Post-retirement: dividends
    // are paid out → counted as cash that helps cover expenses.
    const dividendCash = bothRetired ? dividendIncome : 0;
    const nonWithdrawIncome = grossSalaries + grossSS + rentalNet + dividendCash;
    const cashGap = totalExpenses - nonWithdrawIncome;

    let wSpend = { byType: {}, gainsRealized: 0, unmet: 0 };
    if (cashGap > 0) {
      // Bracket-aware first pass: cap ordinary-income withdrawals at remaining bracket
      // headroom (target − ordinary income already locked in this year from RMDs / drains /
      // conversions). Then fill the rest from non-ordinary buckets. If still short, a
      // second uncapped pass takes the remainder from ordinary accounts.
      let maxOrdinary = null;
      if (s.bracketAwareWithdrawals !== false && bracketFillTarget != null) {
        const lockedOrdinary = (grossSalaries - pretaxContribs) + rentalTaxable + traditionalRMD + inheritedDrained + rothConverted;
        const ssTLocked = ssTaxablePortion(grossSS, lockedOrdinary);
        const lockedTaxable = Math.max(0, lockedOrdinary + ssTLocked - stdDed);
        maxOrdinary = Math.max(0, bracketFillTarget - lockedTaxable);
      }
      wSpend = withdrawFromAccounts(accounts, cashGap, s.withdrawalOrder, s.taxableCapGainsPct, maxOrdinary);
      // Fallback: if accounts other than ordinary types couldn't cover the remainder,
      // dip into ordinary types without the bracket cap (busting the bracket is better
      // than running out of cash).
      if (wSpend.unmet > 0 && maxOrdinary != null) {
        const second = withdrawFromAccounts(accounts, wSpend.unmet, s.withdrawalOrder, s.taxableCapGainsPct);
        // Merge byType totals
        Object.entries(second.byType).forEach(([k, v]) => {
          wSpend.byType[k] = (wSpend.byType[k] || 0) + v;
        });
        wSpend.gainsRealized += second.gainsRealized;
        wSpend.unmet = second.unmet;
      }
    }

    // Compute tax based on this year's actual ordinary + capital gains
    const ordWithdraw = (wSpend.byType["ira"] || 0)
                     + (wSpend.byType["sep_ira"] || 0)
                     + (wSpend.byType["401k"] || 0)
                     + (wSpend.byType["inherited_ira"] || 0);

    const ordinaryIncomePreSS = (grossSalaries - pretaxContribs) + rentalTaxable + ordWithdraw + rothConverted + inheritedDrained + traditionalRMD;
    const ssTaxable = ssTaxablePortion(grossSS, ordinaryIncomePreSS);
    const totalOrdinary = ordinaryIncomePreSS + ssTaxable;
    const taxableOrdinary = Math.max(0, totalOrdinary - stdDed);

    // LTCG taxable = realized gains + qualified dividends + property sale gain
    const totalGains = wSpend.gainsRealized + saleGain + dividendIncome;

    let ordinaryTax = 0, ltcgTax = 0;
    let ordTaxByBracket = [];   // tax paid per ordinary bracket (parallel to taxBrackets)
    let ltcgTaxByBracket = [];  // tax paid per LTCG bracket
    if (s.useTaxBrackets !== false) {
      ordTaxByBracket = bracketTaxByLine(taxableOrdinary, taxBrackets);
      ltcgTaxByBracket = ltcgTaxByLine(taxableOrdinary, totalGains, ltcgBrackets);
      ordinaryTax = ordTaxByBracket.reduce((a, b) => a + b, 0);
      ltcgTax     = ltcgTaxByBracket.reduce((a, b) => a + b, 0);
    } else {
      ordinaryTax = taxableOrdinary * ((s.taxRate || 0) / 100);
      ltcgTax = totalGains * ((s.cgRate || 0) / 100);
      ordTaxByBracket  = [ordinaryTax];
      ltcgTaxByBracket = [ltcgTax];
    }
    const totalTax = ordinaryTax + ltcgTax;

    // Withdraw additional for taxes (retirement scenario) or pay from salary (working)
    let wTax = { byType: {}, gainsRealized: 0, unmet: 0 };
    if (cashGap > 0 || saleGain > 0 || rothConverted > 0) {
      wTax = withdrawFromAccounts(accounts, totalTax, s.withdrawalOrder, s.taxableCapGainsPct);
    }

    // Working surplus → deposit to taxable (after-tax)
    let surplusDeposited = 0;
    if (cashGap < 0) {
      const surplus = (-cashGap) - totalTax;
      if (surplus > 0) {
        let taxable = accounts.find(a => a.type === "taxable");
        if (!taxable) {
          taxable = { id: uid(), name: "Auto Taxable", type: "taxable", owner: "Joint",
            balance: 0, basis: 0, contribution: 0 };
          accounts.push(taxable);
        }
        taxable.balance += surplus;
        taxable.basis += surplus;
        surplusDeposited = surplus;
      }
    }

    // Merge withdrawal totals
    const withdrawnByType = {};
    Object.entries(wSpend.byType).forEach(([k, v]) => withdrawnByType[k] = (withdrawnByType[k] || 0) + v);
    Object.entries(wTax.byType).forEach(([k, v])  => withdrawnByType[k] = (withdrawnByType[k] || 0) + v);
    const totalWithdrawn = Object.values(withdrawnByType).reduce((a, b) => a + b, 0);

    // Marginal rate at end of year (informational)
    const margRate = marginalRate(taxableOrdinary, taxBrackets);

    // --- Snapshot ---
    const liquidAssets = accounts.reduce((sum, a) => sum + Math.max(0, a.balance), 0);
    const reEquity = properties.reduce((sum, p) => sum + Math.max(0, p.value - p.loanBalance), 0);
    const rentalEquity = properties.filter(p => p.isRental).reduce((sum, p) => sum + Math.max(0, p.value - p.loanBalance), 0);

    // Aggregate balances by account type (401k + IRA combined as "traditional")
    const sumType = (...types) => accounts
      .filter(a => types.includes(a.type))
      .reduce((sum, a) => sum + Math.max(0, a.balance), 0);
    const balancesByType = {
      taxable:       sumType("taxable"),
      traditional:   sumType("ira", "401k"),
      roth:          sumType("roth"),
      inherited_ira: sumType("inherited_ira"),
      hsa:           sumType("hsa"),
    };

    rows.push({
      year, s1Age, s2Age,
      retired: year >= (s.hasSpouse2 ? Math.max(s.s1.retireYear, s.s2.retireYear) : s.s1.retireYear),
      partiallyRetired: year >= (s.hasSpouse2 ? Math.min(s.s1.retireYear, s.s2.retireYear) : s.s1.retireYear),
      salary1, salary2, grossSS, ssTaxable, rentalGross, rentalNet, rentalTaxable,
      dividendIncome,
      income: nonWithdrawIncome,
      expenses: totalExpenses,
      expBaseline:  baseExp,
      expRecurring: recurringExpThisYear,
      expLarge:     largeExpThisYear,
      expMortgage:  mortgagePayments,
      mortgagePrimary: mortgagePayments,
      mortgageRental:  rentalMortgagePayments,
      net: nonWithdrawIncome - totalExpenses - totalTax,
      withdrawnByType, totalWithdrawn,
      taxableGapWD: wSpend.byType["taxable"] || 0,
      taxableTaxWD: wTax.byType["taxable"] || 0,
      surplusDeposited,
      ordinaryTax, ltcgTax, totalTax,
      ordTaxByBracket, ltcgTaxByBracket,
      taxableOrdinary, totalOrdinary, marginalRate: margRate,
      gainsRealized: wSpend.gainsRealized + saleGain + dividendIncome,
      rothConverted,
      inheritedDrained,
      inheritedRMD,
      inheritedBracketDrain,
      traditionalRMD,
      liquid: liquidAssets,
      rentalEquity,
      reEquity,
      netWorth: liquidAssets + reEquity,
      saleProceeds,
      balancesByType,
    });
  }
  return rows;
}

function renderCurrentPortfolio() {
  const container = document.getElementById("current-portfolio-cards");
  if (!container) return;
  const sumOf = (...types) => state.accounts
    .filter(a => types.includes(a.type))
    .reduce((sum, a) => sum + (a.balance || 0), 0);
  const propEquity = (predicate) => state.properties
    .filter(predicate)
    .reduce((s, p) => s + Math.max(0, (p.value || 0) - (p.loanBalance || 0)), 0);

  const groups = [
    { label: "Taxable Brokerage",       total: sumOf("taxable") },
    { label: "Traditional IRA / 401k",  total: sumOf("ira", "401k") },
    { label: "Roth IRA",                total: sumOf("roth") },
    { label: "Inherited IRA",           total: sumOf("inherited_ira") },
    { label: "HSA",                     total: sumOf("hsa") },
    { label: "Primary Residence Equity", total: propEquity(p => !p.isRental) },
    { label: "Rental Real Estate Equity", total: propEquity(p => p.isRental) },
  ];
  const grand = groups.reduce((s, g) => s + g.total, 0);

  container.innerHTML = groups
    .filter(g => g.total !== 0)
    .map(g => `
      <div class="card">
        <div class="card-label">${g.label}</div>
        <div class="card-value">${fmt(g.total)}</div>
      </div>
    `).join("") + `
    <div class="card" style="background:#1f3a5f;color:#fff;">
      <div class="card-label" style="color:#cbd5e1;">Total Net Worth</div>
      <div class="card-value" style="color:#fff;">${fmt(grand)}</div>
    </div>
  `;

  // Update the SWR hint under the monthly-expense input
  const hint = document.getElementById("exp-base-swr-hint");
  if (hint) {
    const monthly = (pct) => fmt(grand * (pct / 100) / 12);
    hint.innerHTML =
      `Safe-withdrawal hint on current net worth ${fmt(grand)}: ` +
      `<strong>${monthly(3)}</strong>/mo @ 3% &nbsp;·&nbsp; ` +
      `<strong>${monthly(3.5)}</strong>/mo @ 3.5% &nbsp;·&nbsp; ` +
      `<strong>${monthly(4)}</strong>/mo @ 4%`;
  }
}

// ===== Render Summary =====
let assetChart, liquidBreakdownChart, incomeBreakdownChart, rothConversionChart, gapWithdrawalChart, expenseBreakdownChart, taxableBrokerageFlowChart;
let taxByBracketChart;
let expenseByYearChart, expenseInflationChart, realEstateEquityChart, rentalIncomeChart, accountBalancesChart;

function drawAccountBalances(rows) {
  if (accountBalancesChart) accountBalancesChart.destroy();
  const labels = rows.map(r => [String(r.year), `${r.s1Age}/${r.s2Age}`]);
  const pick = (t) => rows.map(r => (r.balancesByType && r.balancesByType[t]) || 0);
  accountBalancesChart = new Chart(
    document.getElementById("accountBalancesChart").getContext("2d"),
    {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Taxable Brokerage",      data: pick("taxable"),       borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.0)",  borderWidth: 2, tension: 0.2, pointRadius: 0 },
          { label: "Traditional IRA / 401k", data: pick("traditional"),   borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.0)",   borderWidth: 2, tension: 0.2, pointRadius: 0 },
          { label: "Roth IRA",               data: pick("roth"),          borderColor: "#15803d", backgroundColor: "rgba(21,128,61,0.0)",   borderWidth: 2, tension: 0.2, pointRadius: 0 },
          { label: "Inherited IRA",          data: pick("inherited_ira"), borderColor: "#b45309", backgroundColor: "rgba(180,83,9,0.0)",    borderWidth: 2, tension: 0.2, pointRadius: 0 },
          { label: "HSA",                    data: pick("hsa"),           borderColor: "#ec4899", backgroundColor: "rgba(236,72,153,0.0)",  borderWidth: 2, tension: 0.2, pointRadius: 0 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Account Balances by Type Over Time" },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.y)}` } },
        },
        scales: { y: { ticks: { callback: v => fmt(v) } } },
      },
    }
  );
}

function drawTaxByBracket(rows) {
  if (taxByBracketChart) taxByBracketChart.destroy();
  const labels = rows.map(r => [String(r.year), `${r.s1Age}/${r.s2Age}`]);
  const ordBrackets  = state.settings.taxBrackets  || [];
  const ltcgBrackets = state.settings.ltcgBrackets || [];

  // Color palette — progressively deeper red for ordinary brackets,
  // green→amber for the (typically lower) LTCG brackets.
  const ordColors = ["#fee2e2","#fecaca","#fca5a5","#f87171","#ef4444","#dc2626","#991b1b","#7f1d1d"];
  const ltcgColors = ["#bbf7d0","#fcd34d","#f59e0b"];

  const datasets = [];
  ordBrackets.forEach((b, i) => {
    datasets.push({
      label: `Ordinary ${b.rate}%`,
      data: rows.map(r => (r.ordTaxByBracket && r.ordTaxByBracket[i]) || 0),
      backgroundColor: ordColors[i] || "#7f1d1d",
      stack: "tax",
    });
  });
  ltcgBrackets.forEach((b, i) => {
    datasets.push({
      label: `LTCG ${b.rate}%`,
      data: rows.map(r => (r.ltcgTaxByBracket && r.ltcgTaxByBracket[i]) || 0),
      backgroundColor: ltcgColors[i] || "#92400e",
      stack: "tax",
    });
  });

  taxByBracketChart = new Chart(
    document.getElementById("taxByBracketChart").getContext("2d"),
    {
      type: "bar",
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Annual Federal Tax by Bracket (stacked)" },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.y)}` } },
        },
        scales: {
          x: { stacked: true },
          y: { stacked: true, ticks: { callback: v => fmt(v) } },
        },
      },
    }
  );
}

function drawRealEstateEquityChart(rows) {
  if (realEstateEquityChart) realEstateEquityChart.destroy();
  const labels = rows.map(r => [String(r.year), `${r.s1Age}/${r.s2Age}`]);
  realEstateEquityChart = new Chart(
    document.getElementById("realEstateEquityChart").getContext("2d"),
    {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Real Estate Equity",
          data: rows.map(r => r.reEquity || 0),
          borderColor: "#10b981",
          backgroundColor: "rgba(16,185,129,0.20)",
          fill: true,
          tension: 0.2,
          pointRadius: 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Real Estate Equity" },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.y)}` } },
        },
        scales: { y: { ticks: { callback: v => fmt(v) } } },
      },
    }
  );
}

function drawRentalIncomeChart(rows) {
  if (rentalIncomeChart) rentalIncomeChart.destroy();
  const labels = rows.map(r => [String(r.year), `${r.s1Age}/${r.s2Age}`]);
  rentalIncomeChart = new Chart(
    document.getElementById("rentalIncomeChart").getContext("2d"),
    {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Total Rent Collected",
            data: rows.map(r => r.rentalGross || 0),
            backgroundColor: "rgba(29,78,216,0.35)",
          },
          {
            label: "Net Taxable Rent (flows to income)",
            data: rows.map(r => r.rentalNet || 0),
            backgroundColor: "#1d4ed8",
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Rental Income — Gross vs Net Taxable" },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.y)}` } },
        },
        scales: { y: { ticks: { callback: v => fmt(v) } } },
      },
    }
  );
}

function renderRealEstateTable(rows) {
  const tbody = document.querySelector("#real-estate-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  rows.forEach(r => {
    const tr = document.createElement("tr");
    if (r.retired) tr.className = "retired";
    tr.innerHTML = `
      <td>${r.year}</td>
      <td>${r.s1Age}/${r.s2Age}</td>
      <td>${fmt(r.reEquity || 0)}</td>
      <td>${fmt(r.rentalGross || 0)}</td>
      <td>${fmt(r.rentalNet || 0)}</td>
      <td>${fmt(r.mortgagePrimary || 0)}</td>
      <td>${fmt(r.mortgageRental || 0)}</td>
      <td>${fmt(r.saleProceeds || 0)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function drawExpensesByYear(rows) {
  if (expenseByYearChart) expenseByYearChart.destroy();
  const labels = rows.map(r => [String(r.year), `${r.s1Age}/${r.s2Age}`]);
  expenseByYearChart = new Chart(
    document.getElementById("expenseByYearChart").getContext("2d"),
    {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Baseline",  data: rows.map(r => r.expBaseline  || 0), backgroundColor: "#3b82f6" },
          { label: "Recurring", data: rows.map(r => r.expRecurring || 0), backgroundColor: "#10b981" },
          { label: "Large",     data: rows.map(r => r.expLarge     || 0), backgroundColor: "#f59e0b" },
          { label: "Mortgage",  data: rows.map(r => r.expMortgage  || 0), backgroundColor: "#a78bfa" },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Forecasted Expenses by Year (stacked, mid inflation)" },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.y)}` } },
        },
        scales: {
          x: { stacked: true },
          y: { stacked: true, ticks: { callback: v => fmt(v) } },
        },
      },
    }
  );
}

function drawExpenseInflationChart(rows, lowRows, highRows) {
  if (expenseInflationChart) expenseInflationChart.destroy();
  const s = state.settings;
  const lowInfl  = s.defaultInflationLow  ?? 2;
  const midInfl  = ((s.defaultInflationLow ?? 2) + (s.defaultInflationHigh ?? 4)) / 2;
  const highInfl = s.defaultInflationHigh ?? 4;
  const labels = rows.map(r => [String(r.year), `${r.s1Age}/${r.s2Age}`]);
  expenseInflationChart = new Chart(
    document.getElementById("expenseInflationChart").getContext("2d"),
    {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: `Low inflation (${lowInfl}%)`,
            data: (lowRows || rows).map(r => r.expenses || 0),
            borderColor: "#15803d",
            backgroundColor: "rgba(21,128,61,0.12)",
            borderWidth: 2,
            fill: false,
            tension: 0.2,
            pointRadius: 0,
          },
          {
            label: `Mid inflation (${midInfl.toFixed(1)}%)`,
            data: rows.map(r => r.expenses || 0),
            borderColor: "#2563eb",
            backgroundColor: "transparent",
            borderWidth: 2,
            borderDash: [5, 4],
            fill: false,
            tension: 0.2,
            pointRadius: 0,
          },
          {
            label: `High inflation (${highInfl}%)`,
            data: (highRows || rows).map(r => r.expenses || 0),
            borderColor: "#b91c1c",
            backgroundColor: "rgba(185,28,28,0.12)",
            borderWidth: 2,
            fill: false,
            tension: 0.2,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Total Expense Range: Low vs Mid vs High Inflation" },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.y)}` } },
        },
        scales: {
          y: { ticks: { callback: v => fmt(v) } },
        },
      },
    }
  );
}

function renderExpenseByYearTable(rows) {
  const tbody = document.querySelector("#expense-by-year-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  rows.forEach(r => {
    const tr = document.createElement("tr");
    if (r.retired) tr.className = "retired";
    tr.innerHTML = `
      <td>${r.year}</td>
      <td>${r.s1Age}/${r.s2Age}</td>
      <td>${fmt(r.expBaseline || 0)}</td>
      <td>${fmt(r.expRecurring || 0)}</td>
      <td>${fmt(r.expLarge || 0)}</td>
      <td>${fmt(r.expMortgage || 0)}</td>
      <td><strong>${fmt(r.expenses)}</strong></td>
    `;
    tbody.appendChild(tr);
  });
}
function recalc() {
  renderCurrentPortfolio();
  const rows = project();
  const tbody = document.querySelector("#projection-table tbody");
  tbody.innerHTML = "";
  let cumBrokerageFlow = 0;
  rows.forEach(r => {
    const tr = document.createElement("tr");
    if (r.retired) tr.className = "retired";
    const inflows = (r.salary1 || 0) + (r.salary2 || 0)
      + (r.grossSS || 0) + (r.rentalNet || 0) + (r.dividendIncome || 0)
      + (r.saleProceeds || 0) + (r.traditionalRMD || 0)
      + (r.inheritedRMD || 0) + (r.inheritedBracketDrain || 0);
    const outflows = (r.expenses || 0) + (r.ordinaryTax || 0) + (r.ltcgTax || 0);
    const brokerageNetFlow = inflows - outflows;
    cumBrokerageFlow += brokerageNetFlow;
    const taxableBal = (r.balancesByType && r.balancesByType.taxable) || 0;
    const brokerageNetPct = taxableBal > 0 ? (brokerageNetFlow / taxableBal * 100).toFixed(1) + "%" : "—";
    const flowClass = brokerageNetFlow < 0 ? "negative" : "";
    const cumClass  = cumBrokerageFlow  < 0 ? "negative" : "";
    tr.innerHTML = `
      <td>${r.year}</td>
      <td>${r.s1Age}/${r.s2Age}</td>
      <td>${fmt(r.income)}</td>
      <td>${fmt(r.expenses)}</td>
      <td class="${r.net<0?'negative':''}">${fmt(r.net)}</td>
      <td class="${flowClass}">${fmt(brokerageNetFlow)}</td>
      <td class="${flowClass}">${brokerageNetPct}</td>
      <td class="${cumClass}"><strong>${fmt(cumBrokerageFlow)}</strong></td>
      <td>${fmt(r.liquid)}</td>
      <td>${fmt(r.reEquity)}</td>
      <td>${fmt(r.netWorth)}</td>
    `;
    tbody.appendChild(tr);
  });

  // Cards
  const currentTotal = rows[0]?.netWorth || 0;
  const peakLiquid = Math.max(...rows.map(r => r.liquid));
  const endAssets = rows[rows.length - 1]?.netWorth || 0;
  const retiredRows = rows.filter(r => r.retired);
  const avgBurn = retiredRows.length
    ? retiredRows.reduce((s, r) => s + r.expenses, 0) / retiredRows.length
    : 0;
  const bust = rows.find(r => r.liquid <= 0 && r.retired);

document.getElementById("sum-peak").textContent = fmt(peakLiquid);
  document.getElementById("sum-end").textContent = fmt(endAssets);
  document.getElementById("sum-burn").textContent = fmt(avgBurn) + "/yr";
  document.getElementById("sum-bust").textContent = bust ? bust.year : "Never";

  // Run pessimistic + optimistic projections for the Summary band
  const s = state.settings;
  const lowRows  = project({ returnPct: s.defaultReturnLow,  inflationPct: s.defaultInflationHigh });
  const highRows = project({ returnPct: s.defaultReturnHigh, inflationPct: s.defaultInflationLow });

  const endLowEl  = document.getElementById("sum-end-low");
  const endHighEl = document.getElementById("sum-end-high");
  if (endLowEl)  endLowEl.textContent  = fmt(lowRows[lowRows.length - 1]?.netWorth || 0);
  if (endHighEl) endHighEl.textContent = fmt(highRows[highRows.length - 1]?.netWorth || 0);

  drawCharts(rows, lowRows, highRows);
  drawIncomeBreakdown(rows);
  drawRothConversions(rows);
  drawGapWithdrawalBreakdown(rows);
  drawExpenseBreakdown(rows);
  drawTaxByBracket(rows);
  const expLowRows  = project({ inflationPct: state.settings.defaultInflationLow });
  const expHighRows = project({ inflationPct: state.settings.defaultInflationHigh });
  drawExpensesByYear(rows);
  drawExpenseInflationChart(rows, expLowRows, expHighRows);
  renderExpenseByYearTable(rows);
  drawAccountBalances(rows);
  drawRealEstateEquityChart(rows);
  drawRentalIncomeChart(rows);
  renderRealEstateTable(rows);
  renderWithdrawalRows(rows);
  drawWithdrawalCharts(rows);
  renderRothRecommendation(rows);
  renderTaxStrategyComparison();
  renderGuardrails(rows);
}

function drawCharts(rows, lowRows, highRows) {
  const labels = rows.map(r => r.year);
  if (assetChart) assetChart.destroy();
  if (liquidBreakdownChart) liquidBreakdownChart.destroy();

  const ctx1 = document.getElementById("assetChart").getContext("2d");
  assetChart = new Chart(ctx1, {
    type: "line",
    data: {
      labels,
      datasets: [
        // Band: high-net-worth fills down to low-net-worth
        {
          label: "Optimistic Net Worth",
          data: (highRows || rows).map(r => r.netWorth),
          borderColor: "rgba(16,185,129,0.6)",
          backgroundColor: "rgba(16,185,129,0.12)",
          borderWidth: 1,
          borderDash: [4, 4],
          fill: "+1",   // fill toward next dataset (Pessimistic)
          tension: 0.2,
          pointRadius: 0,
        },
        {
          label: "Pessimistic Net Worth",
          data: (lowRows || rows).map(r => r.netWorth),
          borderColor: "rgba(239,68,68,0.6)",
          backgroundColor: "rgba(0,0,0,0)",
          borderWidth: 1,
          borderDash: [4, 4],
          fill: false,
          tension: 0.2,
          pointRadius: 0,
        },
        {
          label: "Liquid Assets (mid)",
          data: rows.map(r => r.liquid),
          borderColor: "#2563eb",
          backgroundColor: "rgba(37,99,235,0.15)",
          fill: true,
          tension: 0.2,
        },
        {
          label: "Real Estate Equity",
          data: rows.map(r => r.reEquity),
          borderColor: "#10b981",
          backgroundColor: "rgba(16,185,129,0.15)",
          fill: true,
          tension: 0.2,
        },
        {
          label: "Total Net Worth (mid)",
          data: rows.map(r => r.netWorth),
          borderColor: "#1f3a5f",
          backgroundColor: "rgba(31,58,95,0.0)",
          borderWidth: 3,
          fill: false,
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: "Asset Trajectory Through Retirement" },
        tooltip: {
          callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.y)}` }
        },
      },
      scales: {
        y: { ticks: { callback: v => fmt(v) } }
      }
    }
  });

  const ctx1b = document.getElementById("liquidBreakdownChart").getContext("2d");
  const pick = t => rows.map(r => (r.balancesByType && r.balancesByType[t]) || 0);
  liquidBreakdownChart = new Chart(ctx1b, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Taxable Brokerage", data: pick("taxable"),      borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.15)",  fill: true, tension: 0.2, pointRadius: 0 },
        { label: "Traditional IRA / 401k", data: pick("traditional"), borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.15)",   fill: true, tension: 0.2, pointRadius: 0 },
        { label: "Roth",              data: pick("roth"),          borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.15)",  fill: true, tension: 0.2, pointRadius: 0 },
        { label: "Inherited IRA",     data: pick("inherited_ira"), borderColor: "#c2410c", backgroundColor: "rgba(194,65,12,0.15)",   fill: true, tension: 0.2, pointRadius: 0 },
        { label: "HSA",               data: pick("hsa"),           borderColor: "#7c3aed", backgroundColor: "rgba(124,58,237,0.15)", fill: true, tension: 0.2, pointRadius: 0 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: "Liquid Assets by Account Type" },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.y)}` } },
      },
      scales: {
        y: { ticks: { callback: v => fmt(v) } },
      },
    },
  });
}

function drawIncomeBreakdown(rows) {
  if (incomeBreakdownChart) incomeBreakdownChart.destroy();
  const labels = rows.map(r => [String(r.year), `${r.s1Age}/${r.s2Age}`]);
  incomeBreakdownChart = new Chart(
    document.getElementById("incomeBreakdownChart").getContext("2d"),
    {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Salaries",                     data: rows.map(r => (r.salary1 || 0) + (r.salary2 || 0)), backgroundColor: "#1d4ed8" },
          { label: "Social Security",              data: rows.map(r => r.grossSS || 0),              backgroundColor: "#0ea5e9" },
          { label: "Rental Net",                   data: rows.map(r => r.rentalNet || 0),            backgroundColor: "#10b981" },
          { label: "Dividends",                    data: rows.map(r => r.dividendIncome || 0),       backgroundColor: "#a78bfa" },
          { label: "Property Sale Proceeds",       data: rows.map(r => r.saleProceeds || 0),         backgroundColor: "#84cc16" },
          { label: "Traditional IRA / 401k RMD",  data: rows.map(r => r.traditionalRMD || 0),       backgroundColor: "#dc2626" },
          { label: "Inherited IRA RMD",            data: rows.map(r => r.inheritedRMD || 0),         backgroundColor: "#b45309" },
          { label: "Inherited IRA Bracket Fill",   data: rows.map(r => r.inheritedBracketDrain || 0), backgroundColor: "#c2410c" },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Annual Inflows by Source (stacked)" },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.y)}` } },
        },
        scales: {
          x: { stacked: true },
          y: { stacked: true, ticks: { callback: v => fmt(v) } },
        },
      },
    }
  );
}

function drawRothConversions(rows) {
  if (rothConversionChart) rothConversionChart.destroy();
  const labels = rows.map(r => [String(r.year), `${r.s1Age}/${r.s2Age}`]);
  rothConversionChart = new Chart(
    document.getElementById("rothConversionChart").getContext("2d"),
    {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Roth Conversion", data: rows.map(r => r.rothConverted || 0), backgroundColor: "#7c3aed" },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Annual Roth Conversions (not cash inflow — moves pretax → Roth; tax included in outflows)" },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.y)}` } },
        },
        scales: {
          x: { stacked: true },
          y: { stacked: true, ticks: { callback: v => fmt(v) } },
        },
      },
    }
  );
}

function drawGapWithdrawalBreakdown(rows) {
  if (expenseBreakdownChart) expenseBreakdownChart.destroy();
  const labels = rows.map(r => [String(r.year), `${r.s1Age}/${r.s2Age}`]);
  expenseBreakdownChart = new Chart(
    document.getElementById("expenseBreakdownChart").getContext("2d"),
    {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Living Expenses",       data: rows.map(r => r.expenses),    backgroundColor: "#3b82f6" },
          { label: "Federal Ordinary Tax",  data: rows.map(r => r.ordinaryTax), backgroundColor: "#ef4444" },
          { label: "Federal LTCG / Div Tax",data: rows.map(r => r.ltcgTax),     backgroundColor: "#f97316" },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Annual Outflows: Living Expenses & Taxes (stacked)" },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.y)}` } },
        },
        scales: {
          x: { stacked: true },
          y: { stacked: true, ticks: { callback: v => fmt(v) } },
        },
      },
    }
  );
}

function drawExpenseBreakdown(rows) {
  if (gapWithdrawalChart) gapWithdrawalChart.destroy();
  if (taxableBrokerageFlowChart) taxableBrokerageFlowChart.destroy();
  const labels = rows.map(r => [String(r.year), `${r.s1Age}/${r.s2Age}`]);
  // Net flow to/from taxable brokerage each year.
  // Positive = surplus deposited (inflows beat outflows that year).
  // Negative = deficit drawn (outflows exceed inflows, brokerage fills the gap).
  const netFlow = rows.map(r => {
    const inflows = (r.salary1 || 0) + (r.salary2 || 0)
      + (r.grossSS || 0)
      + (r.rentalNet || 0)
      + (r.dividendIncome || 0)
      + (r.saleProceeds || 0)
      + (r.traditionalRMD || 0)
      + (r.inheritedRMD || 0)
      + (r.inheritedBracketDrain || 0);
    const outflows = (r.expenses || 0) + (r.ordinaryTax || 0) + (r.ltcgTax || 0);
    return inflows - outflows;
  });
  taxableBrokerageFlowChart = new Chart(
    document.getElementById("gapWithdrawalChart").getContext("2d"),
    {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Taxable Brokerage Net Flow",
            data: netFlow,
            backgroundColor: netFlow.map(v => v >= 0 ? "#10b981" : "#ef4444"),
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Annual Taxable Brokerage Net Flow (green = surplus added, red = gap drawn)" },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.y)}` } },
        },
        scales: {
          x: { stacked: false },
          y: { ticks: { callback: v => fmt(v) } },
        },
      },
    }
  );
}

// ===== Guardrails (SWR) tab =====
let guardrailChart;

function computeGuardrails(rows) {
  const s = state.settings;
  const swr = (s.swr || 3.5) / 100;
  const method = s.swrMethod || "dynamic";
  const includeRE = s.swrIncludeRealEstate || false;

  const effectiveLiquid = r => r.liquid + (includeRE ? (r.rentalEquity || 0) : 0);

  // Find the retirement-start row to anchor static & GK methods
  const olderRetire = s.hasSpouse2 ? Math.max(s.s1.retireYear, s.s2.retireYear) : s.s1.retireYear;
  const retireRow = rows.find(r => r.year >= olderRetire) || rows[0];
  const initialLiquid = retireRow ? effectiveLiquid(retireRow) : 0;
  const initialAllowedNominal = initialLiquid * swr;
  const retireIdx = rows.indexOf(retireRow);

  // Inflation factor relative to retirement year for static method
  const midInflG = ((s.defaultInflationLow || 0) + (s.defaultInflationHigh || 0)) / 2;
  const inflFactor = (1 + (midInflG || 3) / 100);

  // Pre-compute cumulative inflation by year index relative to retirement
  const guardrailRows = rows.map((r, i) => {
    const effLiq = effectiveLiquid(r);
    let allowed;
    if (method === "static") {
      if (i < retireIdx) {
        allowed = effLiq * swr;
      } else {
        const yearsSinceRetire = i - retireIdx;
        allowed = initialAllowedNominal * Math.pow(inflFactor, yearsSinceRetire);
      }
    } else if (method === "guyton_klinger") {
      const dyn = effLiq * swr;
      const currentWR = effLiq > 0 ? r.expenses / effLiq : 0;
      const upper = swr * (1 + (s.swrUpperBand || 20) / 100);
      const lower = swr * (1 - (s.swrLowerBand || 20) / 100);
      const adj = (s.swrAdjust || 10) / 100;
      if (currentWR > upper) {
        allowed = r.expenses * (1 - adj);
      } else if (currentWR < lower && r.retired) {
        allowed = r.expenses * (1 + adj);
      } else {
        allowed = dyn;
      }
    } else {
      allowed = effLiq * swr;
    }
    const headroom = allowed - r.expenses;
    return {
      ...r,
      effLiquid: effLiq,
      swrAllowed: allowed,
      swrHeadroom: headroom,
      swrOver: headroom < 0,
    };
  });

  return { rows: guardrailRows, initialAllowedNominal, initialLiquid, retireRow };
}

function renderGuardrails(rows) {
  const { rows: gRows, initialAllowedNominal, initialLiquid, retireRow } = computeGuardrails(rows);
  const s = state.settings;

  const todayLiquid = gRows[0]?.effLiquid || gRows[0]?.liquid || 0;
  const todayAllowed = todayLiquid * (s.swr || 3.5) / 100;

  // For static, the "at-retirement allowed" is the nominal × swr. For others, show the same.
  document.getElementById("swr-today").textContent = fmt(todayAllowed) + "/yr";
  document.getElementById("swr-at-retire").textContent = fmt(initialAllowedNominal) + "/yr";

  // Raise/cut thresholds based on current year's expenses and SWR
  const adj = (s.swrAdjust || 10) / 100;
  const upperBand = 1 + (s.swrUpperBand || 20) / 100;
  const lowerBand = 1 - (s.swrLowerBand || 20) / 100;
  const currentExpenses = gRows[0]?.expenses || 0;
  // Cut threshold: liquid below which expense/liquid ratio exceeds swr * upperBand
  // expense / liquid > swr * upperBand  =>  liquid < expense / (swr * upperBand)
  const swrRate = (s.swr || 3.5) / 100;
  const cutThreshold = swrRate * upperBand > 0 ? currentExpenses / (swrRate * upperBand) : 0;
  // Raise threshold: liquid above which expense/liquid ratio falls below swr * lowerBand
  const raiseThreshold = swrRate * lowerBand > 0 ? currentExpenses / (swrRate * lowerBand) : 0;
  document.getElementById("swr-cut-threshold").textContent = fmt(cutThreshold);
  document.getElementById("swr-raise-threshold").textContent = fmt(raiseThreshold);
  document.getElementById("swr-adjust-pct-raise").textContent = Math.round(adj * 100);
  document.getElementById("swr-adjust-pct-cut").textContent = Math.round(adj * 100);

  // Count retired years where forecast exceeds guardrail
  const retiredRows = gRows.filter(r => r.retired);
  const overruns = retiredRows.filter(r => r.swrOver).length;
  document.getElementById("swr-overruns").textContent = `${overruns} / ${retiredRows.length}`;

  const statusEl = document.getElementById("swr-status");
  if (overruns === 0) {
    statusEl.textContent = "✓ Within guardrails";
    statusEl.style.color = "#15803d";
  } else if (overruns <= retiredRows.length * 0.25) {
    statusEl.textContent = "⚠ Some overruns";
    statusEl.style.color = "#b45309";
  } else {
    statusEl.textContent = "✗ Over budget";
    statusEl.style.color = "#b91c1c";
  }

  const tbody = document.querySelector("#guardrail-table tbody");
  tbody.innerHTML = "";
  gRows.forEach(r => {
    const tr = document.createElement("tr");
    if (r.swrOver && r.retired) tr.style.background = "#fee2e2";
    const status = r.swrOver
      ? `<span style="color:#b91c1c;">OVER by ${fmt(-r.swrHeadroom)}</span>`
      : `<span style="color:#15803d;">OK</span>`;
    tr.innerHTML = `
      <td>${r.year}</td>
      <td>${r.s1Age}/${r.s2Age}</td>
      <td>${fmt(r.liquid)}</td>
      <td>${fmt(r.swrAllowed)}</td>
      <td>${fmt(r.expenses)}</td>
      <td class="${r.swrHeadroom < 0 ? 'negative' : ''}">${fmt(r.swrHeadroom)}</td>
      <td>${status}</td>
    `;
    tbody.appendChild(tr);
  });

  // Chart
  if (guardrailChart) guardrailChart.destroy();
  const ctx = document.getElementById("guardrailChart").getContext("2d");
  const labels = gRows.map(r => r.year);
  guardrailChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "SWR-Allowed Spend",
          data: gRows.map(r => r.swrAllowed),
          borderColor: "#2563eb",
          backgroundColor: "rgba(37,99,235,0.10)",
          borderWidth: 3,
          fill: true,
          tension: 0.2,
          pointRadius: 0,
        },
        {
          label: "Forecasted Expenses",
          data: gRows.map(r => r.expenses),
          borderColor: "#ef4444",
          backgroundColor: "rgba(239,68,68,0)",
          borderWidth: 2,
          fill: false,
          tension: 0.2,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: `Guardrails @ ${state.settings.swr}% SWR (${state.settings.swrMethod})` },
        tooltip: {
          callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.y)}` }
        },
      },
      scales: { y: { ticks: { callback: v => fmt(v) } } }
    }
  });
}

function renderGuardrailsControls() {
  document.getElementById("swr-rate").value    = state.settings.swr;
  document.getElementById("swr-method").value  = state.settings.swrMethod || "dynamic";
  document.getElementById("swr-upper").value   = state.settings.swrUpperBand;
  document.getElementById("swr-lower").value   = state.settings.swrLowerBand;
  document.getElementById("swr-adjust").value  = state.settings.swrAdjust;
  document.getElementById("swr-include-realestate").checked = state.settings.swrIncludeRealEstate || false;
}

function wireGuardrailsTab() {
  [
    ["swr-rate", "swr", "float"],
    ["swr-method", "swrMethod", "str"],
    ["swr-upper", "swrUpperBand", "float"],
    ["swr-lower", "swrLowerBand", "float"],
    ["swr-adjust", "swrAdjust", "float"],
  ].forEach(([id, field, type]) => {
    const el = document.getElementById(id);
    el.addEventListener("change", () => {
      let v = el.value;
      if (type === "float") v = parseFloat(v) || 0;
      state.settings[field] = v;
      saveState();
      recalc();
    });
  });

  document.getElementById("swr-include-realestate").addEventListener("change", e => {
    state.settings.swrIncludeRealEstate = e.target.checked;
    saveState();
    recalc();
  });
}

// ===== Withdrawals & Taxes tab =====
const ACCOUNT_TYPE_LABELS = {
  taxable: "Taxable Brokerage",
  roth: "Roth IRA",
  traditional: "Traditional IRA / 401(k)",
  inherited_ira: "Inherited IRA",
  hsa: "HSA",
};

function renderWithdrawalOrder() {
  const ol = document.getElementById("withdrawal-order");
  ol.innerHTML = "";
  state.settings.withdrawalOrder.forEach((type, idx) => {
    const li = document.createElement("li");
    li.style.marginBottom = "4px";
    li.innerHTML = `
      <span style="display:inline-block;min-width:200px;">${ACCOUNT_TYPE_LABELS[type] || type}</span>
      <button class="small" data-action="up"  ${idx === 0 ? "disabled" : ""}>↑</button>
      <button class="small" data-action="down" ${idx === state.settings.withdrawalOrder.length - 1 ? "disabled" : ""}>↓</button>
    `;
    li.querySelector("[data-action='up']").addEventListener("click", () => {
      if (idx === 0) return;
      const arr = state.settings.withdrawalOrder;
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      saveState(); renderWithdrawalOrder(); recalc();
    });
    li.querySelector("[data-action='down']").addEventListener("click", () => {
      const arr = state.settings.withdrawalOrder;
      if (idx === arr.length - 1) return;
      [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
      saveState(); renderWithdrawalOrder(); recalc();
    });
    ol.appendChild(li);
  });
}

function renderBracketTable(tableId, brackets, onChange) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  tbody.innerHTML = "";
  brackets.forEach((b, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="number" step="0.5" value="${b.rate}" data-field="rate"/></td>
      <td><input type="number" value="${b.upTo}" data-field="upTo"/>
        <small style="color:#64748b;">${b.upTo === 0 ? "(no cap)" : ""}</small></td>
      <td><button class="small danger" data-action="del">×</button></td>
    `;
    tr.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("change", () => {
        b[inp.dataset.field] = parseFloat(inp.value) || 0;
        saveState(); onChange();
      });
    });
    tr.querySelector("[data-action='del']").addEventListener("click", () => {
      brackets.splice(idx, 1);
      saveState(); onChange();
    });
    tbody.appendChild(tr);
  });
}

function renderTaxBrackets() {
  renderBracketTable("tax-brackets-table", state.settings.taxBrackets, () => {
    renderTaxBrackets(); recalc();
  });
}
function renderLtcgBrackets() {
  renderBracketTable("ltcg-brackets-table", state.settings.ltcgBrackets, () => {
    renderLtcgBrackets(); recalc();
  });
}

function renderWithdrawalsTab() {
  renderWithdrawalOrder();
  renderTaxBrackets();
  renderLtcgBrackets();

  document.getElementById("set-std-deduction").value = state.settings.stdDeduction;
  document.getElementById("set-use-brackets").value = String(state.settings.useTaxBrackets !== false);
  document.getElementById("set-bracket-aware").checked = state.settings.bracketAwareWithdrawals !== false;
  document.getElementById("set-tax-rate").value = state.settings.taxRate ?? 18;
  document.getElementById("set-cg-rate").value  = state.settings.cgRate  ?? 15;
  document.getElementById("set-taxable-cg-pct").value = state.settings.taxableCapGainsPct ?? 50;
  document.getElementById("tsc-tax-rise-pct").value  = state.settings.taxRisePct  ?? 0;
  document.getElementById("tsc-tax-rise-year").value = state.settings.taxRiseYear ?? 2026;

  const rc = state.settings.rothConv;
  document.getElementById("rc-strategy").value = rc.strategy || "none";
  document.getElementById("rc-start").value = rc.startYear;
  document.getElementById("rc-end").value = rc.endYear;
  document.getElementById("rc-custom").value = rc.customAmount;
  document.getElementById("rc-wait-inherited").checked = !!rc.startAfterInheritedDepleted;

  const ii = state.settings.inheritedIra;
  document.getElementById("ii-strategy").value = ii.strategy || "fill_first";
  document.getElementById("ii-split-pct").value = ii.splitPct ?? 50;
  document.getElementById("ii-cap-bracket").checked = ii.capAtBracketFill === true;

  // Inherited IRA summary (balance, year-clocks)
  const inherited = state.accounts.filter(a => a.type === "inherited_ira");
  const sum = inherited.reduce((s, a) => s + (a.balance || 0), 0);
  const lines = inherited.map(a => {
    const inhY = a.inheritanceYear || (state.settings.currentYear - 1);
    const yearsLeft = Math.max(0, 10 - (state.settings.currentYear - inhY));
    return `<li>${a.name}: ${fmt(a.balance)} — inherited ${inhY}, ${yearsLeft} years remaining</li>`;
  }).join("");
  document.getElementById("ii-summary").innerHTML = inherited.length
    ? `<strong>Inherited IRA balance:</strong> ${fmt(sum)}<ul style="margin:4px 0 0 18px;">${lines}</ul>`
    : `<em>No inherited IRA accounts yet. Add one on the Investment Accounts tab.</em>`;
}

function wireWithdrawalsTab() {
  document.getElementById("add-tax-bracket").addEventListener("click", () => {
    state.settings.taxBrackets.push({ rate: 0, upTo: 0 });
    saveState(); renderTaxBrackets(); recalc();
  });
  document.getElementById("reset-tax-brackets").addEventListener("click", () => {
    state.settings.taxBrackets = DEFAULT_TAX_BRACKETS_MFJ_2024.map(b => ({...b}));
    saveState(); renderTaxBrackets(); recalc();
  });
  document.getElementById("add-ltcg-bracket").addEventListener("click", () => {
    state.settings.ltcgBrackets.push({ rate: 0, upTo: 0 });
    saveState(); renderLtcgBrackets(); recalc();
  });
  document.getElementById("reset-ltcg-brackets").addEventListener("click", () => {
    state.settings.ltcgBrackets = DEFAULT_LTCG_BRACKETS_MFJ_2024.map(b => ({...b}));
    saveState(); renderLtcgBrackets(); recalc();
  });
  document.getElementById("set-std-deduction").addEventListener("change", (e) => {
    state.settings.stdDeduction = parseFloat(e.target.value) || 0;
    saveState(); recalc();
  });
  document.getElementById("set-use-brackets").addEventListener("change", (e) => {
    state.settings.useTaxBrackets = e.target.value === "true";
    saveState(); recalc();
  });
  document.getElementById("set-tax-rate").addEventListener("change", (e) => {
    state.settings.taxRate = parseFloat(e.target.value) || 0;
    saveState(); recalc();
  });
  document.getElementById("set-cg-rate").addEventListener("change", (e) => {
    state.settings.cgRate = parseFloat(e.target.value) || 0;
    saveState(); recalc();
  });
  document.getElementById("set-taxable-cg-pct").addEventListener("change", (e) => {
    state.settings.taxableCapGainsPct = parseFloat(e.target.value) || 0;
    saveState(); recalc();
  });
  document.getElementById("set-bracket-aware").addEventListener("change", (e) => {
    state.settings.bracketAwareWithdrawals = e.target.checked;
    saveState(); recalc();
  });
  document.getElementById("tsc-tax-rise-pct").addEventListener("change", (e) => {
    state.settings.taxRisePct = parseFloat(e.target.value) || 0;
    saveState(); renderTaxStrategyComparison();
  });
  document.getElementById("tsc-tax-rise-year").addEventListener("change", (e) => {
    state.settings.taxRiseYear = parseInt(e.target.value) || 2026;
    saveState(); renderTaxStrategyComparison();
  });
  document.getElementById("tsc-rerun").addEventListener("click", () => {
    state.settings.taxRisePct  = parseFloat(document.getElementById("tsc-tax-rise-pct").value)  || 0;
    state.settings.taxRiseYear = parseInt(document.getElementById("tsc-tax-rise-year").value) || 2026;
    saveState(); renderTaxStrategyComparison();
  });

  ["rc-strategy", "rc-start", "rc-end", "rc-custom"].forEach(id => {
    document.getElementById(id).addEventListener("change", (e) => {
      const rc = state.settings.rothConv;
      if (id === "rc-strategy") rc.strategy = e.target.value;
      else if (id === "rc-start") rc.startYear = parseInt(e.target.value) || 0;
      else if (id === "rc-end") rc.endYear = parseInt(e.target.value) || 0;
      else if (id === "rc-custom") rc.customAmount = parseFloat(e.target.value) || 0;
      saveState(); recalc();
    });
  });
  document.getElementById("rc-wait-inherited").addEventListener("change", (e) => {
    state.settings.rothConv.startAfterInheritedDepleted = e.target.checked;
    saveState(); recalc();
  });

  ["ii-strategy", "ii-split-pct"].forEach(id => {
    document.getElementById(id).addEventListener("change", (e) => {
      const ii = state.settings.inheritedIra;
      if (id === "ii-strategy") ii.strategy = e.target.value;
      else if (id === "ii-split-pct") ii.splitPct = parseFloat(e.target.value) || 0;
      saveState(); renderWithdrawalsTab(); recalc();
    });
  });
  document.getElementById("ii-cap-bracket").addEventListener("change", (e) => {
    state.settings.inheritedIra.capAtBracketFill = e.target.checked;
    saveState(); recalc();
  });
}

let withdrawalChart, taxChart;
function renderWithdrawalRows(rows) {
  const tbody = document.querySelector("#withdrawals-table tbody");
  tbody.innerHTML = "";
  rows.forEach(r => {
    const w = r.withdrawnByType || {};
    const taxableW = w.taxable || 0;
    const traditionalW = (w["401k"] || 0) + (w.ira || 0);
    const rothW = w.roth || 0;
    const otherW = (w.hsa || 0) + (w.inherited_ira || 0);
    const tr = document.createElement("tr");
    if (r.retired) tr.className = "retired";
    tr.innerHTML = `
      <td>${r.year}</td>
      <td>${r.s1Age}/${r.s2Age}</td>
      <td>${fmt(r.salary1 + r.salary2)}</td>
      <td>${fmt(r.grossSS)}</td>
      <td>${fmt(r.rentalNet)}</td>
      <td>${fmt(r.expenses)}</td>
      <td>${fmt(taxableW)}</td>
      <td>${fmt(traditionalW)}</td>
      <td>${fmt(rothW)}</td>
      <td>${fmt(otherW)}</td>
      <td>${fmt(r.inheritedDrained || 0)}</td>
      <td>${fmt(r.rothConverted || 0)}</td>
      <td>${fmt(r.ordinaryTax)}</td>
      <td>${fmt(r.ltcgTax)}</td>
      <td><strong>${fmt(r.totalTax)}</strong></td>
      <td>${r.marginalRate || 0}%</td>
      <td>${fmt(r.liquid)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function drawWithdrawalCharts(rows) {
  const labels = rows.map(r => r.year);
  if (withdrawalChart) withdrawalChart.destroy();
  if (taxChart) taxChart.destroy();

  const seriesFor = (type) => rows.map(r => (r.withdrawnByType?.[type] || 0));
  const ctx1 = document.getElementById("withdrawalChart").getContext("2d");
  withdrawalChart = new Chart(ctx1, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Taxable",       data: seriesFor("taxable"),       backgroundColor: "#3b82f6", stack: "w" },
        { label: "Traditional",   data: rows.map(r => (r.withdrawnByType?.["401k"]||0) + (r.withdrawnByType?.ira||0) + (r.withdrawnByType?.inherited_ira||0)),
          backgroundColor: "#f59e0b", stack: "w" },
        { label: "Roth",          data: seriesFor("roth"),          backgroundColor: "#10b981", stack: "w" },
        { label: "HSA",           data: seriesFor("hsa"),           backgroundColor: "#a78bfa", stack: "w" },
        { label: "Roth Conv",     data: rows.map(r => r.rothConverted || 0), backgroundColor: "#ec4899", stack: "c" },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: "Annual Withdrawals (stacked) + Roth Conversions" },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.y)}` } },
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, ticks: { callback: v => fmt(v) } }
      }
    }
  });

  const ctx2 = document.getElementById("taxChart").getContext("2d");
  taxChart = new Chart(ctx2, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Ordinary-Income Tax", data: rows.map(r => r.ordinaryTax), backgroundColor: "#ef4444", stack: "t" },
        { label: "LTCG Tax",            data: rows.map(r => r.ltcgTax),     backgroundColor: "#f59e0b", stack: "t" },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: "Annual Federal Tax Bill" },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.y)}` } },
      },
      scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: v => fmt(v) } } }
    }
  });
}

function renderTaxStrategyComparison() {
  const tbody = document.querySelector("#tax-strategy-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const strategies = [
    { key: "none",    label: "No Conversion" },
    { key: "fill_12", label: "Fill 12% Bracket" },
    { key: "fill_22", label: "Fill 22% Bracket" },
    { key: "fill_24", label: "Fill 24% Bracket" },
    { key: "fill_32", label: "Fill 32% Bracket" },
  ];

  const s = state.settings;
  const rc = s.rothConv || {};
  const planStart = s.currentYear;
  const planEnd   = s.endYear;
  document.getElementById("tsc-full-range").textContent = `${planStart}–${planEnd}`;

  const currentStrategy = rc.strategy || "none";
  const originalStrategy = rc.strategy;

  const results = strategies.map(({ key, label }) => {
    s.rothConv.strategy = key;
    const rows = project();
    const fullTax = rows
      .filter(r => r.year >= planStart && r.year <= planEnd)
      .reduce((sum, r) => sum + (r.totalTax || 0), 0);
    const endNW = rows[rows.length - 1]?.netWorth || 0;
    return { key, label, fullTax, endNW };
  });

  s.rothConv.strategy = originalStrategy;

  // Best = highest end-of-plan net worth
  const bestKey = results.reduce((b, r) => (r.endNW > b.endNW ? r : b)).key;

  results.forEach(({ key, label, fullTax, endNW }) => {
    const tr = document.createElement("tr");
    if (key === currentStrategy) tr.style.background = "#dbeafe";
    const isBest = key === bestKey;
    tr.innerHTML = `
      <td>
        ${label}
        ${key === currentStrategy ? ' <strong>(current)</strong>' : ''}
        ${isBest ? ' <span style="color:#15803d;">✓ highest net worth</span>' : ''}
      </td>
      <td>${fmt(endNW)}</td>
      <td>${fmt(fullTax)}</td>
    `;
    if (isBest) tr.style.borderLeft = "4px solid #15803d";
    tbody.appendChild(tr);
  });
}

function renderRothRecommendation(rows) {
  const el = document.getElementById("rc-recommendation");
  if (!el) return;

  const s = state.settings;
  const olderRetire = s.hasSpouse2 ? Math.max(s.s1.retireYear, s.s2.retireYear) : s.s1.retireYear;
  // Tax valley ends when the first spouse hits 73 and RMDs begin
  const s1RmdYear = s.currentYear + (73 - s.s1.age);
  const s2RmdYear = s.hasSpouse2 ? s.currentYear + (73 - s.s2.age) : 9999;
  const rmdYear = Math.min(s1RmdYear, s2RmdYear);

  // Sum traditional pretax balances
  const pretax = state.accounts
    .filter(a => a.type === "ira" || a.type === "401k" || a.type === "inherited_ira")
    .reduce((sum, a) => sum + (a.balance || 0), 0);

  const valleyStart = olderRetire;
  const valleyEnd = rmdYear - 1;
  const valleyYears = Math.max(0, valleyEnd - valleyStart + 1);

  // Use "no conversion" baseline so valley/post marginal rates aren't distorted
  // by the conversion income of whatever strategy is currently active.
  const originalStrategy = s.rothConv.strategy;
  s.rothConv.strategy = "none";
  const baseRows = project();
  s.rothConv.strategy = originalStrategy;

  const valley = baseRows.filter(r => r.year >= valleyStart && r.year <= valleyEnd);
  const post   = baseRows.filter(r => r.year > valleyEnd);
  const valleyMargAvg = valley.length ? Math.round(valley.reduce((a,r)=>a+r.marginalRate,0)/valley.length) : 0;
  const postMargAvg   = post.length   ? Math.round(post.reduce((a,r)=>a+r.marginalRate,0)/post.length)     : 0;

  // Run all strategies to find the one with highest end net worth (same as comparison table)
  const strategies = ["none","fill_12","fill_22","fill_24","fill_32"];
  const planStart = s.currentYear, planEnd = s.endYear;
  const stratResults = strategies.map(key => {
    s.rothConv.strategy = key;
    const r = project();
    const tax = r.filter(x => x.year >= planStart && x.year <= planEnd).reduce((a,x)=>a+(x.totalTax||0),0);
    return { key, endNW: r[r.length-1]?.netWorth || 0, tax };
  });
  s.rothConv.strategy = originalStrategy;

  const bestNW  = stratResults.reduce((b,r) => r.endNW > b.endNW ? r : b);
  const lowestTax = stratResults.reduce((b,r) => r.tax < b.tax ? r : b);
  const stratLabel = { none:"No Conversion", fill_12:"Fill 12%", fill_22:"Fill 22%", fill_24:"Fill 24%", fill_32:"Fill 32%" };

  // Suggested bracket based on marginal rate gap (heuristic)
  let suggestedTarget = "fill_12";
  if (valleyMargAvg >= 12) suggestedTarget = "fill_22";
  if (valleyMargAvg >= 22) suggestedTarget = "fill_24";

  const targetTopByName = { fill_12: 94300, fill_22: 201050, fill_24: 383900, fill_32: 487450 };
  const targetTop = targetTopByName[suggestedTarget];
  const avgValleyTaxable = valley.length ? valley.reduce((a,r)=>a+r.taxableOrdinary,0)/valley.length : 0;
  const annualHeadroom = Math.max(0, targetTop - avgValleyTaxable);

  const nwAgree = bestNW.key === suggestedTarget;
  const conflict = !nwAgree && bestNW.key !== suggestedTarget;

  el.innerHTML = `
    <strong>Tax-valley window:</strong> ${valleyStart}–${valleyEnd} (${valleyYears} years, ends when RMDs begin)<br/>
    <strong>Pretax IRA / 401(k) balance today:</strong> ${fmt(pretax)}<br/>
    <strong>Avg marginal rate in valley (no-conversion baseline):</strong> ${valleyMargAvg}%
      &nbsp;|&nbsp; <strong>after RMDs begin (${rmdYear}):</strong> ${postMargAvg}%<br/>
    <strong>Bracket heuristic suggests:</strong> ${stratLabel[suggestedTarget]}
      &nbsp;·&nbsp; <strong>Est. annual headroom:</strong> ${fmt(annualHeadroom)}<br/>
    <strong>Highest end net worth:</strong> ${stratLabel[bestNW.key]} (${fmt(bestNW.endNW)})<br/>
    <strong>Lowest lifetime tax:</strong> ${stratLabel[lowestTax.key]} (${fmt(lowestTax.tax)})<br/>
    ${
      nwAgree
        ? `<span style="color:#15803d;">✅ Both signals agree — ${stratLabel[suggestedTarget]} gives the best outcome.</span>`
        : conflict
          ? `<span style="color:#b45309;">⚠️ Signals conflict: the marginal-rate gap suggests <strong>${stratLabel[suggestedTarget]}</strong>,
              but the full projection shows <strong>${stratLabel[bestNW.key]}</strong> leaves more net worth.
              This usually means the conversion tax bill up front outweighs the rate savings —
              consider a smaller conversion target or check your pretax balance size.</span>`
          : `<span>⚖️ Rates appear similar — conversions may still de-risk large RMDs.</span>`
    }
  `;
}

// ===== Monte Carlo =====
// Simple seeded RNG (mulberry32) so seeded runs are reproducible
function makeRng(seed) {
  let t = seed >>> 0;
  if (t === 0) t = (Date.now() & 0xffffffff) >>> 0;
  return function() {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rng) {
  // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

let mcChart;
async function runMonteCarlo() {
  const runs = parseInt(document.getElementById("mc-runs").value) || 1000;
  const stddev = parseFloat(document.getElementById("mc-stddev").value) || 0;
  const inflStddev = parseFloat(document.getElementById("mc-infl-stddev").value) || 0;
  const seed = parseInt(document.getElementById("mc-seed").value) || 0;
  const status = document.getElementById("mc-status");
  status.textContent = `Running ${runs} simulations…`;

  // Allow the UI to paint
  await new Promise(r => setTimeout(r, 20));

  const rng = makeRng(seed);
  const startYear = state.settings.currentYear;
  const endYear = state.settings.endYear;
  const numYears = endYear - startYear + 1;

  // Collect per-year liquid+RE arrays across all runs
  const liquidMatrix = Array.from({ length: numYears }, () => []);
  const netWorthMatrix = Array.from({ length: numYears }, () => []);
  let successes = 0;
  const bustYears = [];

  for (let r = 0; r < runs; r++) {
    // pre-generate noise vectors so the same projection sees consistent inputs
    const retNoise  = new Array(numYears);
    const inflNoise = new Array(numYears);
    for (let y = 0; y < numYears; y++) {
      retNoise[y]  = gaussian(rng) * stddev;
      inflNoise[y] = gaussian(rng) * inflStddev;
    }
    const rows = project({
      noiseReturn: (y) => retNoise[y] || 0,
      noiseInfl:   (y) => inflNoise[y] || 0,
    });
    let busted = false;
    let bustYear = null;
    rows.forEach((row, i) => {
      liquidMatrix[i].push(row.liquid);
      netWorthMatrix[i].push(row.netWorth);
      if (!busted && row.retired && row.liquid <= 0) {
        busted = true;
        bustYear = row.year;
      }
    });
    if (!busted) successes++;
    if (busted) bustYears.push(bustYear);
  }

  // Percentile helpers
  function pct(arr, p) {
    const sorted = arr.slice().sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
    return sorted[idx];
  }

  const labels = [];
  const p10 = [], p50 = [], p90 = [];
  for (let y = 0; y < numYears; y++) {
    labels.push(startYear + y);
    p10.push(pct(netWorthMatrix[y], 0.10));
    p50.push(pct(netWorthMatrix[y], 0.50));
    p90.push(pct(netWorthMatrix[y], 0.90));
  }

  const successRate = (successes / runs) * 100;
  const endP50 = p50[p50.length - 1];
  const endP10 = p10[p10.length - 1];
  const endP90 = p90[p90.length - 1];
  const medianBust = bustYears.length ? pct(bustYears, 0.5) : null;

  document.getElementById("mc-success").textContent = successRate.toFixed(1) + "%";
  document.getElementById("mc-median").textContent  = fmt(endP50);
  document.getElementById("mc-p10").textContent     = fmt(endP10);
  document.getElementById("mc-p90").textContent     = fmt(endP90);
  document.getElementById("mc-bust").textContent    = medianBust || "—";

  if (mcChart) mcChart.destroy();
  const ctx = document.getElementById("mcChart").getContext("2d");
  mcChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "P90 (best case)", data: p90, borderColor: "#10b981",
          backgroundColor: "rgba(16,185,129,0.15)", fill: "+1", tension: 0.2, pointRadius: 0 },
        { label: "P50 (median)",   data: p50, borderColor: "#1f3a5f",
          backgroundColor: "rgba(31,58,95,0.0)", fill: false, borderWidth: 3, tension: 0.2, pointRadius: 0 },
        { label: "P10 (worst case)", data: p10, borderColor: "#ef4444",
          backgroundColor: "rgba(239,68,68,0.0)", fill: false, tension: 0.2, pointRadius: 0 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: `Net Worth Distribution Across ${runs} Simulations` },
        tooltip: {
          callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.y)}` }
        },
      },
      scales: {
        y: { ticks: { callback: v => fmt(v) } }
      }
    }
  });

  status.textContent = `Done. ${runs} simulations completed.`;
}
document.getElementById("run-mc").addEventListener("click", runMonteCarlo);

// ===== Social Security Helpers =====
// Simplified bend-point formula (2024-ish values, inflation-adjusted minimally)
// avgAnnualEarnings: career average in today's dollars
// totalWorkingYears: years worked so far + years until retirement (capped at 35 for SSA purposes)
function estimateFRABenefit(avgAnnualEarnings, totalWorkingYears) {
  const wageBase = 168600; // 2024 SS wage base
  const cappedEarnings = Math.min(avgAnnualEarnings, wageBase);
  // SSA averages over 35 years — fewer years means zero-income years drag the average down
  const effectiveAIME = (cappedEarnings / 12) * Math.min(totalWorkingYears, 35) / 35;
  const b1 = 1174, b2 = 7078;
  let pia = 0;
  pia += 0.90 * Math.min(effectiveAIME, b1);
  if (effectiveAIME > b1) pia += 0.32 * (Math.min(effectiveAIME, b2) - b1);
  if (effectiveAIME > b2) pia += 0.15 * (effectiveAIME - b2);
  return pia * 12;
}
function claimAgeFactor(claimAge) {
  // Roughly: 70% at 62, 100% at 67, 124% at 70
  if (claimAge <= 62) return 0.70;
  if (claimAge >= 70) return 1.24;
  if (claimAge < 67) {
    // 5.6%/yr reduction between 62 and 67  (0.70 -> 1.00 over 5 years = 0.06/yr)
    return 0.70 + (claimAge - 62) * 0.06;
  }
  // 67 -> 70: 8%/yr delayed retirement credit
  return 1.0 + (claimAge - 67) * 0.08;
}

function renderSSTab() {
  const html = (sp, prefix) => `
    <fieldset>
      <legend>${state.settings[sp].name}</legend>
      <div class="grid-2">
        <label>Average Annual Earnings (career, today $)
          <input type="number" id="${prefix}-earnings" value="${state.settings[sp].ssEstEarnings || state.settings[sp].salary}"/>
          <small>Auto-filled from salary above — edit to use a different career average.</small></label>
        <label>Years Worked So Far
          <input type="number" id="${prefix}-years" value="${state.settings[sp].ssEstYears || 20}" min="0" max="50"/>
          <small>Years of SS-covered work completed to date. Additional years until your retirement date (set above) will be added automatically to compute the total working years used in the SSA 35-year average.</small></label>
        <label>Claim Age (62–70)
          <input type="number" id="${prefix}-claim" value="${state.settings[sp].ssAge}" min="62" max="70"/>
          <small>Updates "Social Security Start Age" in the spouse box above.</small></label>
        <label>Manual Override Annual Benefit ($, today)
          <input type="number" id="${prefix}-override" value="${state.settings[sp].ssOverride || 0}"/>
          <small>0 = use estimate above. If non-zero, this value is used directly as the FRA benefit and overrides the estimate. For the most accurate number, log in to <a href="https://www.ssa.gov/myaccount" target="_blank" rel="noopener">ssa.gov/myaccount</a> to look up your actual estimated benefit at FRA and enter it here.</small>
        </label>
      </div>
      <div style="margin-top:8px; line-height:1.8;">
        <strong>Total Working Years (so far + until retirement):</strong> <span id="${prefix}-totalyears">—</span><br/>
        <span id="${prefix}-years-warning" style="font-size:12px;">Retiring before 35 years of SS-covered work reduces your benefit — the SSA fills the missing years with zeros when computing your 35-year average.</span><br/>
        <strong>Estimated Annual Benefit at FRA (67):</strong> <span id="${prefix}-fra">—</span><br/>
        <strong>Estimated Annual Benefit at Claim Age:</strong> <span id="${prefix}-final">—</span>
      </div>
    </fieldset>
  `;
  document.getElementById("ss-spouses").innerHTML = `
    <div class="muted" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;line-height:1.7;">
      <strong style="color:#1f3a5f;">How to get the most accurate Social Security estimate:</strong>
      <ol style="margin:6px 0 0 18px;padding:0;">
        <li>Visit <a href="https://www.ssa.gov/myaccount" target="_blank" rel="noopener">ssa.gov/myaccount</a> to see your SSA estimated benefit at FRA.</li>
        <li><strong>If you plan to retire before FRA with fewer than 35 years worked,</strong> the SSA number will be overstated — it assumes you keep earning your current salary until FRA. Use the estimate fields below (salary + years worked so far + retirement date) instead to get a realistic number that accounts for the early retirement zeros.</li>
        <li><strong>If you will have 35+ years worked by retirement,</strong> the SSA number is reliable — paste it into the Manual Override field and the calculator will still apply the correct adjustment for your chosen claim age.</li>
      </ol>
    </div>
  ` + html("s1", "ss1") + (state.settings.hasSpouse2 ? html("s2", "ss2") : "");

  function wire(sp, prefix) {
    const earningsEl = document.getElementById(`${prefix}-earnings`);
    const yearsEl    = document.getElementById(`${prefix}-years`);
    const claimEl    = document.getElementById(`${prefix}-claim`);
    const overrideEl = document.getElementById(`${prefix}-override`);

    function update() {
      const earnings   = parseFloat(earningsEl.value) || 0;
      const yearsSoFar = parseFloat(yearsEl.value) || 0;
      const claimAge   = parseInt(claimEl.value) || 67;
      const override   = parseFloat(overrideEl.value) || 0;

      state.settings[sp].ssEstEarnings = earnings;
      state.settings[sp].ssEstYears    = yearsSoFar;
      state.settings[sp].ssAge         = claimAge;
      state.settings[sp].ssOverride    = override;

      // Compute additional years from current year to retirement year
      const currentYear  = state.settings.currentYear || new Date().getFullYear();
      const retireYear   = state.settings[sp].retireYear || currentYear;
      const yearsToRetire = Math.max(0, retireYear - currentYear);
      const totalYears   = yearsSoFar + yearsToRetire;

      const fraBenefit   = override > 0 ? override : estimateFRABenefit(earnings, totalYears);
      const finalBenefit = fraBenefit * claimAgeFactor(claimAge);

      document.getElementById(`${prefix}-totalyears`).textContent = `${yearsSoFar} + ${yearsToRetire} = ${totalYears} yrs (capped at 35 for SSA average)`;
      const warningEl = document.getElementById(`${prefix}-years-warning`);
      if (warningEl) warningEl.style.color = totalYears < 35 ? "#b91c1c" : "#64748b";
      document.getElementById(`${prefix}-fra`).textContent = fmt(fraBenefit);
      document.getElementById(`${prefix}-final`).textContent = fmt(finalBenefit) + "/yr";

      state.settings[sp].ssAmt = finalBenefit;

      // Mirror to spouse box above
      const elAmt = document.getElementById(`${sp}-ss-amt`);
      const elAge = document.getElementById(`${sp}-ss-age`);
      if (elAmt) elAmt.value = Math.round(finalBenefit);
      if (elAge) elAge.value = claimAge;

      saveState();
      recalc();
    }

    [earningsEl, yearsEl, claimEl, overrideEl].forEach(el => el.addEventListener("input", update));
    update(); // initial compute

    // When salary changes in the spouse box above, sync earnings if not manually overridden
    const salaryEl = document.getElementById(`${sp}-salary`);
    if (salaryEl) {
      salaryEl.addEventListener("change", () => {
        if (!state.settings[sp].ssEstEarningsManual) {
          earningsEl.value = salaryEl.value;
          update();
        }
      });
    }
    // Mark earnings as manually overridden if user edits it directly
    earningsEl.addEventListener("change", () => {
      state.settings[sp].ssEstEarningsManual = true;
    });

    // When retirement year changes, recalculate SS (more/fewer working years)
    const retireEl = document.getElementById(`${sp}-retire-year`);
    if (retireEl) retireEl.addEventListener("change", update);
  }
  wire("s1", "ss1");
  if (state.settings.hasSpouse2) wire("s2", "ss2");
}

// ===== Initial Render =====
function fullRender() {
  bindSettings();
  applySpouse2Visibility();
  renderLargeExpenses();
  renderRecurringExpenses();
  renderAccounts();
  renderProperties();
  renderWithdrawalsTab();
  renderGuardrailsControls();
  recalc();
}
// ===== Bar chart segment + total tooltip =====
// Adds a "Total: $X" footer to any stacked bar chart tooltip
Chart.defaults.plugins.tooltip.callbacks.footer = function(tooltipItems) {
  if (tooltipItems.length <= 1) return undefined;
  const chart = tooltipItems[0].chart;
  if (chart.config.type !== "bar") return undefined;
  const total = tooltipItems.reduce((sum, item) => sum + (item.parsed.y || 0), 0);
  return "Total: " + fmt(total);
};

// ===== Chart zoom controls =====
const chartZoomState = {};

function getChartById(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  return Object.values(Chart.instances).find(c => c.canvas === canvas) || null;
}

function applyChartZoom(canvasId) {
  const chart = getChartById(canvasId);
  if (!chart) return;
  const z = chartZoomState[canvasId] || {};
  const scales = chart.options.scales || {};
  if (scales.y) {
    scales.y.min = (z.ymin !== undefined && z.ymin !== "") ? Number(z.ymin) : undefined;
    scales.y.max = (z.ymax !== undefined && z.ymax !== "") ? Number(z.ymax) : undefined;
  }
  if (scales.x) {
    scales.x.min = (z.xmin !== undefined && z.xmin !== "") ? Number(z.xmin) : undefined;
    scales.x.max = (z.xmax !== undefined && z.xmax !== "") ? Number(z.xmax) : undefined;
  }
  chart.update();
}

document.querySelectorAll(".chart-zoom-controls").forEach(controls => {
  const canvasId = controls.dataset.chart;
  if (!chartZoomState[canvasId]) chartZoomState[canvasId] = {};

  controls.querySelectorAll("input[data-zoom]").forEach(input => {
    input.addEventListener("change", () => {
      chartZoomState[canvasId][input.dataset.zoom] = input.value;
      applyChartZoom(canvasId);
    });
  });

  const resetBtn = controls.querySelector("[data-zoom-reset]");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      chartZoomState[canvasId] = {};
      controls.querySelectorAll("input[data-zoom]").forEach(i => { i.value = ""; });
      applyChartZoom(canvasId);
    });
  }
});

(async () => {
  await loadState();
  fullRender();
  wireWithdrawalsTab();
  wireGuardrailsTab();
})();
