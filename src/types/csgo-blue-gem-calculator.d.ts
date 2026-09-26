declare module 'csgo-blue-gem-calculator' {
  interface ColorShares {
    blue: number;
    purple: number;
    gold: number;
    other: number;
  }

  interface SeedPercentages {
    seed: number;
    playside?: ColorShares;
    backside?: ColorShares;
    top?: ColorShares;
    magazine?: ColorShares;
  }

  export default class BlueGemCalculator {
    getPercentages(finish: string, item: string, seed: number): SeedPercentages;
    getAllPercentages(
      finish: string,
      item: string,
    ): { item: string; percentages: SeedPercentages[] };
    getSupportedItems(finish: string): string[];
  }
}
