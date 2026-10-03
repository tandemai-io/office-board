import type { SportsLeague } from './sports';

type TeamColors = readonly [primary: number, secondary: number];

// Primary/alternate colors checked against ESPN team metadata on 2026-10-02:
// https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams
// https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams
// Vestaboard has eight colors: navy uses blue, gold uses yellow, silver uses
// white, and brown uses black. A dark alternate blue uses black for contrast.
const TEAM_COLORS: Record<Exclude<SportsLeague,'NCAAF'>, Record<string, TeamColors>> = {
  NFL: {
    ARI: [63, 69], ATL: [63, 70], BAL: [68, 70], BUF: [67, 63],
    CAR: [67, 70], CHI: [67, 64], CIN: [64, 70], CLE: [70, 64],
    DAL: [67, 69], DEN: [67, 64], DET: [67, 69], GB: [66, 65],
    HOU: [67, 63], IND: [67, 69], JAX: [67, 65], KC: [63, 65],
    LV: [70, 69], LAC: [67, 65], LAR: [67, 65], MIA: [67, 64],
    MIN: [68, 65], NE: [67, 63], NO: [65, 70], NYG: [67, 63],
    NYJ: [66, 69], PHI: [66, 70], PIT: [70, 65], SF: [63, 65],
    SEA: [67, 66], TB: [63, 70], TEN: [67, 70], WAS: [63, 65],
  },
  NBA: {
    ATL: [63, 65], BOS: [66, 69], BKN: [70, 69], CHA: [67, 68],
    CHI: [63, 70], CLE: [63, 65], DAL: [67, 69], DEN: [67, 65],
    DET: [67, 63], GSW: [65, 67], HOU: [63, 70], IND: [67, 65],
    LAC: [67, 63], LAL: [68, 65], MEM: [67, 70], MIA: [63, 70],
    MIL: [66, 69], MIN: [67, 66], NOP: [67, 65], NYK: [67, 64],
    OKC: [67, 64], ORL: [67, 69], PHI: [67, 63], PHX: [68, 64],
    POR: [63, 70], SAC: [68, 69], SAS: [70, 69], TOR: [63, 70],
    UTA: [68, 67], WAS: [63, 67],
  },
};

const ALIASES: Record<Exclude<SportsLeague,'NCAAF'>, Record<string, string>> = {
  NFL: { LA: 'LAR', WSH: 'WAS', ARZ: 'ARI', BLT: 'BAL', CLV: 'CLE', HST: 'HOU' },
  NBA: { GS: 'GSW', NO: 'NOP', NY: 'NYK', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS', PHO: 'PHX' },
};

export function canonicalTeamAbbreviation(league:SportsLeague,abbreviation:string):string {
  const key = abbreviation.trim().toUpperCase();
  return league==='NCAAF'?key:ALIASES[league][key]||key;
}
export function teamColors(league: SportsLeague, abbreviation: string): TeamColors {
  if(league==='NCAAF')return [69,70];
  return TEAM_COLORS[league][canonicalTeamAbbreviation(league,abbreviation)] || [69, 70];
}

export function teamColorStrip(league: SportsLeague, leftTeam: string, rightTeam: string, leftColors?:TeamColors, rightColors?:TeamColors): number[] {
  const [leftPrimary, leftSecondary] = leftColors || teamColors(league, leftTeam);
  const [rightPrimary, rightSecondary] = rightColors || teamColors(league, rightTeam);
  return [
    ...Array<number>(7).fill(leftPrimary), ...Array<number>(3).fill(leftSecondary),
    70, 70,
    ...Array<number>(3).fill(rightSecondary), ...Array<number>(7).fill(rightPrimary),
  ];
}
