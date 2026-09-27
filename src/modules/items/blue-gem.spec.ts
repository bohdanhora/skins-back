import { MarketId } from '../../domain/market-links';
import { byBlue } from './blue-gem.service';
import { type BlueGemListingDto } from './dto/blue-gem.dto';

const listing = (
  paintSeed: number,
  blue: number,
  csfloat: number | null,
  price = 100,
): BlueGemListingDto => ({
  market: MarketId.WhiteMarket,
  id: String(paintSeed),
  name: 'AK-47 | Case Hardened (Field-Tested)',
  price,
  priceLabel: null,
  float: 0.2,
  paintSeed,
  blue: { playside: blue, backside: 10 },
  csfloatBlue: csfloat === null ? null : { playside: csfloat, backside: 5 },
  floorPrice: null,
  url: '',
});

describe('blue gem order', () => {
  it('ranks by the CSFloat share first and the calculator after', () => {
    const rows = [
      listing(760, 90.6, 47.4),
      listing(1, 99, null),
      listing(661, 97.6, 76.1),
      listing(151, 94.8, 75.5),
    ];

    expect([...rows].sort(byBlue).map((row) => row.paintSeed)).toEqual([661, 151, 760, 1]);
  });
});
