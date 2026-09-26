import { ApiProperty } from '@nestjs/swagger';

import type { MarketKind } from '../../../domain/cs-markets';
import type { VetoStep } from '../../../domain/cs-model';

export class TeamForecastDto {
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  image!: string | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Valve Regional Standings place' })
  rank!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  points!: number | null;

  roster!: string[];

  @ApiProperty({ description: 'Maps from big tournaments the model knows for this team' })
  mapGames!: number;
}

export class MapRecordDto {
  offset!: number;
  games!: number;
  wins!: number;
}

export class PlannedMapDto {
  map!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Team that picks it, null for the decider',
  })
  pickedBy!: 1 | 2 | null;

  @ApiProperty({ description: 'Chance that the first team wins this map' })
  chance!: number;

  @ApiProperty({ type: MapRecordDto, nullable: true })
  team1!: MapRecordDto | null;

  @ApiProperty({ type: MapRecordDto, nullable: true })
  team2!: MapRecordDto | null;
}

export class VetoActionDto {
  team!: 1 | 2;

  @ApiProperty({ enum: ['ban', 'pick'] })
  step!: VetoStep;

  map!: string;
}

export class ScoreChanceDto {
  first!: number;
  second!: number;
  chance!: number;
}

export class MarketOfferDto {
  @ApiProperty({ enum: ['winner', 'map', 'handicap', 'total'] })
  kind!: MarketKind;

  @ApiProperty({ description: 'Handicap of the first team, or the total maps line' })
  line!: number;

  @ApiProperty({ type: Number, nullable: true })
  mapIndex!: number | null;

  @ApiProperty({ description: '1 is the first team or over, 2 is the second team or under' })
  side!: 1 | 2;

  @ApiProperty({ description: 'Chance from the map model' })
  model!: number;

  @ApiProperty({ type: Number, nullable: true, description: 'Chance the bookmakers price in' })
  market!: number | null;

  @ApiProperty({ description: 'Model and market blended, used for the value' })
  chance!: number;

  @ApiProperty({ description: 'Best decimal odds across bookmakers' })
  odds!: number;

  bookmaker!: string;
  bookmakers!: number;

  @ApiProperty({ description: 'Expected profit per unit staked' })
  expectedValue!: number;

  @ApiProperty({ description: 'Suggested share of the bankroll, quarter Kelly' })
  stake!: number;
}

export class MatchForecastDto {
  id!: number;
  startsAt!: string;
  live!: boolean;
  bestOf!: number;
  event!: string;
  stage!: string;
  team1!: TeamForecastDto;
  team2!: TeamForecastDto;

  @ApiProperty({ description: 'Chance that the first team wins the series' })
  win!: number;

  @ApiProperty({ type: [ScoreChanceDto] })
  scores!: ScoreChanceDto[];

  @ApiProperty({ type: [PlannedMapDto] })
  maps!: PlannedMapDto[];

  @ApiProperty({ type: [VetoActionDto] })
  vetoes!: VetoActionDto[];

  @ApiProperty({ type: [MarketOfferDto] })
  markets!: MarketOfferDto[];

  @ApiProperty({ type: MarketOfferDto, nullable: true })
  bestBet!: MarketOfferDto | null;

  oddsFound!: boolean;

  @ApiProperty({ enum: ['high', 'medium', 'low'] })
  confidence!: 'high' | 'medium' | 'low';
}

export class SyncProgressDto {
  running!: boolean;
  pagesDone!: number;
  pagesQueued!: number;

  @ApiProperty({ type: String, nullable: true })
  lastError!: string | null;
}

export class BigEventDto {
  id!: number;
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  image!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 's or a' })
  tier!: string | null;

  @ApiProperty({ type: String, nullable: true })
  beginsAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  endsAt!: string | null;
}

export class BettingOverviewDto {
  @ApiProperty({ type: [MatchForecastDto] })
  matches!: MatchForecastDto[];

  @ApiProperty({ type: [BigEventDto], description: 'Running and upcoming big tournaments' })
  events!: BigEventDto[];

  mapsKnown!: number;
  mapPool!: string[];

  @ApiProperty({ type: String, nullable: true })
  standingsDate!: string | null;

  @ApiProperty({ type: SyncProgressDto })
  sync!: SyncProgressDto;

  sources!: { schedule: boolean; odds: boolean };
}
