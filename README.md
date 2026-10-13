<div align="center">

# SkinScout API

**Prices, buy orders, float finds and inventory valuation across CS2 skin markets.**

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![TypeORM](https://img.shields.io/badge/TypeORM-1-FE0803?logo=typeorm&logoColor=white)](https://typeorm.io/)
[![Swagger](https://img.shields.io/badge/OpenAPI-Swagger-85EA2D?logo=swagger&logoColor=black)](https://swagger.io/)
[![Jest](https://img.shields.io/badge/Tested_with-Jest-C21325?logo=jest&logoColor=white)](https://jestjs.io/)

[Frontend repository](https://github.com/bohdanhora/skins-front) · [Live application](https://skins-front-production.up.railway.app)

</div>

## Overview

SkinScout API is a NestJS REST service that finds profitable CS2 skins on
[white.market](https://white.market), [DMarket](https://dmarket.com), [CSFloat](https://csfloat.com),
[lis-skins](https://lis-skins.com) and [Steam Market](https://steamcommunity.com/market/). It collects
prices and buy orders, scans lots by float, pattern and phase, values Steam inventories after fees and
stores accounts, purchases and favorite sets in PostgreSQL.

The first price collection takes about a minute. After that prices stay in memory, refresh every
`PRICES_REFRESH_MINUTES` minutes and are saved to `.cache/`, so a restart shows everything right away.

## Core capabilities

- **Price board** - the lowest price, lot count and best buy order of every item on every market.
- **Deals** - where an item is cheaper, what can be resold after fees and what sells straight to a
  DMarket buy order.
- **Top offers** - current price against eight weeks of sales, with liquidity, depth and trend.
- **Float finds** - a background scanner that matches lots to pricier buy orders by float, pattern or
  phase.
- **Stickers** - skins that already carry the wanted stickers, sorted by how little they add to the
  price.
- **Inventory** - payout of every item on every market after selling and withdrawal fees.
- **Trade-ups, purchases and favorites** - contract math, purchase history and saved item sets.
- **Betting** - upcoming matches of major tournaments with a map-by-map model against bookmaker odds.
- **Assistant** - optional, on the provider key each user connects. Keys are encrypted with
  `ENCRYPTION_KEY`, and all numbers are still calculated by the service.
- **Localization** - errors and assistant answers follow the `Accept-Language` header, `en` by default
  and `ru`.

## Tech stack

| Area              | Technology                                          |
| ----------------- | --------------------------------------------------- |
| Runtime framework | NestJS 11, Node.js 20+, TypeScript                  |
| Database          | PostgreSQL 17, TypeORM, migrations applied on start |
| API documentation | OpenAPI through `@nestjs/swagger`                   |
| Authentication    | Steam OpenID, optional app password                 |
| Validation        | class-validator, class-transformer                  |
| Security          | helmet, CORS allowlist, throttling                  |
| Logging           | pino through nestjs-pino                            |
| Testing           | Jest, ts-jest                                       |

## Getting started

```bash
cp .env.example .env
docker compose up -d
npm install
npm run dev
```

The API runs on `http://localhost:4100/api`, Swagger on `http://localhost:4100/api/docs`. Docker
Compose starts PostgreSQL on port 5433.

## Accounts and database

Accounts and purchases are stored in PostgreSQL (`DATABASE_URL`). Migrations are applied on start.

Sign-in works only through Steam (OpenID). Steam returns the user to
`PUBLIC_API_URL/api/auth/steam/return`, and the API sends them to `FRONTEND_URL/auth` with a session
token. On Railway add PostgreSQL and set `DATABASE_URL`, `PUBLIC_API_URL` (the public API address
without `/api`) and `FRONTEND_URL`. When the database is reached over an external address with SSL,
set `DATABASE_SSL=true`.

When `APP_PASSWORD` is set, every request except the access check needs a token issued for that
password.

`ADMIN_API_KEY` (at least 32 characters) opens `GET /api/admin/stats`, `GET /api/admin/users`,
`GET /api/admin/users/:id` and `DELETE /api/admin/users/:id` for the admin panel, which sends the key in the `X-Admin-Key` header.
Without the key these routes answer `404`.

## Price sources

| Data                                   | Source                                                                     | Key |
| -------------------------------------- | -------------------------------------------------------------------------- | --- |
| Lowest price on white.market           | `export.white.market/v1/prices/730.json`                                   | No  |
| Price and best buy order on DMarket    | `POST /marketplace-api/v1/aggregated-prices`, 200 names per request        | No  |
| Lowest price and lot count on CSFloat  | CSFloat API `GET /v1/listings/price-list`                                  | No  |
| Daily sales history on DMarket         | `GET /trade-aggregator/v1/avg-sales-graph`                                 | No  |
| Every DMarket lot with float and order | `GET /marketplace-api/v1/market-depth`                                     | No  |
| Images, rarity, collections            | [ByMykel/CSGO-API](https://github.com/ByMykel/CSGO-API)                    | No  |
| Lots with float and stickers           | white.market, DMarket and CSFloat APIs                                     | Yes |
| Skin search by stickers                | APIs of all three markets                                                  | Yes |
| CSFloat lots with exact float          | CSFloat API `GET /v1/listings`                                             | Yes |
| Steam lots with float and pattern      | Steam Market server-side listings                                          | No  |
| Price and lot count on lis-skins       | `lis-skins.com/market_export_json/csgo.json`                               | No  |
| DMarket prices by Doppler phase        | DMarket `market-depth`, every lot and order carries its phase              | No  |
| DMarket sales by phase                 | `avg-sales-graph` with `filters=phase[]=...`                               | No  |
| Daily CSFloat sales                    | CSFloat API `GET /v1/history/{name}/graph` (`paint_index` for the phase)   | Yes |
| Daily white.market sales               | Site GraphQL `market_stats_product`, phase by name (`Sapphire`)            | No  |
| Steam price in USD                     | `steamcommunity.com/market/priceoverview`                                  | No  |
| Steam inventory                        | `steamcommunity.com/inventory/{steamid}/730/2`, the profile must be public | No  |

white.market and CSFloat refresh their price lists on their own. DMarket answers with fresh data on
every request.

## Keys (optional)

Price comparison works without keys. Keys unlock skin search by stickers and the individual lots in
the item card.

- **white.market** - profile, Partner token section. The value goes to `WHITE_MARKET_PARTNER_TOKEN`.
  The server exchanges it for an access token (valid for 24 hours) and renews it.
- **DMarket** - account settings, Trading API, generate keys. The public key goes to
  `DMARKET_PUBLIC_KEY`, the private one to `DMARKET_SECRET_KEY` (both hex). Requests are signed with
  Ed25519.
- **CSFloat** - API key from the account settings in `CSFLOAT_API_KEY`.
- **Betting** - `ODDSPAPI_API_KEY` for odds and `PANDASCORE_API_TOKEN` for the match schedule.

Market keys are read only: the server never buys or lists anything.

## How profit is calculated

All money is kept in USD cents.

- **Where cheaper** - the gap to the next cheapest market, not to the most expensive one, so a single
  overpriced lot does not produce a fake discount. Shown as a share of the higher price.
- **Resell** - buy on the cheaper market, list on another one cent below everyone, minus the seller
  fee.
- **Sell instantly** - buy on white.market and sell to the best DMarket buy order, minus the DMarket
  fee.
- **Top offers** - the current lowest price against the market. The market is the smaller of two
  values: the lower quarter of daily average DMarket sale prices or the price on the second market.
  Rare floats and patterns inflate the average sale price, so the lower quarter is used, and the
  second market keeps the discount from looking bigger than it is. The signal weighs the discount,
  buy order coverage, sales over eight weeks, depth and the weekly trend.
- **Float finds** - a background scanner reads the DMarket order book of every skin with buy orders
  (about 12 thousand) and looks for lots that already fit a pricier order by float group, pattern or
  phase. Matching white.market and CSFloat lots are checked too. Order quantity counts: an order for 3
  items only gets the 3 cheapest matching lots. Profit is net of the DMarket fee.
- **Rate limit** - every DMarket request goes through a shared limiter
  (`DMARKET_REQUESTS_PER_SECOND`), and interface requests always go ahead of background scanners.
- **Float** - DMarket shows every lot with float and pattern publicly, so range search works without a
  key. Without a key white.market only reveals the float of its cheapest lot. CSFloat requires a key.
  Steam is shown separately, because wallet balance and cash USD are not the same currency.
- **Phases** - Ruby, Sapphire, Emerald, Black Pearl and Phase 1-4 are indexed as separate variants on
  every market. DMarket phase prices come from the order book, and orders for one phase never affect
  the price of another. Sales history of a plain Doppler is built from Phase 1-4 without the rare
  phases. CSFloat returns a price list without phases, so phases are read from lots in the
  background. The generic Doppler card is left out of the results.
- **Inventory** - `GET /inventory?profile=...` calculates the payout of every item on every market:
  one cent below the cheapest lot, minus the seller fee, minus the withdrawal fee
  (`withdrawWhiteMarket`, `withdrawDmarket`, `withdrawCsfloat`). Selling to a DMarket buy order is
  shown separately.
- **lis-skins** is a buying market only: resale and inventory valuation never suggest selling there.
- **Skins with stickers** - `GET /stickers/skins?stickers=...&item=...&sort=deal`. `item` is the exact
  name or part of it. For every lot the service calculates the extra cost over the cheapest identical
  skin and its share of the price of the wanted stickers (`overpayShare`), which `deal` sorts by.
  DMarket filters by sticker name without the `Sticker | ` prefix.

Fees come from the frontend (`feeWhiteMarket`, `feeDmarket`, in percent), 5% by default.

## Project structure

```text
src
  common         cache, encryption, error filters, HTTP helpers, request locale
  config         environment validation and typed configuration
  domain         framework-free price, float, phase, trade-up and betting math
  migrations     TypeORM migrations
  modules        markets, prices, items, floats, stickers, inventory, purchases, betting, assistant
```

## Scripts

| Script               | Purpose                     |
| -------------------- | --------------------------- |
| `npm run dev`        | Start in watch mode         |
| `npm run build`      | Compile to `dist`           |
| `npm run start:prod` | Run the compiled build      |
| `npm run lint`       | ESLint                      |
| `npm run typecheck`  | TypeScript without emitting |
| `npm test`           | Unit tests                  |

## Author

Created by [Bohdan Hora](https://github.com/bohdanhora).
