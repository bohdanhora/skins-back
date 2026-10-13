import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, MoreThanOrEqual, Not, Repository } from 'typeorm';

import { SessionEntity } from '../auth/session.entity';
import { UserEntity } from '../auth/user.entity';
import { FavoriteSetEntity } from '../favorites/favorite-set.entity';
import { FavoriteEntity } from '../favorites/favorite.entity';
import { PurchaseEntity } from '../purchases/purchase.entity';
import type { MarketFees } from '../settings/user-settings.entity';
import { UserSettingsEntity } from '../settings/user-settings.entity';
import type {
  AdminField,
  AdminStats,
  AdminTable,
  AdminUserDetail,
  AdminUserList,
  AdminUserSummary,
} from './admin.contract';
import type { AdminUsersQueryDto } from './dto/admin-users-query.dto';

const DAY_MS = 86_400_000;
const RECENT_ROWS = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);

const usd = (cents: number | null | undefined): number | null =>
  cents === null || cents === undefined ? null : Math.round(cents) / 100;

const isoDateTime = (value: Date | null | undefined): string | null =>
  value ? value.toISOString() : null;

const fees = (value: MarketFees | null): string | null =>
  value
    ? `white.market ${value.whiteMarket}%, DMarket ${value.dmarket}%, CSFloat ${value.csfloat}%`
    : null;

const toSummary = (user: UserEntity): AdminUserSummary => ({
  id: user.id,
  email: null,
  name: user.name ?? user.steamId,
  createdAt: user.createdAt.toISOString(),
  lastActiveAt: isoDateTime(user.lastLoginAt),
  authMethods: ['steam'],
});

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(SessionEntity) private readonly sessions: Repository<SessionEntity>,
    @InjectRepository(PurchaseEntity) private readonly purchases: Repository<PurchaseEntity>,
    @InjectRepository(FavoriteEntity) private readonly favorites: Repository<FavoriteEntity>,
    @InjectRepository(FavoriteSetEntity)
    private readonly favoriteSets: Repository<FavoriteSetEntity>,
    @InjectRepository(UserSettingsEntity)
    private readonly settings: Repository<UserSettingsEntity>,
  ) {}

  async getStats(): Promise<AdminStats> {
    const weekAgo = daysAgo(7);
    const [total, new7d, new30d, active7d, purchases, sold, favorites, favoriteSets, invested] =
      await Promise.all([
        this.users.count(),
        this.users.count({ where: { createdAt: MoreThanOrEqual(weekAgo) } }),
        this.users.count({ where: { createdAt: MoreThanOrEqual(daysAgo(30)) } }),
        this.users.count({ where: { lastLoginAt: MoreThanOrEqual(weekAgo) } }),
        this.purchases.count(),
        this.purchases.count({ where: { soldAt: Not(IsNull()) } }),
        this.favorites.count(),
        this.favoriteSets.count(),
        this.purchases
          .createQueryBuilder('purchase')
          .select('COALESCE(SUM(purchase.price * purchase.amount), 0)', 'cents')
          .getRawOne<{ cents: string }>(),
      ]);

    return {
      users: { total, new7d, new30d, active7d },
      metrics: [
        { label: 'Purchases', value: purchases, kind: 'number' },
        { label: 'Sold', value: sold, kind: 'number' },
        { label: 'Invested, USD', value: usd(Number(invested?.cents ?? 0)), kind: 'number' },
        { label: 'Favorites', value: favorites, kind: 'number' },
        { label: 'Favorite sets', value: favoriteSets, kind: 'number' },
      ],
    };
  }

  async listUsers(query: AdminUsersQueryDto): Promise<AdminUserList> {
    const builder = this.users.createQueryBuilder('user').orderBy('user.createdAt', 'DESC');

    if (query.search) {
      const pattern = `%${query.search.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
      const conditions = ['user.name ILIKE :pattern', 'user.steamId ILIKE :pattern'];

      if (UUID_PATTERN.test(query.search)) {
        conditions.push('user.id = :id');
      }

      builder.where(`(${conditions.join(' OR ')})`, { pattern, id: query.search });
    }

    const [users, total] = await builder.take(query.limit).skip(query.offset).getManyAndCount();

    return {
      items: users.map(toSummary),
      meta: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + query.limit < total,
      },
    };
  }

  async getUser(id: string): Promise<AdminUserDetail> {
    const user = await this.users.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const now = new Date();
    const [
      settings,
      sessions,
      activeSessions,
      purchases,
      purchaseCount,
      favorites,
      favoriteCount,
      sets,
      setCount,
    ] = await Promise.all([
      this.settings.findOne({ where: { userId: id } }),
      this.sessions.find({
        where: { userId: id },
        order: { createdAt: 'DESC' },
        take: RECENT_ROWS,
        select: { id: true, createdAt: true, expiresAt: true },
      }),
      this.sessions.count({ where: { userId: id, expiresAt: MoreThan(now) } }),
      this.purchases.find({
        where: { userId: id },
        order: { boughtAt: 'DESC' },
        take: RECENT_ROWS,
      }),
      this.purchases.count({ where: { userId: id } }),
      this.favorites.find({
        where: { userId: id },
        order: { createdAt: 'DESC' },
        take: RECENT_ROWS,
      }),
      this.favorites.count({ where: { userId: id } }),
      this.favoriteSets.find({
        where: { userId: id },
        order: { createdAt: 'DESC' },
        take: RECENT_ROWS,
      }),
      this.favoriteSets.count({ where: { userId: id } }),
    ]);

    const totals = await this.purchases
      .createQueryBuilder('purchase')
      .select('COALESCE(SUM(purchase.price * purchase.amount), 0)', 'invested')
      .addSelect(
        'COALESCE(SUM(purchase.soldReceived) FILTER (WHERE purchase.soldAt IS NOT NULL), 0)',
        'received',
      )
      .addSelect(
        'COALESCE(SUM(purchase.price * purchase.amount) FILTER (WHERE purchase.soldAt IS NOT NULL), 0)',
        'soldCost',
      )
      .addSelect('COUNT(*) FILTER (WHERE purchase.soldAt IS NULL)', 'open')
      .where('purchase.userId = :id', { id })
      .getRawOne<{ invested: string; received: string; soldCost: string; open: string }>();

    const received = Number(totals?.received ?? 0);
    const soldCost = Number(totals?.soldCost ?? 0);

    const account: AdminField[] = [
      { label: 'ID', value: user.id },
      { label: 'Steam ID', value: user.steamId },
      { label: 'Steam profile', value: `https://steamcommunity.com/profiles/${user.steamId}` },
      { label: 'Name', value: user.name },
      { label: 'Avatar', value: user.avatar },
      { label: 'Registered', value: user.createdAt.toISOString(), kind: 'datetime' },
      { label: 'Last sign-in', value: user.lastLoginAt.toISOString(), kind: 'datetime' },
      { label: 'Active sessions', value: activeSessions, kind: 'number' },
    ];

    const settingsFields: AdminField[] = settings
      ? [
          { label: 'Market fees', value: fees(settings.fees) },
          { label: 'Withdrawal fees', value: fees(settings.withdrawals) },
          { label: 'Steam profile', value: settings.steamProfile },
          { label: 'Theme', value: settings.theme },
          { label: 'Updated', value: settings.updatedAt.toISOString(), kind: 'datetime' },
        ]
      : [{ label: 'Settings', value: 'Defaults' }];

    const portfolio: AdminField[] = [
      { label: 'Purchases', value: purchaseCount, kind: 'number' },
      { label: 'Open', value: Number(totals?.open ?? 0), kind: 'number' },
      { label: 'Invested, USD', value: usd(Number(totals?.invested ?? 0)), kind: 'number' },
      { label: 'Received from sales, USD', value: usd(received), kind: 'number' },
      { label: 'Realized profit, USD', value: usd(received - soldCost), kind: 'number' },
      { label: 'Favorites', value: favoriteCount, kind: 'number' },
      { label: 'Favorite sets', value: setCount, kind: 'number' },
    ];

    const purchasesTable: AdminTable = {
      columns: [
        { key: 'bought', label: 'Bought', kind: 'datetime' },
        { key: 'name', label: 'Item' },
        { key: 'market', label: 'Market' },
        { key: 'price', label: 'Price, USD', kind: 'number' },
        { key: 'amount', label: 'Qty', kind: 'number' },
        { key: 'float', label: 'Float', kind: 'number' },
        { key: 'seed', label: 'Seed', kind: 'number' },
        { key: 'soldMarket', label: 'Sold on' },
        { key: 'received', label: 'Received, USD', kind: 'number' },
        { key: 'soldAt', label: 'Sold', kind: 'datetime' },
        { key: 'note', label: 'Note' },
      ],
      rows: purchases.map((purchase) => ({
        bought: purchase.boughtAt.toISOString(),
        name: purchase.name,
        market: purchase.market,
        price: usd(purchase.price),
        amount: purchase.amount,
        float: purchase.float === null ? null : Number(purchase.float.toFixed(6)),
        seed: purchase.paintSeed,
        soldMarket: purchase.soldMarket,
        received: usd(purchase.soldReceived),
        soldAt: isoDateTime(purchase.soldAt),
        note: purchase.note || null,
      })),
      total: purchaseCount,
    };

    const favoritesTable: AdminTable = {
      columns: [
        { key: 'name', label: 'Item' },
        { key: 'added', label: 'Added', kind: 'datetime' },
      ],
      rows: favorites.map((favorite) => ({
        name: favorite.name,
        added: favorite.createdAt.toISOString(),
      })),
      total: favoriteCount,
    };

    const setsTable: AdminTable = {
      columns: [
        { key: 'name', label: 'Set' },
        { key: 'items', label: 'Items', kind: 'number' },
        { key: 'updated', label: 'Updated', kind: 'datetime' },
      ],
      rows: sets.map((set) => ({
        name: set.name,
        items: set.items?.length ?? 0,
        updated: set.updatedAt.toISOString(),
      })),
      total: setCount,
    };

    const sessionsTable: AdminTable = {
      columns: [
        { key: 'created', label: 'Issued', kind: 'datetime' },
        { key: 'expires', label: 'Expires', kind: 'datetime' },
        { key: 'state', label: 'State' },
      ],
      rows: sessions.map((session) => ({
        created: session.createdAt.toISOString(),
        expires: session.expiresAt.toISOString(),
        state: session.expiresAt > now ? 'active' : 'expired',
      })),
      total: sessions.length,
    };

    return {
      user: toSummary(user),
      sections: [
        { key: 'account', title: 'Account', fields: account },
        { key: 'portfolio', title: 'Portfolio', fields: portfolio },
        { key: 'settings', title: 'Settings', fields: settingsFields },
        { key: 'purchases', title: 'Purchases', table: purchasesTable },
        { key: 'favorites', title: 'Favorites', table: favoritesTable },
        { key: 'favorite-sets', title: 'Favorite sets', table: setsTable },
        { key: 'sessions', title: 'Sessions', table: sessionsTable },
      ],
    };
  }
}
