# AGENTS.md

## Commands
- Install: `npm install`
- Run: `npm start`
- Lint: not configured
- Tests: `npm test`
- Tests (PostgreSQL): `npm run test:pg`
- Single test: `npm test -- tests/helpers.test.js`

## Project layout
- `src/index.js` bot + Fastify webhook server
- `src/storage.js` SQLite/PostgreSQL storage
- `.env` local secrets, `.env.example` template
- `data/registry.sqlite` runtime data (SQLite)

## Env
- `BOT_TOKEN` Telegram token
- `PUBLIC_URL` HTTPS webhook base URL
- `WEBHOOK_PATH` default `/telegram-webhook`
- `PORT` default `3000`
- `JAR_URL` default jar link (required)
- `SQLITE_PATH` default `./data/registry.sqlite`
- `DATABASE_URL` PostgreSQL connection string (optional)

## Behavior
- Webhook URL: `${PUBLIC_URL}${WEBHOOK_PATH}` (normalize trailing slash)
- `/raffle` group/supergroup only; `/register` works in private + group
- Auto-register on any group message unless user opted out
- `/eject` opt-outs user from auto-register
- Winner increments `wins`; `/stats` shows top 10
- Donation amount random 10..100 UAH, includes link in winner message

## Code style
- ES modules, `import`/`export` only
- 2-space indent, double quotes, semicolons
- Prefer `const`, early returns, small helpers
- External imports before local imports
- `camelCase` functions/vars, `PascalCase` types/classes

## Error handling
- Fail fast on missing `BOT_TOKEN`/`PUBLIC_URL`
- Log storage write errors
- `bot.catch` logs grammY/HTTP errors

## Notes
- User-facing text is Ukrainian
- Emojis used mainly in raffle flow
- No `.cursor/rules`, `.cursorrules`, or Copilot instructions found
