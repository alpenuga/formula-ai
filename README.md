# formula-ai

PWA: точный калькулятор в браузере (nerdamer) + Google Gemini читает фото заданий и объясняет.

## Как открыть

GitHub → Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)` → Save.

Сайт: `https://ВАШ_ЛОГИН.github.io/formula-ai/`

## Ключ

1. https://aistudio.google.com/apikey
2. В приложении ⚙ вставьте ключ. Он хранится только в вашем браузере.

## Если ошибка CORS

Прямой вызов Gemini из GitHub Pages часто блокируется. Тогда:

1. https://dash.cloudflare.com → Workers & Pages → Create → Worker
2. Вставьте код из раздела ниже, Deploy
3. Скопируйте URL вида `https://formula-proxy.ВАШ_НИК.workers.dev`
4. Вставьте его в Настройки приложения в поле «Прокси URL»

Worker не хранит ваш ключ: браузер присылает его заголовком `x-api-key`.