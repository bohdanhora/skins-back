import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { teamKey } from '../../domain/cs-teams';
import {
  parseMatches,
  subpageLinks,
  tournamentLinks,
  type ParsedMatch,
} from '../../domain/liquipedia';
import { LiquipediaClient } from './clients/liquipedia.client';
import { MapResultEntity } from './map-result.entity';
import { SourcePageEntity } from './source-page.entity';

const TIER_LISTS: { path: string; limit: number }[] = [
  { path: 'S-Tier_Tournaments', limit: 45 },
  { path: 'A-Tier_Tournaments', limit: 40 },
];
const SYNC_EVERY_MS = 6 * 60 * 60_000;
const FIRST_SYNC_DELAY_MS = 15_000;
const REFRESH_AFTER_MS = 6 * 60 * 60_000;
const SETTLED_AFTER_MS = 3 * 86_400_000;

export interface SyncProgress {
  running: boolean;
  pagesDone: number;
  pagesQueued: number;
  lastError: string | null;
}

@Injectable()
export class BettingSyncService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(BettingSyncService.name);
  private timer: NodeJS.Timeout | null = null;
  private progress: SyncProgress = {
    running: false,
    pagesDone: 0,
    pagesQueued: 0,
    lastError: null,
  };

  constructor(
    private readonly liquipedia: LiquipediaClient,
    @InjectRepository(MapResultEntity) private readonly results: Repository<MapResultEntity>,
    @InjectRepository(SourcePageEntity) private readonly pages: Repository<SourcePageEntity>,
  ) {}

  onModuleInit(): void {
    this.timer = setTimeout(() => void this.loop(), FIRST_SYNC_DELAY_MS);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  status(): SyncProgress {
    return { ...this.progress };
  }

  private async loop(): Promise<void> {
    await this.sync();
    this.timer = setTimeout(() => void this.loop(), SYNC_EVERY_MS);
  }

  async sync(): Promise<void> {
    if (this.progress.running) return;

    this.progress = { running: true, pagesDone: 0, pagesQueued: 0, lastError: null };

    try {
      const year = new Date().getUTCFullYear();
      const tournaments: string[] = [];

      for (const list of TIER_LISTS) {
        const html = await this.liquipedia.page(list.path);

        tournaments.push(...tournamentLinks(html, year - 1, year).slice(0, list.limit));
      }

      const due = await this.duePaths([...new Set(tournaments)]);

      this.progress.pagesQueued = due.length;

      for (const path of due) {
        await this.syncTournament(path).catch((error: unknown) => {
          this.progress.lastError = String(error);
          this.logger.warn(`Liquipedia ${path} failed: ${String(error)}`);
        });
        this.progress.pagesDone += 1;
      }
    } catch (error) {
      this.progress.lastError = String(error);
      this.logger.warn(`Liquipedia sync failed: ${String(error)}`);
    } finally {
      this.progress.running = false;
    }
  }

  private async duePaths(paths: string[]): Promise<string[]> {
    const known = new Map((await this.pages.find()).map((page) => [page.path, page] as const));
    const now = Date.now();

    return paths.filter((path) => {
      const page = known.get(path);

      if (!page) return true;

      const settled =
        page.matches > 0 &&
        page.lastMatchAt !== null &&
        page.fetchedAt.getTime() - page.lastMatchAt.getTime() > SETTLED_AFTER_MS;

      return !settled && now - page.fetchedAt.getTime() > REFRESH_AFTER_MS;
    });
  }

  private async syncTournament(path: string): Promise<void> {
    const html = await this.liquipedia.page(path);
    const matches = [...parseMatches(html)];

    for (const stage of subpageLinks(html, path)) {
      matches.push(...parseMatches(await this.liquipedia.page(stage)));
    }

    await this.store(path, matches);
  }

  private async store(path: string, matches: ParsedMatch[]): Promise<void> {
    const rows = matches.flatMap((match) =>
      match.maps.map((map, index) => ({
        key: `${match.playedAt}|${teamKey(match.team1)}|${teamKey(match.team2)}|${index}`,
        playedAt: new Date(match.playedAt),
        tournament: path.slice(0, 200),
        team1: match.team1.slice(0, 100),
        team2: match.team2.slice(0, 100),
        map: map.map.slice(0, 40),
        score1: map.score1,
        score2: map.score2,
        winner: map.winner,
        bestOf: match.bestOf,
      })),
    );

    if (rows.length > 0) {
      await this.results.upsert(rows, ['key']);
    }

    const last = matches.reduce<number | null>(
      (latest, match) => Math.max(latest ?? 0, Date.parse(match.playedAt)),
      null,
    );

    await this.pages.save({
      path,
      fetchedAt: new Date(),
      matches: matches.length,
      lastMatchAt: last === null ? null : new Date(last),
    });
  }
}
