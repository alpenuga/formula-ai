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

const DEFAULT_MODEL = "gemini-3.8-flash";
const ALLOWED_MODELS = [
  "gemini-3.8-flash",
  "gemini-3-flash",
  "gemini-flash-latest"
];
const MODEL_ALIASES = {
  "gemini-2.0-flash": DEFAULT_MODEL,
  "gemini-2.0-flash-lite": DEFAULT_MODEL,
  "gemini-1.5-flash": DEFAULT_MODEL,
  "gemini-1.5-pro": DEFAULT_MODEL,
  "gemini-2.5-flash": DEFAULT_MODEL,
  "gemini-2.5-pro": DEFAULT_MODEL
};

const state = {
  lastExact: "",
  lastInput: "",
  lastImage: null,
  lastMime: "image/jpeg"
};

function resolveModel(name) {
  const raw = String(name || "").trim();
  const mapped = MODEL_ALIASES[raw] || raw || DEFAULT_MODEL;
  if (ALLOWED_MODELS.includes(mapped)) return mapped;
  return DEFAULT_MODEL;
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

function setStatus(el, msg, type = "") {
  el.textContent = msg;
  el.className = "status " + type;
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

function specialEval(raw) {
  const s = raw.trim();
  const heronM = s.match(/^heron\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i);
  if (heronM) {
    const val = heron(heronM[1], heronM[2], heronM[3]);
    return { exact: val.toTeX(), text: val.toString(), note: "Площадь треугольника по формуле Герона" };
  }
  const circ = s.match(/^circle\s*\(\s*([^)]+)\s*\)$/i);
  if (circ) {
    const val = nerdamer(`pi*(${circ[1]})^2`);
    return { exact: val.toTeX(), text: val.toString(), note: "Площадь круга πr² (символьно)" };
  }
  const phys = s.split("|");
  if (phys.length === 2 && phys[0].includes("=")) {
    const expr = phys[0].trim();
    const assigns = phys[1].split(";").map((x) => x.trim()).filter(Boolean);
    let e = nerdamer(expr);
    for (const a of assigns) {
      const [k, v] = a.split("=").map((x) => x.trim());
      e = e.sub(k, v);
    }
    const right = e.text().split("=")[1] || e.text();
    const val = nerdamer(right);
    return { exact: val.toTeX(), text: val.toString(), note: "Подстановка значений в формулу" };
  }
  if (/solve\s*\(/i.test(s) || (/=/.test(s) && /x/.test(s))) {
    let cmd = s;
    if (!/^solve/i.test(s)) cmd = `solve(${s}, x)`;
    const val = nerdamer(cmd);
    return { exact: val.toTeX(), text: val.toString(), note: "Решение уравнения (символьно)" };
  }
  if (/simplify\s*\(/i.test(s)) {
    const val = nerdamer(s);
    return { exact: val.toTeX(), text: val.toString(), note: "Упрощение" };
  }
  const val = nerdamer(s).expand().simplify();
  return { exact: val.toTeX(), text: val.toString(), note: "Точное символьное вычисление (nerdamer)" };
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

async function gemini({ text, imageB64, mime }) {
  const key = getKey();
  if (!key) throw new Error("Сначала вставьте API-ключ в Настройки.");
  const model = getModel();
  if (String(model).includes("2.0-flash") || String(model).includes("1.5-flash")) {
    throw new Error("Старая модель в кэше. Обновите страницу Ctrl+F5 и снова Сохраните настройки.");
  }
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
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = await res.json();
  const txt = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") || "";
  if (!txt) throw new Error("Пустой ответ модели. Проверьте ключ/модель/лимиты.");
  return txt;
}

function parseJsonLoose(s) {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function explainCurrent() {
  const input = $("expr").value.trim() || state.lastInput;
  if (!input) throw new Error("Введите формулу.");
  const exact = state.lastExact || "";
  return gemini({
    text: `Ты репетитор по математике, физике и химии. Объясни по-русски понятно, по шагам.
Формула/задача: ${input}
Точный результат локального калькулятора (ему можно доверять в алгебре): ${exact || "ещё не считали"}
Структура:
1) Что это за задача
2) Какие формулы/теоремы нужны
3) Пошаговое решение
4) Как интерпретировать точный ответ (дроби, корни, π)
5) Частые ошибки
Не выдумывай числа, которые не даны. Формулы можно писать в LaTeX $...$.`
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
${alsoExplain ? "После JSON с новой строки дай подробное объяснение решения по-русски." : "Только JSON."}`
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
  if (json?.formulas_latex?.length && !$("expr").value.trim()) {
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
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
    $("explainOut").textContent = t;
    setStatus($("calcStatus"), "Объяснение готово", "ok");
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
    $("ocrOut").textContent =
      (json ? `Предмет: ${json.subject}\n\n${json.task_text}\n\nЗаметки: ${json.notes || "—"}\n\n` : "") +
      (calcLines.length ? ("Локальный точный расчёт:\n" + calcLines.join("\n") + "\n\n") : "") +
      txt;
    setStatus($("photoStatus"), "Готово", "ok");
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
      text: `Объясни по-русски расчёт молярной массы ${f}. Локальный точный результат: ${r.mass} г/моль. Разбор: ${r.parts.join("; ")}. Кратко напомни, что такое моль и как это применяют в задачах.`
    });
    $("explainOut").textContent = t;
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