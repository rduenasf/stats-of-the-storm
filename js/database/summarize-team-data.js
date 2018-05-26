const { median } = require("../util/math");

// special version of summarize match data that only pulls stats from one of the teams
function summarizeTeamData(team, docs, HeroesTalents) {
  const data = {
    totalMatches: docs.length,
    wins: 0,
    totalBans: 0,
    heroes: {},
    stats: {
      average: {},
      min: {},
      max: {},
      median: {},
      medianTmp: {},
      total: {}
    },
    maps: {},
    level10Games: 0,
    level20Games: 0,
    structures: {},
    takedowns: {
      average: 0,
      total: 0,
      min: 1e10,
      max: 0,
      medianTmp: []
    },
    deaths: {
      average: 0,
      total: 0,
      min: 1e10,
      max: 0,
      medianTmp: []
    },
    matchLength: {
      total: 0,
      min: 1e10,
      max: 0,
      medianTmp: []
    },
    tierTimes: {
      T1: { total: 0, min: 1e10, max: 0, medianTmp: [], count: 0 },
      T2: { total: 0, min: 1e10, max: 0, medianTmp: [], count: 0 },
      T3: { total: 0, min: 1e10, max: 0, medianTmp: [], count: 0 },
      T4: { total: 0, min: 1e10, max: 0, medianTmp: [], count: 0 },
      T5: { total: 0, min: 1e10, max: 0, medianTmp: [], count: 0 },
      T6: { total: 0, min: 1e10, max: 0, medianTmp: [], count: 0 }
    }
  };

  for (let match of docs) {
    let winner = match.winner;

    // determine what team we want
    let t;
    let count = 0;
    let required = team.players.length > 5 ? 5 : team.players.length;
    for (let i in match.teams[0].ids) {
      if (team.players.indexOf(match.teams[0].ids[i]) >= 0) count += 1;
    }

    if (count === required) t = 0;
    else {
      count = 0;
      for (let i in match.teams[1].ids) {
        if (team.players.indexOf(match.teams[1].ids[i]) >= 0) count += 1;
      }

      if (count === required) t = 1;
      else continue;
    }

    if (!(match.map in data.maps)) {
      data.maps[match.map] = { games: 0, wins: 0 };
    }
    data.maps[match.map].games += 1;
    if (t === winner) {
      data.maps[match.map].wins += 1;
      data.wins += 1;
    }

    data.matchLength.total += match.length;
    data.matchLength.min = Math.min(data.matchLength.min, match.length);
    data.matchLength.max = Math.max(data.matchLength.max, match.length);
    data.matchLength.medianTmp.push(match.length);

    data.takedowns.total += match.teams[t].takedowns;
    data.takedowns.min = Math.min(match.teams[t].takedowns, data.takedowns.min);
    data.takedowns.max = Math.max(match.teams[t].takedowns, data.takedowns.max);
    data.takedowns.medianTmp.push(match.teams[t].takedowns);

    let deaths = t === 0 ? match.teams[1].takedowns : match.teams[0].takedowns;
    data.deaths.total += deaths;
    data.deaths.min = Math.min(deaths, data.deaths.min);
    data.deaths.max = Math.max(deaths, data.deaths.max);
    data.deaths.medianTmp.push(deaths);

    let teamHeroes = match.teams[t].heroes;

    for (let h in teamHeroes) {
      let hero = teamHeroes[h];

      if (!(hero in data.heroes)) {
        data.heroes[hero] = {
          first: 0,
          second: 0,
          wins: 0,
          bans: 0,
          games: 0,
          involved: 0,
          gamesAgainst: 0,
          defeated: 0,
          picks: {
            round1: { count: 0, wins: 0 },
            round2: { count: 0, wins: 0 },
            round3: { count: 0, wins: 0 }
          }
        };
      }

      data.heroes[hero].games += 1;
      data.heroes[hero].involved += 1;
      if (t === winner) {
        data.heroes[hero].wins += 1;
      }
    }

    // pick order
    if ("picks" in match) {
      let picks = match.picks[t];
      let first = match.picks.first === t;

      if (picks.length === 5) {
        if (first) {
          data.heroes[picks[0]].picks.round1.count += 1;
          data.heroes[picks[1]].picks.round2.count += 1;
          data.heroes[picks[2]].picks.round2.count += 1;
          data.heroes[picks[3]].picks.round3.count += 1;
          data.heroes[picks[4]].picks.round3.count += 1;

          if (t === winner) {
            data.heroes[picks[0]].picks.round1.wins += 1;
            data.heroes[picks[1]].picks.round2.wins += 1;
            data.heroes[picks[2]].picks.round2.wins += 1;
            data.heroes[picks[3]].picks.round3.wins += 1;
            data.heroes[picks[4]].picks.round3.wins += 1;
          }
        } else {
          data.heroes[picks[0]].picks.round1.count += 1;
          data.heroes[picks[1]].picks.round1.count += 1;
          data.heroes[picks[2]].picks.round2.count += 1;
          data.heroes[picks[3]].picks.round2.count += 1;
          data.heroes[picks[4]].picks.round3.count += 1;

          if (t === winner) {
            data.heroes[picks[0]].picks.round1.wins += 1;
            data.heroes[picks[1]].picks.round1.wins += 1;
            data.heroes[picks[2]].picks.round2.wins += 1;
            data.heroes[picks[3]].picks.round2.wins += 1;
            data.heroes[picks[4]].picks.round3.wins += 1;
          }
        }
      }
    }

    let otherTeamHeroes =
      t === 0 ? match.teams[1].heroes : match.teams[0].heroes;
    for (let h in otherTeamHeroes) {
      let hero = otherTeamHeroes[h];
      if (!(hero in data.heroes)) {
        data.heroes[hero] = {
          first: 0,
          second: 0,
          wins: 0,
          bans: 0,
          games: 0,
          involved: 0,
          gamesAgainst: 0,
          defeated: 0,
          picks: {
            round1: { count: 0, wins: 0 },
            round2: { count: 0, wins: 0 },
            round3: { count: 0, wins: 0 }
          }
        };
      }
      data.heroes[hero].gamesAgainst += 1;
      if (t === winner) {
        data.heroes[hero].defeated += 1;
      }
    }

    try {
      for (let b in match.bans[t]) {
        // typically this means they didn't ban
        if (match.bans[t][b].hero === "") {
          continue;
        }

        let hero = HeroesTalents.heroNameFromAttr(match.bans[t][b].hero);

        if (!(hero in data.heroes)) {
          data.heroes[hero] = {
            first: 0,
            second: 0,
            wins: 0,
            bans: 0,
            games: 0,
            involved: 0,
            gamesAgainst: 0,
            defeated: 0,
            picks: {
              round1: { count: 0, wins: 0 },
              round2: { count: 0, wins: 0 },
              round3: { count: 0, wins: 0 }
            }
          };
        }

        data.heroes[hero].involved += 1;
        data.heroes[hero].bans += 1;
        data.totalBans += 1;

        if (match.bans[t][b].order === 1) {
          data.heroes[hero].first += 1;
        } else if (match.bans[t][b].order === 2) {
          data.heroes[hero].second += 1;
        }
      }
    } catch (e) {
      // usually thrown for quick match. if picks aren't being recorded, uncomment this.
      // console.log(e);
    }

    // stat aggregation
    for (let stat in match.teams[t].stats) {
      if (stat === "structures") {
        for (let struct in match.teams[t].stats.structures) {
          if (!(struct in data.structures)) {
            data.structures[struct] = {
              destroyed: 0,
              first: 0,
              lost: 0,
              gamesWithFirst: 0
            };
          }

          data.structures[struct].destroyed +=
            match.teams[t].stats.structures[struct].destroyed;
          data.structures[struct].lost +=
            match.teams[t].stats.structures[struct].lost;

          if (match.teams[t].stats.structures[struct].destroyed > 0) {
            data.structures[struct].first +=
              match.teams[t].stats.structures[struct].first;
            data.structures[struct].gamesWithFirst += 1;
          }
        }
      } else if (stat === "totals") {
        for (let total in match.teams[t].stats.totals) {
          if (!(total in data.stats.total)) {
            data.stats.total[total] = 0;
            data.stats.min[total] = match.teams[t].stats.totals[total];
            data.stats.max[total] = match.teams[t].stats.totals[total];
            data.stats.medianTmp[total] = [];
          }

          data.stats.total[total] += match.teams[t].stats.totals[total];

          data.stats.min[total] = Math.min(
            data.stats.min[total],
            match.teams[t].stats.totals[total]
          );
          data.stats.max[total] = Math.max(
            data.stats.max[total],
            match.teams[t].stats.totals[total]
          );
          data.stats.medianTmp[total].push(match.teams[t].stats.totals[total]);
        }
      } else {
        if (!(stat in data.stats.total)) {
          data.stats.total[stat] = 0;

          data.stats.min[stat] = match.teams[t].stats[stat];
          data.stats.max[stat] = match.teams[t].stats[stat];
          data.stats.medianTmp[stat] = [];
        }
        data.stats.total[stat] += match.teams[t].stats[stat];
        data.stats.min[stat] = Math.min(
          data.stats.min[stat],
          match.teams[t].stats[stat]
        );
        data.stats.max[stat] = Math.max(
          data.stats.max[stat],
          match.teams[t].stats[stat]
        );
        data.stats.medianTmp[stat].push(match.teams[t].stats[stat]);
      }

      if (stat === "timeTo10") {
        data.level10Games += 1;
      }

      if (stat === "timeTo20") {
        data.level20Games += 1;
      }
    }

    // time per talent tier
    let intervals = [[1, 4], [4, 7], [7, 10], [10, 13], [13, 16], [16, 20]];
    let levels = match.levelTimes[t];
    for (let i = 0; i < intervals.length; i++) {
      let ikey = "T" + (i + 1);
      let interval = intervals[i];
      let time;

      if (interval[1] in levels) {
        time = levels[interval[1]].time - levels[interval[0]].time;
        data.tierTimes[ikey].total += time;
        data.tierTimes[ikey].min = Math.min(time, data.tierTimes[ikey].min);
        data.tierTimes[ikey].max = Math.max(time, data.tierTimes[ikey].max);
        data.tierTimes[ikey].medianTmp.push(time);
        data.tierTimes[ikey].count += 1;
      } else if (interval[0] in levels && !(interval[1] in levels)) {
        // end of game
        time = match.length - levels[interval[0]].time;
        data.tierTimes[ikey].total += time;
        data.tierTimes[ikey].min = Math.min(time, data.tierTimes[ikey].min);
        data.tierTimes[ikey].max = Math.max(time, data.tierTimes[ikey].max);
        data.tierTimes[ikey].medianTmp.push(time);
        data.tierTimes[ikey].count += 1;
      }
    }
  }

  for (let stat in data.stats.total) {
    if (stat === "timeTo10")
      data.stats.average[stat] = data.stats.total[stat] / data.level10Games;
    else if (stat === "timeTo20")
      data.stats.average[stat] = data.stats.total[stat] / data.level20Games;
    else data.stats.average[stat] = data.stats.total[stat] / data.totalMatches;

    // median
    data.stats.median[stat] = median(data.stats.medianTmp[stat]);
  }
  data.matchLength.average = data.matchLength.total / data.totalMatches;
  data.matchLength.median = median(data.matchLength.medianTmp);

  for (let tier in data.tierTimes) {
    data.tierTimes[tier].average =
      data.tierTimes[tier].total / Math.max(data.tierTimes[tier].count, 1);

    // median
    data.tierTimes[tier].median = median(data.tierTimes[tier].medianTmp);
  }

  data.takedowns.median = median(data.takedowns.medianTmp);
  data.takedowns.average = data.takedowns.total / data.totalMatches;

  data.deaths.median = median(data.deaths.medianTmp);
  data.deaths.average = data.deaths.total / data.totalMatches;

  // hero count
  data.heroesPlayed = 0;
  for (let h in data.heroes) {
    if (data.heroes[h].games > 0) data.heroesPlayed += 1;
  }

  return data;
}

module.exports = summarizeTeamData;
