# Формула — шпаргалка для продолжения разработки

- PWA: точный калькулятор в браузере (JS + nerdamer) + Google Gemini (объяснения и фото заданий).
- Хостинг: GitHub Pages. 
- Локальную модель не ставим — ПК слабый, ИИ облачный.

## Ссылки 

- Репозиторий: `https://github.com/alpenuga/formula-ai`
- Сайт: `https://alpenuga.github.io/formula-ai/`
- Cloudflare Worker (прокси, если CORS): `https://….workers.dev` (поле «Прокси URL» в ⚙)
- Ключ Gemini: **только** в ⚙ приложения (`localStorage`), не в git
- Cloudflare Worker Proxy: `https://formula-proxy.ВАШ_АККАУНТ.workers.dev`

## Файлы
- index.html
- style.css
- app.js
- manifest.json
- sw.js
- icon.svg
- README.md
- CONTINUE.md

CDN: KaTeX 0.16.11, nerdamer 1.1.13 (core + Algebra + Calculus + Solve).

## Gemini

Вызывать: `v1beta` `generateContent`.

Рабочие модели **из списка ключа пользователя** (без префикса `models/`):

| Ставить | Зачем |
|---|---|
| `gemini-flash-latest` | основная, уже отвечала |
| `gemini-3.8-flash` | запас |
| `gemini-3.5-flash` | запас |
| `gemini-2.5-flash` | стабильная |
| `gemini-flash-lite-latest` | если 503 / лимиты |
| `gemini-3.1-flash-lite` | lite |

Не ставить:

- `gemini-2.0-flash` — снята (404)
- `gemini-3-flash` — нет в v1beta (есть только preview)
- TTS, `*-image`, Lyria, antigravity, deep-research

Алиасы старых имён в `app.js` → `gemini-flash-latest`.

Ошибки:

- **404** — мёртвое имя модели или кэш SW со старым `app.js`
- **503** — перегруз Google, retry + fallback по списку моделей
- **CORS** с GitHub Pages / `file://` — Cloudflare Worker, ключ в заголовке `x-api-key`

Объяснения **не** через `textContent`, а `renderExplain()` (Markdown + KaTeX: `###`, `**`, `$...$`, `$$...$$`).

После правок JS: в `sw.js` поднять `CACHE` (`formula-ai-vN`), Unregister SW, Ctrl+F5.

## Как запускать

1. GitHub Pages — основной режим.
2. С папки: калькулятор часто работает; ИИ обычно только через прокси.
3. `python -m http.server 8080` из папки — лучше чем `file://`.

PWA «на экран Домой» нормально только с HTTPS (Pages).

## Локальный движок (`app.js`)

Точка входа: `specialEval` → `calculate`.

Важные функции:

- `wrapResult`, `safeToText`, `safeToTeX` — не вызывать `.toTeX()` вслепую (иначе `val.toTeX is not a function`)
- `namedSchool` — команды `heron`, `pythag`, `circle`, `sphere_v`, …
- `jsFact` / `jsComb` / `jsPerm` — **не** nerdamer `fact` (он оставляет `factorial(5)` / `5!`)
- неравенства: `solveInequality` → `intervalMethod`
- дробь: `unwrapParens` + `splitFrac` (не `nerdamer numerator/denominator` — у многочлена был ложный полюс 0)
- `hasX` — не считать знаменатель `1` полюсом
- химия: `tokenizeFormula` + `ELEMENTS` (скобки `Fe2(SO4)3` работают)

Синтаксис физики: `F=m*a | m=2; a=9.8` (палка `|` и `;` между подстановками).

Чипы в `index.html` только подставляют текст. Без `app.js` неравенства не считаются.

## Проверенные ответы (регрессия)

| Ввод | Ожидается |
|---|---|
| `x^2+x-30<0` | `(-6; 5)` |
| `x^2+x-30<=0` | `[-6; 5]` |
| `(x-1)/(x+2)>0` | `(-∞; -2) ∪ (1; +∞)` |
| `(x-1)/(x+2)>=0` | `(-∞; -2) ∪ [1; +∞)` |
| `F=m*a \| m=2; a=9.8` | `19.6` = `98/5` |
| `Fe2(SO4)3` (вкладка Химия) | `399.858` г/моль (таблица `ELEMENTS`; школа часто ждёт 400) |
| `fact(5)` | `120` (если `jsFact`; иначе баг `factorial(5)`) |
| `C(10,3)` | `120` |
| `sqrt(8)+1/3` | точное, не float-мусор |
| `1<x<=5` | `(1; 5]` |
| `(x^2-4)/(x-2)<=0` | `(-∞; -2]` (x=2 выколота) |

Дополнительные тесты (часть может ещё врать — чинить по факту):

| Ввод | Правильно |
|---|---|
| `-x^2+4>0` | `(-2; 2)` |
| `(x-3)^2<=0` | `{3}` |
| `(x-3)^2>0` | `(-∞; 3) ∪ (3; +∞)` |
| `x^2+5<0` | `∅` |
| `x^2+5>0` | все x |
| `(x-2)/((x-1)*(x+3))<=0` | `(-∞; -3) ∪ (1; 2]` |
| `(x^2-4)/(x-2)<=0` | `(-∞; -2]` (x=2 выколота) |
| `(x-1)/(x+2)>1` | `(-∞; -2)` (справа не 0 — частый баг) |
| `abs(2*x-4)>=6` | `(-∞; -1] ∪ [5; +∞)` |
| `abs(x+5)<-2` | `∅` |
| `abs(x-4)<=0` | `x=4` |
| `x^3-6*x^2+11*x-6=0` | `1, 2, 3` |
| `gcd(48,18)` | `6` |
| `lcm(12,18)` | `36` |
| `pythag(5,12)` | `13` |
| `arithsum(2,3,10)` | `155` |
| `1<x<=5` | `(1; 5]` |

Не обещать точный JS-интервал: триг. неравенства, лог/показательные с ОДЗ, параметры, системы. Это «Объяснить ИИ».

## Баги, которые уже чинили

1. `gemini-2.0-flash` / `gemini-3-flash` → 404. Кэш SW держал старый JS.
2. 503 high demand — retry + другие flash.
3. Сырой Markdown `###` и `$x^2$` — нужен `renderExplain`.
4. Неравенства роняли калькулятор: `val.toTeX is not a function`.
5. `denominator()` у многочлена → ложный полюс 0 → `(-6;0)∪(0;5)` вместо `(-6;5)`.
6. `splitFrac` не видел `/` внутри лишних скобок после `(f)-(0)` → дробь без полюса `-2`.
7. nerdamer `fact` не вычисляет число.
8. Молярная масса 399.858 vs школьные 400 — разные атомные массы, не баг скобок.
9. Двойное неравенство `1<x<=5` считалось верно, но печаталось как
   `(1; +∞) ∩ (-∞; 5]` без склейки. Нужны хелперы
   `intersectIntervalStrings` / `parseIntervalStr` и ветка `if (dbl)`
   в `solveInequality`, чтобы в результате было `(1; 5]`.
   Нельзя обрезать `solveInequality` на `note: "Двойное…"`.

## Worker (если нужен)

PWA POST на `{proxy}/gemini` с `{ model, payload }` и заголовком `x-api-key`.
Worker не хранит ключ. Дефолт модели не должен быть `gemini-2.0-flash`.

## Как просить помощь в новом чате

Написать:

> Продолжаем PWA «Формула» (калькулятор nerdamer + Gemini). Код на GitHub: …  
> Читай CONTINUE.md. Сломалось: … Скрин / текст ошибки: …

Приложить кусок `app.js` или ссылку на файл. Ключ API не слать.
