export interface TensionDimensions {
  plotTension:      number;
  emotionalTension: number;
  pacingTension:    number;
  composite:        number;
  plotJustification:      string;
  emotionalJustification: string;
  pacingJustification:    string;
  chapterNumber?: number;
  scoredAt?: number;
}

export function calcComposite(plot: number, emotional: number, pacing: number): number {
  return Math.round((plot * 0.4 + emotional * 0.3 + pacing * 0.3) * 10) / 10;
}
