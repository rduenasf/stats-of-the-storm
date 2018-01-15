// this is the main database connector used by the app
// storage model is a persistent NeDB

// libraries
const Parser = require('./parser.js');
const ReplayTypes = require('./constants.js');
const timers = require('timers');
const fs = require('fs');

// databases are loaded from the specified folder when the database object is created
var Datastore = require('nedb');

const ReplayStatus = {
  OK: 1,
  Duplicate: -1
}

class Database {
  constructor(databasePath) {
    this._path = databasePath;

    // open the databases
    this._db = {};
    this._db.matches = new Datastore({ filename: this._path + '/matches.db', autoload: true });
    this._db.heroData = new Datastore({ filename: this._path + '/hero.db', autoload: true });
    this._db.players = new Datastore({ filename: this._path + '/players.db', autoload: true });
    this._db.settings = new Datastore({ filename: this._path + '/settings.db', autoload: true });
  }

  // processes a replay file and adds it to the database
  processReplay(file) {
    if (this._processingReplay) {
      // defer processing until later
      timers.setTimeout
    }

    console.log("Processing " + file);

    // parse it
    var data = Parser.parse(file, Parser.AllReplayData);
    var details = data.details[0];

    // start with the match, since a lot of things are keyed off of it
    // the match id is not generated until insertion (key off unique id generated by database)
    // TODO: de-duplication
    var match = {};

    console.log("Writing header...");

    // header data
    match.version = data.header[0].m_version;
    match.type = data.header[0].m_type;
    match.loopLength = data.header[0].m_elapsedGameLoops;
    match.length = loopsToSeconds(match.loopLength);

    // map details
    match.map = details.m_title;
    match.date = winFileTimeToDate(details.m_timeUTC);
    match.rawDate = details.m_timeUTC;

    // check for duplicate matches somewhere else, this function executes without async calls
    // until insertion. Should have a processReplays function that does the de-duplication.
    //this._db.matches.find({ 'map' : match.map, 'date' : match.date, 'loopLength' : match.loopLength }, function(err, docs) {

    // players
    // the match will just store the players involed. The details will be stored
    // in a document in the heroData db
    // players are 1-indexed, look at details first
    var players = {};

    match.playerIDs = [];
    match.team0 = [];
    match.team1 = [];
    var playerDetails = details.m_playerList;

    console.log("Gathering Preliminary Player Data...");
    for (var i = 0; i < playerDetails.length; i++) {
      var playerID = i + 1;
      var pdata = playerDetails[i];
      var pdoc = {};

      // collect data
      pdoc.hero = pdata.m_hero;
      pdoc.name = pdata.m_name;
      pdoc.uuid = pdata.m_toon.m_id;
      pdoc.region = pdata.m_toon.m_region;
      pdoc.realm = pdata.m_toon.m_realm;
      pdoc.team = pdata.m_teamId;  /// the team id doesn't neatly match up with the tracker events, may adjust later
      pdoc.ToonHandle = pdata.m_toon.m_realm + '-' + pdata.m_toon.m_programId + '-' + pdata.m_toon.m_region + '-' + pdata.m_toon.m_id;
      pdoc.gameStats = {};
      pdoc.talents = {};
      pdoc.takedowns = [];
      pdoc.deaths = [];
      pdoc.gameStats.awards = [];
      pdoc.bsteps = [];
      pdoc.sprays = [];
      pdoc.taunts = [];

      if (pdoc.team === ReplayTypes.TeamType.Blue) {
        match.team0.push(pdoc.ToonHandle);
      }
      else if (pdoc.team === ReplayTypes.TeamType.Red) {
        match.team1.push(pdoc.ToonHandle);
      }

      players[pdoc.ToonHandle] = pdoc;
      match.playerIDs.push(pdoc.ToonHandle);

      console.log("Found player " + pdoc.ToonHandle + " (" + pdoc.name+ ")");
    }

    console.log("Preliminary Player Processing Complete");
    console.log("Matching Tracker Player ID to handles...");
    // construct identfier map for player handle to internal player object id
    var tracker = data.trackerevents;

    // maps player id in the Tracker data to the proper player object
    var playerIDMap = {};

    for (var i = 0; i < tracker.length; i++) {
      var event = tracker[i];

      // case on event type
      if (event._eventid === ReplayTypes.TrackerEvent.Stat) {
        if (event.m_eventName === ReplayTypes.StatEventType.PlayerInit) {
          playerIDMap[event.m_intData[0].m_value] = event.m_stringData[1].m_value;

          console.log("Player " + event.m_stringData[1].m_value + " has tracker ID " + event.m_intData[0].m_value);
        }
      }
    }

    console.log("Player ID Mapping Complete");

    // the tracker events have most of the useful data
    // track a few different kinds of things here, this is probably where most of the interesting stuff will come from
    var stats = {};
    match.XPBreakdown = [];
    match.takedowns = [];
    match.team0Takedowns = 0;
    match.team1Takedowns = 0;
    var team0XPEnd;
    var team1XPEnd;

    console.log("[TRACKER] Starting Event Analysis...");

    for (var i = 0; i < tracker.length; i++) {
      var event = tracker[i];

      // case on event type
      if (event._eventid === ReplayTypes.TrackerEvent.Score) {
        // score is real long, separate function
        this.processScoreArray(event.m_instanceList, match, players, playerIDMap);
      }
      else if (event._eventid === ReplayTypes.TrackerEvent.Stat) {
        if (event.m_eventName === ReplayTypes.StatEventType.EndOfGameTalentChoices) {
          var trackerPlayerID = event.m_intData[0].m_value;
          var playerID = playerIDMap[trackerPlayerID];

          console.log("[TRACKER] Processing Talent Choices for " + playerID);

          // this actually contains more than talent choices
          if (event.m_stringData[1].m_value === "Win") {
            players[playerID].win = true;
          }
          else {
            players[playerID].win = false;
          }

          players[playerID].internalHeroName = event.m_stringData[0].m_value;

          // talents
          for (var j = 0; j < event.m_stringData.length; j++) {
            if (event.m_stringData[j].m_key.startsWith('Tier')) {
              players[playerID].talents[event.m_stringData[j].m_key] = event.m_stringData[j].m_value;
            }
          }
        }
        else if (event.m_eventName === ReplayTypes.StatEventType.PeriodicXPBreakdown) {
          var xpb = {};
          xpb.loop = event._gameloop;
          xpb.time = loopsToSeconds(xpb.loop);
          xpb.team = event.m_intData[0].m_value;
          xpb.teamLevel = event.m_intData[1].m_value;
          xpb.breakdown = {};

          console.log("[TRACKER] Processing XP Breakdown for team " + xpb.team + " at loop " + xpb.loop);

          for (var j in event.m_fixedData) {
            xpb.breakdown[event.m_fixedData[j].m_key] = event.m_fixedData[j].m_value;
          }

          match.XPBreakdown.push(xpb);
        }
        else if (event.m_eventName === ReplayTypes.StatEventType.EndOfGameXPBreakdown) {
          var xpb = {};
          xpb.loop = event._gameloop;
          xpb.time = loopsToSeconds(xpb.loop);
          xpb.team = players[playerIDMap[event.m_intData[0].m_value]].team;
          xpb.breakdown = {};

          console.log("[TRACKER] Caching Final XP Breakdown for team " + xpb.team + " at loop " + xpb.loop);

          for (var j in event.m_fixedData) {
            xpb.breakdown[event.m_fixedData[j].m_key] = event.m_fixedData[j].m_value;
          }

          if (xpb.team === ReplayTypes.TeamType.Blue) {
            team0XPEnd = xpb;
          }
          else if (xpb.team === ReplayTypes.TeamType.Red) {
            team1XPEnd = xpb;
          }
        }
        else if (event.m_eventName === ReplayTypes.StatEventType.PlayerDeath) {
          // add data to the match and the individual players
          var tData = {};
          tData.loop = event._gameloop;
          tData.time = loopsToSeconds(tData.loop);
          tData.x = event.m_fixedData[0].m_value;
          tData.y = event.m_fixedData[1].m_value;
          tData.killers = [];

          // player ids
          var victim;
          var killers = [];

          for (var j = 0; j < event.m_intData.length; j++) {
            var entry = event.m_intData[j];

            if (entry.m_key === "PlayerID") {
              tData.victim = { player: playerIDMap[entry.m_value], hero: players[playerIDMap[entry.m_value]].hero };
              victim = playerIDMap[entry.m_value];
            }
            else if (entry.m_key === "KillingPlayer") {
              var tdo = { player: playerIDMap[entry.m_value], hero: players[playerIDMap[entry.m_value]].hero };
              killers.push(playerIDMap[entry.m_value]);
              tData.killers.push(tdo);
            }
          }

          if (players[victim].team === ReplayTypes.TeamType.Blue)
            match.team1Takedowns += 1;
          else if (players[victim].team === ReplayTypes.TeamType.Red)
            match.team0Takedowns += 1;

          match.takedowns.push(tData);
          players[victim].deaths.push(tData);
          for (var j = 0; j < killers.length; j++) {
            players[killers[j]].takedowns.push(tData);
          }

          console.log('[TRACKER] Processed Player ' + victim + ' death at ' + tData.loop);
        }
        else if (event.m_eventName === ReplayTypes.StatEventType.LootSprayUsed) {
          var spray = {};
          var id = event.m_stringData[1].m_value;
          spray.kind = event.m_stringData[2].m_value;
          spray.x = event.m_fixedData[0].m_value;
          spray.y = event.m_fixedData[1].m_value;

          players[id].sprays.push(spray);

          console.log('[TRACKER] Spray from player ' + id + ' found');
        }
      }

    }

    console.log("[TRACKER] Adding final XP breakdown")
    match.XPBreakdown.push(team0XPEnd);
    match.XPBreakdown.push(team1XPEnd);

    console.log("[TRACKER] Event Analysis Complete");

    // get a few more bits of summary data from the players...
    for (var p in players) {
      if (players[p].team === ReplayTypes.TeamType.Blue) {
        match.blueTeamLevel = players[p].gameStats.Level;
      
        if (players[p].win) {
          match.winner = ReplayTypes.TeamType.Blue;
        }
      }
      else if (players[p].team === ReplayTypes.TeamType.Red) {
        match.redTeamLevel = players[p].gameStats.Level;

        if (players[p].win) {
          match.winner = ReplayTypes.TeamType.Red;
        }
      }
    }

    console.log("[MESSAGES] Message Processing Start...");

    var messages = data.messageevents;
    match.messages = [];

    for (var i = 0; i < messages.length; i++) {
      var message = messages[i];

      var msg = {};
      msg.type = message._eventid;

      // don't really care about these
      if (msg.type === ReplayTypes.MessageType.LoadingProgress)
        continue;

      if (!(message._userid.m_userId in playerIDMap))
        continue;

      msg.player = playerIDMap[message._userid.m_userId];
      msg.team = players[msg.player].team;
      msg.recipient = message.m_recipient;
      msg.loop = message._gameloop;
      msg.time = loopsToSeconds(msg.loop);

      if (message._eventid === ReplayTypes.MessageType.Ping) {
        msg.point = { x: message.m_point.x, y: message.m_point.y };
      }
      else if (message._eventid === ReplayTypes.MessageType.Chat) {
        msg.text = message.m_string;
      }
      else if (message._eventid === ReplayTypes.MessageType.PlayerAnnounce) {
        msg.announcement = message.m_announcement;
      }

      match.messages.push(msg);
    }

    console.log("[MESSAGES] Message Processing Complete");

    console.log("[GAME] B-Step Detection Running...");

    // this is probably the worst use of cpu cycles i can think of but i'm gonna do it
    var gameLog = data.gameevents;
    var playerBSeq = {};
    for (var i = 0; i < gameLog.length; i++) {
      // the b action is likely of type 27 however i don't actually know how to interpret that data
      // working theory: eventid 27 abilLink 200 is b.
      var event = gameLog[i];
      if (event._eventid === 27) {
        if (event.m_abil && event.m_abil.m_abilLink === 200) {
          // player ids are actually off by one here
          var playerID = event._userid.m_userId + 1;
          var id = playerIDMap[playerID];

          if (!(id in playerBSeq))
            playerBSeq[id] = [];

          // create chains of b-actions. threshold is within 16 loops (1 second)
          if (playerBSeq[id].length === 0)
            playerBSeq[id].push([event]);
          else {
            var currentSeq = playerBSeq[id].length - 1;
            var currentStep = playerBSeq[id][currentSeq].length - 1;
            if (Math.abs(playerBSeq[id][currentSeq][currentStep]._gameloop - event._gameloop) <= 16) {
              playerBSeq[id][currentSeq].push(event);
            }
            else {
              playerBSeq[id].push([event]);
            }
          }
        }
      }
    }

    // process the bseq arrays
    for (var id in playerBSeq) {
      var playerSeqs = playerBSeq[id];
      for (var i = 0; i < playerSeqs.length; i++) {
        if (playerSeqs[i].length > 1) {
          // reformat the data and place in the player data
          var bStep = {};
          bStep.start = playerSeqs[i][0]._gameloop;
          bStep.stop = playerSeqs[i][playerSeqs[i].length - 1]._gameloop;
          bStep.duration = bStep.stop - bStep.start;
          bStep.kills = 0;
          bStep.deaths = 0;

          var min = bStep.start - 160;
          var max = bStep.stop + 160;

          // scan the takedowns array to see if anything interesting happened
          // range is +/- 10 seconds (160 loops)
          for (var j = 0; j < match.takedowns.length; j++) {
            var td = match.takedowns[j];
            var time = td.loop;

            if (min <= time && time <= max) {
              // check involved players
              if (td.victim === id)
                bStep.deaths += 1;

              if (td.killers.indexOf(id) > -1)
                bStep.kills += 1;
            }
          }

          players[id].bsteps.push(bStep);
        }
      }
    }

    console.log("[GAME] B-Step Detection Complete");

    // insert match, upsert is used just in case duplicates exist
    var self = this;

    this._db.matches.update({ 'map' : match.map, 'date' : match.date, 'loopLength' : match.loopLength }, match, {upsert: true}, function (err, numReplaced, newDoc) {
      if (!newDoc) {
        console.log("Duplicate match found, skipping player update");
      }
      else {
        console.log("Inserted new match " + newDoc._id);

        // update and insert players
        for (var i in players) {
          players[i].matchID = newDoc._id;
          self._db.heroData.insert(players[i]);

          // log unique players in the player database
          var playerDbEntry = {};
          playerDbEntry._id = players[i].ToonHandle;
          playerDbEntry.name = players[i].name;
          playerDbEntry.uuid = players[i].uuid;
          playerDbEntry.region = players[i].region;
          playerDbEntry.realm = players[i].realm;
          self._db.players.update({ _id: playerDbEntry._id }, playerDbEntry, {upsert: true}, function(err, numReplaced, upsert) {
            if (err)
              console.log(err);
          });
        }
      }
    });

    return ReplayStatus.OK;
  }

  processScoreArray(data, match, players, playerIDMap) {
  	console.log("[SCORE DATA] Processing Start");

    // iterate through each object...
    for (var i = 0; i < data.length; i++) {
      var name = data[i].m_name;
      var valArray = data[i].m_values;

      if (!name.startsWith('EndOfMatchAward')) {
        for (var j = 0; j < valArray.length; j++) {
          if (valArray[j].length > 0) {
            var playerID = j + 1;
            players[playerIDMap[playerID]].gameStats[name] = valArray[j][0].m_value;
          }
        }
      }
      else {
        for (var j = 0; j < valArray.length; j++) {
          if (valArray[j].length > 0) {
            var playerID = j + 1;
            if (valArray[j][0].m_value === 1) {
              players[playerIDMap[playerID]].gameStats.awards.push(name);
            }
          }
        }
      }
    }

    console.log("[SCORE DATA] Processing Complete");
  }
}

// general parsing utilities, not db specific
function winFileTimeToDate(filetime) {
  return new Date(filetime / 10000 - 11644473600000);
}

function loopsToSeconds(loops) {
  // apparently hots does 16 updates per second
  return loops / 16;
}

exports.HeroesDatabase = Database;