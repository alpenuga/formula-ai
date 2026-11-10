const $ = (id) => document.getElementById(id);
const ELEMENTS = {
  H:1.008, He:4.0026, Li:6.94, Be:9.0122, B:10.81, C:12.011, N:14.007, O:15.999,
  F:18.998, Ne:20.180, Na:22.990, Mg:24.305, Al:26.982, Si:28.085, P:30.974, S:32.06,
  Cl:35.45, Ar:39.948, K:39.098, Ca:40.078, Sc:44.956, Ti:47.867, V:50.942, Cr:51.996,
  Mn:54.938, Fe:55.845, Co:58.933, Ni:58.693, Cu:63.546, Zn:65.38, Ga:69.723, Ge:72.630,
  As:74.922, Se:78.971, Br:79.904, Kr:83.798, Rb:85.468, Sr:87.62, Y:88.906, Zr:91.224,
  Nb:92.906, Mo:95.95, Ag:107.87, Cd:112.41, Sn:118.71, I:126.90, Ba:137.33, W:183.84,
  Pt:195.08, Au:196.97, Hg:200.59, Pb:207.2, U:238.03
};

const DEFAULT_MODEL = "gemini-flash-latest";
const ALLOWED_MODELS = [
  "gemini-flash-latest",
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite"
];
const FALLBACK_MODELS = ALLOWED_MODELS.slice();
const MODEL_ALIASES = {
  "gemini-2.0-flash": DEFAULT_MODEL,
  "gemini-2.0-flash-lite": "gemini-flash-lite-latest",
  "gemini-1.5-flash": DEFAULT_MODEL,
  "gemini-1.5-pro": "gemini-2.5-flash",
  "gemini-3-flash": DEFAULT_MODEL,
  "gemini-3-flash-preview": DEFAULT_MODEL,
  "gemini-2.5-pro": "gemini-2.5-flash",
  "gemini-3.6-flash": "gemini-3.8-flash",
  "gemini-3.7-flash": "gemini-3.8-flash"
};

const state = {
  lastExact: "",
  lastInput: "",
  lastImage: null,
  lastMime: "image/jpeg"
};

function resolveModel(name) {
  const raw = String(name || "").replace(/^models\//, "").trim();
  const mapped = MODEL_ALIASES[raw] || raw || DEFAULT_MODEL;
  return ALLOWED_MODELS.includes(mapped) ? mapped : DEFAULT_MODEL;
}

function migrateModel() {
  const next = resolveModel(localStorage.getItem("gemini_model"));
  localStorage.setItem("gemini_model", next);
  return next;
}

function loadSettings() {
  $("apiKey").value = localStorage.getItem("gemini_key") || "";
  const model = migrateModel();
  $("model").value = model;
  if (![...$("model").options].some((o) => o.value === $("model").value)) {
    $("model").value = DEFAULT_MODEL;
  }
  $("proxyUrl").value = localStorage.getItem("gemini_proxy") || "";
}

function saveSettings() {
  localStorage.setItem("gemini_key", $("apiKey").value.trim());
  localStorage.setItem("gemini_model", resolveModel($("model").value));
  localStorage.setItem("gemini_proxy", $("proxyUrl").value.trim());
  $("settingsStatus").textContent = "Сохранено. Модель: " + getModel();
  $("settingsStatus").className = "status ok";
}

function getKey() {
  return (localStorage.getItem("gemini_key") || "").trim();
}

function getModel() {
  return migrateModel();
}

function getProxy() {
  return (localStorage.getItem("gemini_proxy") || "").trim();
}

function activeStatusEl() {
  if ($("tab-photo") && !$("tab-photo").classList.contains("hidden")) return $("photoStatus");
  if ($("tab-chem") && !$("tab-chem").classList.contains("hidden")) return $("molarNote");
  return $("calcStatus");
}

function setStatus(el, msg, type = "") {
  const target = el || activeStatusEl();
  if (!target) return;
  target.textContent = msg;
  target.className = "status " + type;
}

function renderTex(el, latex) {
  el.innerHTML = "";
  if (!latex) return;
  try {
    katex.render(String(latex), el, { throwOnError: false, displayMode: true });
  } catch {
    el.textContent = latex;
  }
}

function heron(a, b, c) {
  const p = nerdamer(`(${a}+${b}+${c})/2`).text();
  return nerdamer(`sqrt((${p})*((${p})-${a})*((${p})-${b})*((${p})-${c}))`);
}

function safeToText(val) {
  try {
    if (val == null) return "";
    if (typeof val.text === "function") return val.text();
    if (typeof val.toString === "function") return val.toString();
  } catch {}
  return String(val);
}

function safeToTeX(val) {
  try {
    if (val && typeof val.toTeX === "function") return val.toTeX();
  } catch {}
  return "";
}

function wrapResult(val, note) {
  const text = safeToText(val);
  return { exact: safeToTeX(val) || text, text, note };
}

function splitArgs(s) {
  const out = [];
  let cur = "", d = 0;
  for (const ch of s) {
    if (ch === "(") d++;
    if (ch === ")") d--;
    if (ch === "," && d === 0) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseCall(s) {
  const m = s.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*)\)\s*$/);
  if (!m) return null;
  return { name: m[1].toLowerCase(), args: splitArgs(m[2]) };
}

function uniqSorted(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  const out = [];
  for (const n of a) {
    if (!out.length || Math.abs(out[out.length - 1] - n) > 1e-9) out.push(n);
  }
  return out;
}

function fmtSchoolNum(n) {
  if (!Number.isFinite(n)) return String(n);
  if (Math.abs(n) < 1e-12) return "0";
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  try {
    const t = nerdamer(String(n)).text();
    if (t && t.length < 24) return t;
  } catch {}
  const r = Math.round(n * 1e6) / 1e6;
  return String(r);
}

function fmtInf(n) {
  if (n === -Infinity) return "-∞";
  if (n === Infinity) return "+∞";
  return fmtSchoolNum(n);
}

function fmtInterval(a, b, la, ra) {
  if (a === b && la && ra) return `{${fmtInf(a)}}`;
  return `${la ? "[" : "("}${fmtInf(a)}; ${fmtInf(b)}${ra ? "]" : ")"}`;
}

function extractRoots(val) {
  const t = safeToText(val);
  if (!t || t === "[]" || /\[\]/.test(t) && t.length < 4) return [];
  const parts = t.replace(/[\[\]\(\)]/g, " ").split(/[,;]+/);
  const roots = [];
  for (let p of parts) {
    p = p.replace(/^[a-zA-Z]\s*=\s*/, "").trim();
    if (!p || !/[0-9xpi√sqrt]/i.test(p)) continue;
    try {
      const n = Number(nerdamer(p).evaluate().text());
      if (Number.isFinite(n)) roots.push(n);
    } catch {}
  }
  return uniqSorted(roots);
}

function evalAt(expr, x) {
  try {
    const v = nerdamer(expr).sub("x", String(x)).evaluate();
    const n = Number(safeToText(v));
    if (!Number.isFinite(n)) return "u";
    if (Math.abs(n) < 1e-10) return "0";
    return n > 0 ? "+" : "-";
  } catch {
    return "u";
  }
}

function intervalMethod(fExpr, op) {
  const f = `(${fExpr})`;
  if (!/[xX]/.test(fExpr)) {
    const sg = evalAt(f, 0);
    const ok =
      (op === ">" && sg === "+") ||
      (op === "<" && sg === "-") ||
      (op === ">=" && (sg === "+" || sg === "0")) ||
      (op === "<=" && (sg === "-" || sg === "0")) ||
      (op === "=" && sg === "0");
    return ok ? "все x ∈ ℝ" : "∅";
  }

  let num = fExpr, den = "1";
  try { num = nerdamer(`numerator(${fExpr})`).text(); } catch {}
  try { den = nerdamer(`denominator(${fExpr})`).text(); } catch {}

  let zeros = [];
  let poles = [];
  try { zeros = extractRoots(nerdamer(`solve((${num})=0,x)`)); } catch {}
  try {
    if (den && den !== "1") poles = extractRoots(nerdamer(`solve((${den})=0,x)`));
  } catch {}
  const poleSet = new Set(poles.map((p) => fmtSchoolNum(p)));
  const isPole = (x) => poleSet.has(fmtSchoolNum(x)) || evalAt(`(${den})`, x) === "0";

  if (op === "=") {
    const zs = zeros.filter((z) => !isPole(z));
    return zs.length ? zs.map((z) => `x=${fmtSchoolNum(z)}`).join("; ") : "∅";
  }

  const crit = uniqSorted([...zeros, ...poles]);
  const includeEq = op === "<=" || op === ">=";
  const wantPlus = op === ">" || op === ">=";
  const bounds = [-Infinity, ...crit, Infinity];
  const segs = [];

  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i], b = bounds[i + 1];
    const mid = a === -Infinity && b === Infinity ? 0
      : a === -Infinity ? b - 1
      : b === Infinity ? a + 1
      : (a + b) / 2;
    const sg = evalAt(f, mid);
    const ok = wantPlus ? sg === "+" : sg === "-";
    if (ok) segs.push({ a, b, la: false, ra: false });
  }

  if (includeEq) {
    for (const z of zeros) {
      if (isPole(z)) continue;
      let used = false;
      for (const s of segs) {
        if (Math.abs(s.a - z) < 1e-9) { s.la = true; used = true; }
        if (Math.abs(s.b - z) < 1e-9) { s.ra = true; used = true; }
      }
      if (!used) segs.push({ a: z, b: z, la: true, ra: true });
    }
    segs.sort((p, q) => p.a - q.a || p.b - q.b);
  }

  if (!segs.length) return "∅";
  return segs.map((s) => fmtInterval(s.a, s.b, s.la, s.ra)).join(" ∪ ");
}

function parseInequality(s) {
  const m = s.match(/^([\s\S]+?)(<=|>=|<|>)([\s\S]+)$/);
  if (!m) return null;
  return { left: m[1].trim(), op: m[2], right: m[3].trim() };
}

function parseDoubleIneq(s) {
  const m = s.replace(/\s+/g, "").match(
    /^(.+?)(<=|<)([a-zA-Z])(<=|<)(.+)$/
  );
  if (!m) return null;
  return { a: m[1], op1: m[2], v: m[3], op2: m[4], b: m[5] };
}

function normalizeAbs(s) {
  return s.replace(/\|([^|]+)\|/g, "abs($1)");
}

function solveAbsIneq(s) {
  const t = normalizeAbs(s);
  const m = t.match(/^abs\((.+)\)\s*(<=|>=|<|>|=)\s*(.+)$/i);
  if (!m) return null;
  const inner = m[1], op = m[2], rhs = m[3];
  let c;
  try { c = Number(nerdamer(rhs).evaluate().text()); } catch { return null; }
  if (!Number.isFinite(c)) return null;

  if (op === "=") {
    if (c < 0) return wrapResult("∅", "Модуль не бывает отрицательным");
    if (c === 0) return wrapResult(nerdamer(`solve((${inner})=0,x)`), "|A|=0 → A=0");
    const r = nerdamer(`solve(((${inner})^2)=(${c})^2,x)`);
    return wrapResult(r, `|A|=${c} → A=±${c}`);
  }
  if (c < 0) {
    if (op === "<" || op === "<=") return { exact: "∅", text: "∅", note: "|A| ≥ 0, не может быть < отрицательного" };
    return { exact: "все x ∈ ℝ (кроме дыр ОДЗ)", text: "все x ∈ ℝ", note: "|A| ≥ 0 > отрицательного" };
  }
  if (c === 0) {
    if (op === "<") return { exact: "∅", text: "∅", note: "|A|<0 невозможно" };
    if (op === "<=") return wrapResult(nerdamer(`solve((${inner})=0,x)`), "|A|≤0 → A=0");
    if (op === ">") return { exact: "все x, кроме нулей A", text: "все x, кроме A=0", note: "|A|>0" };
    return { exact: "все x ∈ ℝ", text: "все x ∈ ℝ", note: "|A|≥0 всегда" };
  }

  let f, newOp;
  if (op === "<" || op === "<=") {
    f = `(${c})^2-(${inner})^2`;
    newOp = op === "<" ? ">" : ">=";
  } else {
    f = `(${inner})^2-(${c})^2`;
    newOp = op === ">" ? ">" : ">=";
  }
  const interval = intervalMethod(f, newOp);
  const text = `x ∈ ${interval}`;
  return { exact: text, text, note: "Неравенство с модулем (школьное |A| ≶ c)" };
}

function solveInequality(s) {
  const dbl = parseDoubleIneq(s);
  if (dbl) {
    const i1 = intervalMethod(`(${dbl.v})-(${dbl.a})`, dbl.op1 === "<" ? ">" : ">=");
    const i2 = intervalMethod(`(${dbl.v})-(${dbl.b})`, dbl.op2 === "<" ? "<" : "<=");
    const text = `( ${dbl.a} ${dbl.op1} ${dbl.v} ) ∩ ( ${dbl.v} ${dbl.op2} ${dbl.b} )  →  пересечение интервалов: [${i1}] и [${i2}]`;
    const one = intervalMethod(
      dbl.v,
      "custom"
    );
    void one;
    const left = intervalMethod(`(${dbl.v})-(${dbl.a})`, dbl.op1 === "<" ? ">" : ">=");
    const right = intervalMethod(`(${dbl.v})-(${dbl.b})`, dbl.op2);
    return {
      exact: `${left} ∩ ${right}`,
      text: `${left} ∩ ${right}`,
      note: "Двойное неравенство: пересечение двух условий"
    };
  }

  const abs = solveAbsIneq(s);
  if (abs) return abs;

  const p = parseInequality(normalizeAbs(s));
  if (!p) return null;
  if (/^abs\(/i.test(p.left) && !/[<>]/.test(p.right)) {
    const again = solveAbsIneq(`${p.left}${p.op}${p.right}`);
    if (again) return again;
  }
  const f = `(${p.left})-(${p.right})`;
  let rootsText = "";
  try { rootsText = safeToText(nerdamer(`solve((${f})=0,x)`)); } catch {}
  const interval = intervalMethod(f, p.op);
  const text = `корни f=0: ${rootsText || "—"};  x ∈ ${interval}`;
  return {
    exact: interval,
    text,
    note: "Метод интервалов (нули числителя/знаменателя, знаки, скобки)"
  };
}

function namedSchool(s) {
  const call = parseCall(s);
  if (!call) return null;
  const a = call.args;
  const n = call.name;
  const N = (...i) => a[i[0]];

  const map = {
    heron: () => wrapResult(heron(a[0], a[1], a[2]), "Площадь треугольника (Герон)"),
    triangle: () => wrapResult(nerdamer(`(${a[0]})*(${a[1]})/2`), "S = a·h/2"),
    pythag: () => wrapResult(nerdamer(`sqrt((${a[0]})^2+(${a[1]})^2)`), "Гипотенуза c=√(a²+b²)"),
    pythagoras: () => map.pythag(),
    rect: () => wrapResult(nerdamer(`(${a[0]})*(${a[1]})`), "Площадь прямоугольника"),
    trap: () => wrapResult(nerdamer(`((${a[0]})+(${a[1]}))*(${a[2]})/2`), "Трапеция (a+b)·h/2"),
    trapezoid: () => map.trap(),
    parallelogram: () => wrapResult(nerdamer(`(${a[0]})*(${a[1]})`), "Параллелограмм a·h"),
    rhombus: () => wrapResult(nerdamer(`(${a[0]})*(${a[1]})/2`), "Ромб d1·d2/2"),
    circle: () => wrapResult(nerdamer(`pi*(${a[0]})^2`), "Площадь круга πr²"),
    circ_len: () => wrapResult(nerdamer(`2*pi*(${a[0]})`), "Длина окружности 2πr"),
    sphere_v: () => wrapResult(nerdamer(`4/3*pi*(${a[0]})^3`), "Объём шара 4/3 πr³"),
    sphere_s: () => wrapResult(nerdamer(`4*pi*(${a[0]})^2`), "Площадь сферы 4πr²"),
    cylinder_v: () => wrapResult(nerdamer(`pi*(${a[0]})^2*(${a[1]})`), "Объём цилиндра πr²h"),
    cylinder_s: () => wrapResult(nerdamer(`2*pi*(${a[0]})*((${a[0]})+(${a[1]}))`), "Полная поверхность цилиндра"),
    cone_v: () => wrapResult(nerdamer(`1/3*pi*(${a[0]})^2*(${a[1]})`), "Объём конуса ⅓πr²h"),
    dist: () => wrapResult(nerdamer(`sqrt((${a[2]}-(${a[0]}))^2+(${a[3]}-(${a[1]}))^2)`), "Расстояние на плоскости"),
    midpoint: () => wrapResult(
      nerdamer(`[(${a[0]})+(${a[2]}))/2, ((${a[1]})+(${a[3]}))/2]`),
      "Середина отрезка"
    ),
    gcd: () => wrapResult(nerdamer(`gcd(${a[0]},${a[1]})`), "НОД"),
    lcm: () => wrapResult(nerdamer(`lcm(${a[0]},${a[1]})`), "НОК"),
    fact: () => wrapResult(nerdamer(`factorials(${a[0]})`).text ? nerdamer(`fact(${a[0]})`) : nerdamer(`fact(${a[0]})`), "n!"),
    c: () => wrapResult(nerdamer(`fact(${a[0]})/(fact(${a[1]})*fact((${a[0]})-(${a[1]})))`), "Число сочетаний C(n,k)"),
    p: () => wrapResult(nerdamer(`fact(${a[0]})/fact((${a[0]})-(${a[1]}))`), "Число размещений P(n,k)"),
    sind: () => wrapResult(nerdamer(`sin((${a[0]})*pi/180)`).evaluate(), "sin градусов (через π/180)"),
    cosd: () => wrapResult(nerdamer(`cos((${a[0]})*pi/180)`).evaluate(), "cos градусов"),
    tand: () => wrapResult(nerdamer(`tan((${a[0]})*pi/180)`).evaluate(), "tg градусов"),
    log10: () => wrapResult(nerdamer(`log10(${a[0]})`), "lg"),
    ln: () => wrapResult(nerdamer(`log(${a[0]})`), "ln"),
    arith: () => wrapResult(nerdamer(`(${a[0]})+(${a[1]})*((${a[2]})-1)`), "n-й член арифм. прогрессии aₙ=a₁+d(n−1)"),
    arithsum: () => wrapResult(nerdamer(`(${a[2]})/2*(2*(${a[0]})+(${a[2]}-1)*(${a[1]}))`), "Сумма арифм. прогрессии"),
    geom: () => wrapResult(nerdamer(`(${a[0]})*(${a[1]})^((${a[2]})-1)`), "n-й член геом. прогрессии"),
    geomsum: () => wrapResult(
      nerdamer(`(${a[0]})*((${a[1]})^((${a[2]}))-1)/((${a[1]})-1)`),
      "Сумма геом. прогрессии (q≠1)"
    ),
    pct: () => wrapResult(nerdamer(`(${a[0]})*(${a[1]})/100`), "p% от числа"),
    kin: () => wrapResult(nerdamer(`(${a[0]})*(${a[1]})^2/2`), "Кинетическая энергия mv²/2"),
    pot: () => wrapResult(nerdamer(`(${a[0]})*9.8*(${a[1]})`), "Потенциальная энергия mgh, g=9.8"),
    dens: () => wrapResult(nerdamer(`(${a[0]})/(${a[1]})`), "Плотность m/V")
  };

  if (n === "fact") {
    try { return wrapResult(nerdamer(`fact(${a[0]})`), "n!"); } catch { return null; }
  }
  if (map[n]) {
    try { return map[n](); } catch (e) { throw new Error("Команда " + n + ": " + e.message); }
  }
  return null;
}

function specialEval(raw) {
  const s0 = raw.trim();
  if (!s0) throw new Error("Введите формулу.");
  const s = s0.replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/−/g, "-");

  const named = namedSchool(s);
  if (named) return named;

  if (
    /<=|>=|<|>/.test(s) ||
    /^\s*abs\(/i.test(s) ||
    /\|.+\|/.test(s)
  ) {
    const ineq = solveInequality(s);
    if (ineq) return ineq;
  }

  const heronM = s.match(/^heron\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i);
  if (heronM) {
    return wrapResult(heron(heronM[1], heronM[2], heronM[3]), "Площадь треугольника по формуле Герона");
  }
  const circ = s.match(/^circle\s*\(\s*([^)]+)\s*\)$/i);
  if (circ) {
    return wrapResult(nerdamer(`pi*(${circ[1]})^2`), "Площадь круга πr² (символьно)");
  }
  const phys = s.split("|");
  if (phys.length === 2 && phys[0].includes("=")) {
    const expr = phys[0].trim();
    const assigns = phys[1].split(";").map((x) => x.trim()).filter(Boolean);
    let e = nerdamer(expr);
    for (const as of assigns) {
      const [k, v] = as.split("=").map((x) => x.trim());
      e = e.sub(k, v);
    }
    const right = e.text().split("=")[1] || e.text();
    return wrapResult(nerdamer(right), "Подстановка значений в формулу");
  }
  if (/solve\s*\(/i.test(s) || (/=/.test(s) && /[a-zA-Z]/.test(s) && !/<=|>=/.test(s))) {
    let cmd = s;
    if (!/^solve/i.test(s)) cmd = `solve(${s}, x)`;
    return wrapResult(nerdamer(cmd), "Решение уравнения (символьно)");
  }
  if (/simplify\s*\(/i.test(s) || /^factor\s*\(/i.test(s) || /^expand\s*\(/i.test(s)) {
    return wrapResult(nerdamer(s), "Преобразование выражения");
  }
  return wrapResult(nerdamer(s).expand().simplify(), "Точное символьное вычисление (nerdamer)");
}

function calculate(raw) {
  const r = specialEval(raw);
  state.lastInput = raw;
  state.lastExact = r.text;
  $("exactOut").textContent = r.text;
  renderTex($("texOut"), r.exact);
  $("calcNote").textContent = r.note;
  pushHistory({ type: "calc", input: raw, output: r.text });
  return r;
}

function molarMass(formula) {
  const tokens = tokenizeFormula(formula.replace(/\s/g, ""));
  return sumTokens(tokens);
}

function tokenizeFormula(s) {
  const stack = [[]];
  const re = /([A-Z][a-z]?)(\d*)|(\()|(\))(\d*)/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[1]) {
      if (!ELEMENTS[m[1]]) throw new Error("Неизвестный элемент: " + m[1]);
      stack[stack.length - 1].push({ el: m[1], n: m[2] ? +m[2] : 1 });
    } else if (m[3]) {
      stack.push([]);
    } else if (m[4]) {
      const group = stack.pop();
      if (!stack.length) throw new Error("Лишняя скобка");
      const mul = m[5] ? +m[5] : 1;
      for (const t of group) t.n *= mul;
      stack[stack.length - 1].push(...group);
    }
  }
  if (stack.length !== 1) throw new Error("Скобки не закрыты");
  return stack[0];
}

function sumTokens(tokens) {
  let s = 0;
  const parts = [];
  for (const t of tokens) {
    const add = ELEMENTS[t.el] * t.n;
    s += add;
    parts.push(`${t.el}${t.n > 1 ? t.n : ""}: ${ELEMENTS[t.el]} × ${t.n} = ${+(add.toFixed(4))}`);
  }
  return { mass: +s.toFixed(4), parts };
}

async function fileToInline(file) {
  const resized = await resizeImage(file, 1600);
  state.lastImage = resized.b64;
  state.lastMime = resized.mime;
  return resized;
}

function resizeImage(file, maxSide) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width, h = img.height;
      if (Math.max(w, h) > maxSide) {
        const k = maxSide / Math.max(w, h);
        w = Math.round(w * k);
        h = Math.round(h * k);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      const mime = "image/jpeg";
      const dataUrl = canvas.toDataURL(mime, 0.85);
      URL.revokeObjectURL(url);
      resolve({ mime, b64: dataUrl.split(",")[1] });
    };
    img.onerror = reject;
    img.src = url;
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function modelQueue() {
  const first = getModel();
  return [first, ...FALLBACK_MODELS.filter((m) => m !== first)];
}

async function geminiOnce(model, key, payload, proxy) {
  let res;
  if (proxy) {
    res = await fetch(proxy.replace(/\/$/, "") + "/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify({ model, payload })
    });
  } else {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
  }
  const raw = await res.text();
  return { ok: res.ok, status: res.status, raw };
}

async function gemini({ text, imageB64, mime }) {
  const key = getKey();
  if (!key) throw new Error("Сначала вставьте API-ключ в Настройки.");

  const payload = {
    contents: [{
      role: "user",
      parts: [
        ...(imageB64 ? [{ inline_data: { mime_type: mime || "image/jpeg", data: imageB64 } }] : []),
        { text }
      ]
    }],
    generationConfig: { temperature: 0.2 }
  };

  const proxy = getProxy();
  const models = modelQueue();
  let lastErr = "";

  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      setStatus(activeStatusEl(), `Gemini: ${model} (попытка ${attempt})…`);
      const { ok, status, raw } = await geminiOnce(model, key, payload, proxy);

      if (ok) {
        const data = JSON.parse(raw);
        const txt = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") || "";
        if (!txt) throw new Error("Пустой ответ модели. Проверьте ключ/лимиты.");
        localStorage.setItem("gemini_model", model);
        return txt;
      }

      lastErr = `Gemini ${status}: ${raw.slice(0, 400)}`;
      if (status === 503 || status === 429) {
        await sleep(1200 * attempt);
        continue;
      }
      if (status === 404) break;
      if (status === 400 || status === 401 || status === 403) throw new Error(lastErr);
      break;
    }
  }

  throw new Error(
    lastErr +
    "\n\nПодождите минуту или в ⚙ выберите gemini-flash-latest / gemini-2.5-flash."
  );
}

function parseJsonLoose(s) {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function renderExplain(el, text) {
  if (!el) return;
  const math = [];
  let src = String(text ?? "").replace(/\r\n/g, "\n");

  src = src.replace(/```[\s\S]*?```/g, (block) => {
    const inner = block.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "");
    const i = math.length;
    math.push({ display: true, tex: inner.trim(), code: true });
    return `@@MATH${i}@@`;
  });
  src = src.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => {
    const i = math.length;
    math.push({ display: true, tex: tex.trim() });
    return `@@MATH${i}@@`;
  });
  src = src.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    const i = math.length;
    math.push({ display: true, tex: tex.trim() });
    return `@@MATH${i}@@`;
  });
  src = src.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => {
    const i = math.length;
    math.push({ display: false, tex: tex.trim() });
    return `@@MATH${i}@@`;
  });
  src = src.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
    const i = math.length;
    math.push({ display: false, tex: tex.trim() });
    return `@@MATH${i}@@`;
  });

  const inline = (t) => escapeHtml(t)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/@@MATH(\d+)@@/g, (_, i) => `<span class="math" data-i="${i}"></span>`);

  const html = [];
  let list = null;
  const flushList = () => {
    if (list) {
      html.push("<ul>" + list.join("") + "</ul>");
      list = null;
    }
  };

  for (const line of src.split("\n")) {
    const t = line.trim();
    if (!t) { flushList(); continue; }
    if (/^---+$/.test(t)) { flushList(); html.push("<hr>"); continue; }
    const h = t.match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      flushList();
      const n = Math.min(h[1].length + 1, 4);
      html.push(`<h${n}>${inline(h[2])}</h${n}>`);
      continue;
    }
    const li = t.match(/^[-*]\s+(.+)$/);
    if (li) {
      if (!list) list = [];
      list.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    flushList();
    html.push(`<p>${inline(line)}</p>`);
  }
  flushList();
  el.innerHTML = html.join("") || "";
  el.querySelectorAll("span.math").forEach((span) => {
    const item = math[+span.dataset.i];
    if (!item) return;
    if (item.code) {
      span.innerHTML = "<pre><code>" + escapeHtml(item.tex) + "</code></pre>";
      return;
    }
    try {
      katex.render(item.tex, span, { throwOnError: false, displayMode: item.display });
    } catch {
      span.textContent = item.tex;
    }
  });
}

async function explainCurrent() {
  const input = $("expr").value.trim() || state.lastInput;
  if (!input) throw new Error("Введите формулу.");
  const exact = state.lastExact || "";
  return gemini({
    text: `Ты репетитор по математике, физике и химии. Объясни по-русски понятно, по шагам.
Формула/задача: ${input}
Точный результат локального калькулятора (ему можно доверять в алгебре): ${exact || "ещё не считали"}
Пиши Markdown: заголовки ###, списки, формулы только в $...$ или $$...$$.
Структура:
### 1) Что это за задача
### 2) Какие формулы/теоремы нужны
### 3) Пошаговое решение
### 4) Как интерпретировать точный ответ
### 5) Частые ошибки
Не выдумывай числа, которые не даны.`
  });
}

async function readHomework(alsoExplain) {
  if (!state.lastImage) throw new Error("Сначала выберите фото.");
  const txt = await gemini({
    imageB64: state.lastImage,
    mime: state.lastMime,
    text: `Это фото школьного/вузовского задания. Верни СТРОГО JSON без markdown:
{
  "subject": "algebra|geometry|physics|chemistry|other",
  "task_text": "распознанный текст",
  "formulas_latex": ["..."],
  "nerdamer_expressions": ["выражения которые можно посчитать в nerdamer, без слов"],
  "unknowns": ["x"],
  "notes": "что видно на чертеже"
}
${alsoExplain ? "После JSON с новой строки дай подробное объяснение решения по-русски в Markdown, формулы в $...$." : "Только JSON."}`
  });
  const json = parseJsonLoose(txt);
  const calcLines = [];
  if (json?.nerdamer_expressions?.length) {
    for (const e of json.nerdamer_expressions) {
      try {
        const r = specialEval(e);
        calcLines.push(`${e}  →  ${r.text}`);
      } catch (err) {
        calcLines.push(`${e}  →  не удалось посчитать (${err.message})`);
      }
    }
  }
  if ((json?.formulas_latex?.length || json?.nerdamer_expressions?.length) && !$("expr").value.trim()) {
    $("expr").value = json.nerdamer_expressions?.[0] || json.task_text || "";
  }
  return { txt, json, calcLines };
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem("formula_history") || "[]"); }
  catch { return []; }
}

function pushHistory(item) {
  const h = getHistory();
  h.unshift({ ...item, t: Date.now() });
  localStorage.setItem("formula_history", JSON.stringify(h.slice(0, 40)));
}

function renderHistory() {
  const h = getHistory();
  const box = $("historyBox");
  if (!h.length) {
    box.innerHTML = '<div class="muted">Пока пусто.</div>';
    return;
  }
  box.innerHTML = h.map((x) =>
    `<div class="history-item"><b>${x.type}</b><div>${escapeHtml(x.input || "")}</div><div class="muted">${escapeHtml(x.output || "")}</div></div>`
  ).join("");
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    ["calc", "photo", "chem", "history"].forEach((t) => {
      $("tab-" + t).classList.toggle("hidden", t !== btn.dataset.tab);
    });
    if (btn.dataset.tab === "history") renderHistory();
  };
});

document.querySelectorAll(".chip").forEach((c) => {
  c.onclick = () => { $("expr").value = c.dataset.ex; };
});

$("calcBtn").onclick = () => {
  try {
    const r = calculate($("expr").value);
    setStatus($("calcStatus"), "Готово: " + r.note, "ok");
  } catch (e) {
    setStatus($("calcStatus"), e.message, "err");
  }
};

$("clearBtn").onclick = () => {
  $("expr").value = "";
  $("exactOut").textContent = "—";
  $("texOut").innerHTML = "";
  $("explainOut").textContent = "";
};

$("explainBtn").onclick = async () => {
  try {
    if ($("expr").value.trim()) {
      try { calculate($("expr").value); } catch {}
    }
    setStatus($("calcStatus"), "Gemini думает… модель " + getModel());
    $("explainOut").textContent = "Запрос к Gemini, модель: " + getModel();
    const t = await explainCurrent();
    renderExplain($("explainOut"), t);
    setStatus($("calcStatus"), "Объяснение готово · " + getModel(), "ok");
    pushHistory({ type: "explain", input: $("expr").value, output: t.slice(0, 200) });
  } catch (e) {
    setStatus($("calcStatus"), e.message, "err");
    $("explainOut").textContent = e.message;
  }
};

$("file").onchange = async (ev) => {
  const f = ev.target.files?.[0];
  if (!f) return;
  const img = $("preview");
  img.src = URL.createObjectURL(f);
  img.style.display = "block";
  try {
    await fileToInline(f);
    setStatus($("photoStatus"), "Фото сжато и готово к отправке.", "ok");
  } catch (e) {
    setStatus($("photoStatus"), e.message, "err");
  }
};

async function runPhoto(explain) {
  try {
    setStatus($("photoStatus"), "Gemini читает фото… модель " + getModel());
    const { txt, json, calcLines } = await readHomework(explain);
    renderExplain(
      $("ocrOut"),
      (json ? `### Предмет\n${json.subject}\n\n${json.task_text || ""}\n\n${json.notes || "—"}\n\n` : "") +
      (calcLines.length ? ("### Локальный точный расчёт\n" + calcLines.map((x) => `* ${x}`).join("\n") + "\n\n") : "") +
      txt
    );
    setStatus($("photoStatus"), "Готово · " + getModel(), "ok");
    pushHistory({
      type: "photo",
      input: json?.task_text || "фото",
      output: (calcLines[0] || "").slice(0, 200)
    });
  } catch (e) {
    setStatus($("photoStatus"), e.message, "err");
  }
}

$("readBtn").onclick = () => runPhoto(false);
$("photoExplainBtn").onclick = () => runPhoto(true);

$("molarBtn").onclick = () => {
  try {
    const f = $("formulaChem").value.trim();
    const r = molarMass(f);
    $("molarOut").textContent = r.mass + " г/моль";
    $("molarNote").textContent = r.parts.join(" · ");
    $("expr").value = `молярная масса ${f} = ${r.mass}`;
    state.lastExact = String(r.mass);
    state.lastInput = `Молярная масса ${f}`;
    pushHistory({ type: "chem", input: f, output: r.mass + " г/моль" });
  } catch (e) {
    $("molarOut").textContent = "ошибка";
    $("molarNote").textContent = e.message;
  }
};

$("chemExplainBtn").onclick = async () => {
  try {
    const f = $("formulaChem").value.trim();
    const r = molarMass(f);
    $("molarOut").textContent = r.mass + " г/моль";
    const t = await gemini({
      text: `Объясни по-русски расчёт молярной массы ${f}. Локальный точный результат: ${r.mass} г/моль. Разбор: ${r.parts.join("; ")}. Markdown, формулы в $...$. Кратко напомни, что такое моль.`
    });
    renderExplain($("explainOut"), t);
    document.querySelector('[data-tab="calc"]').click();
  } catch (e) {
    $("molarNote").textContent = e.message;
  }
};

$("settingsBtn").onclick = () => {
  loadSettings();
  $("settingsModal").classList.add("open");
};
$("closeSettings").onclick = () => $("settingsModal").classList.remove("open");
$("saveSettings").onclick = saveSettings;
$("settingsModal").addEventListener("click", (e) => {
  if (e.target.id === "settingsModal") e.target.classList.remove("open");
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

loadSettings();
if (!getKey()) {
  setStatus($("calcStatus"), "Откройте ⚙ и вставьте ключ Gemini — без него работают только точные расчёты.", "");
} else {
  setStatus($("calcStatus"), "Модель: " + getModel(), "ok");
}