import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { BettingService } from './betting.service';
import { BettingOverviewDto } from './dto/betting.dto';

@ApiTags('betting')
@Controller('betting')
export class BettingController {
  constructor(private readonly betting: BettingService) {}

  @Get('matches')
  @ApiOperation({
    summary: 'Upcoming CS2 matches of big tournaments with a map model forecast and the best bet',
  })
  @ApiOkResponse({ type: BettingOverviewDto })
  matches(): Promise<BettingOverviewDto> {
    return this.betting.overview();
  }
}
