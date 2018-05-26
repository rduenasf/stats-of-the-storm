module.exports = function(DB, callback) {
  // DATABASE MIGRATIONS
  function migrateVersion1ToVersion2() {
    let text = `The parser has been updated to version 2, which means that you will need to
    re-import your matches to use the latest features. You can force the database to re-import duplicate
    matches by using the Import Duplicates option, or you can delete the database and just re-import everything.
    Note that importing duplicates will reset their membership in collections, so if you use that feature,
    remember to set the Import to Collection option accordingly.`;
    showMessage("Parser Updated to Version 2", text, { sticky: true });
    DB.setDBVersion(2, checkDBVersion(2));
  }

  function migrateVersion2ToVersion3() {
    // this one we actually do work.
    setLoadMessage("Updating DB Version 2 to Version 3");
    DB.getMatches({}, function(err, docs) {
      if (docs.length > 0) updateMatchToVersion3(docs.pop(), docs);
      else finishVersion2To3Migration();
    });
  }

  function migrateVersion3ToVersion4() {
    setLoadMessage("Updating DB Version 3 to Version 4");

    setLoadMessage(
      "Updating DB Version 3 to Version 4<br>Backing up existing database"
    );

    // copy the 4 files to a new directory (db3-backup)
    let path = settings.get("dbPath");

    fs.ensureDir(path + "/db3-backup", function(err) {
      if (err) {
        console.log(err);
        showMessage("Unable to Backup Version 3 Database. Aborting.", err, {
          sticky: true,
          class: "negative"
        });
        // ok so this needs to crash (it can't load, it can't do anything). throw an exception
        throw new Exception(
          "Database Upgrade Exception - Unable to Backup Files"
        );
      } else {
        fs.copySync(path + "/matches.db", path + "/db3-backup/matches.db");
        fs.copySync(path + "/hero.db", path + "/db3-backup/hero.db");
        fs.copySync(path + "/players.db", path + "/db3-backup/players.db");
        fs.copySync(path + "/settings.db", path + "/db3-backup/settings.db");

        DB._db.heroData.find({}, function(err, docs) {
          if (docs.length > 0) {
            updateHeroDataToVersion4(docs.pop(), docs);
          } else {
            finishVersion3To4Migration();
          }
        });
      }
    });
  }

  function updateMatchToVersion3(match, remaining) {
    try {
      console.log("updating match " + match._id);
      setLoadMessage(
        "Updating DB Version 2 to Version 3<br>" +
          remaining.length +
          " matches left"
      );

      if (match.picks) {
        match.firstPickWin = match.picks.first === match.winner;
      } else {
        match.firstPickWin = false;
      }

      match.firstObjective = Parser.getFirstObjectiveTeam(match);
      match.firstObjectiveWin = match.winner === match.firstObjective;

      // update length!
      // the offset from the end of the xp breakdown to the actual end of the match is 114 frames
      // this may vary a little bit, but it should bring things in line with the current parser.
      // users can of course re-import the matches if they desire.
      let lastXP = match.XPBreakdown[match.XPBreakdown.length - 1];
      match.loopLength = lastXP.loop - 114;
      match.length = Parser.loopsToSeconds(
        match.loopLength - match.loopGameStart
      );

      // update
      DB.updateMatch(match, function() {
        if (remaining.length === 0) {
          finishVersion2To3Migration();
        } else {
          updateMatchToVersion3(remaining.pop(), remaining);
        }
      });
    } catch (err) {
      console.log(err);
      console.log(
        "Failed to update match " + match._id + " please file bug report"
      );

      if (remaining.length === 0) {
        finishVersion2To3Migration();
      } else {
        updateMatchToVersion3(remaining.pop(), remaining);
      }
    }
  }

  function updateHeroDataToVersion4(heroData, remaining) {
    try {
      console.log("updating hero data " + heroData._id);
      setLoadMessage(
        "Updating DB Version 3 to Version 4<br>" +
          remaining.length +
          " entries left<br>DO NOT CLOSE THE APP"
      );

      // this one's pretty easy, just take the hero data and update the missing gameStats fields
      heroData.gameStats.damageDonePerDeath =
        heroData.gameStats.HeroDamage / Math.max(1, heroData.gameStats.Deaths);
      heroData.gameStats.damageTakenPerDeath =
        heroData.gameStats.DamageTaken / Math.max(1, heroData.gameStats.Deaths);
      heroData.gameStats.healingDonePerDeath =
        (heroData.gameStats.Healing +
          heroData.gameStats.SelfHealing +
          heroData.gameStats.ProtectionGivenToAllies) /
        Math.max(1, heroData.gameStats.Deaths);
      heroData.gameStats.DPM =
        heroData.gameStats.HeroDamage / (heroData.length / 60);
      heroData.gameStats.HPM =
        (heroData.gameStats.Healing +
          heroData.gameStats.SelfHealing +
          heroData.gameStats.ProtectionGivenToAllies) /
        (heroData.length / 60);
      heroData.gameStats.XPM =
        heroData.gameStats.ExperienceContribution / (heroData.length / 60);

      DB._db.heroData.update({ _id: heroData._id }, heroData, {}, function() {
        if (remaining.length === 0) {
          finishVersion3To4Migration();
        } else {
          updateHeroDataToVersion4(remaining.pop(), remaining);
        }
      });
    } catch (err) {
      console.log(err);
      console.log(
        "Failed to update heroData entry " +
          heroData._id +
          ". Please file a bug report."
      );

      if (remaining.length === 0) {
        finishVersion3To4Migration();
      } else {
        updateHeroDataToVersion4(remaining.pop(), remaining);
      }
    }
  }

  function finishVersion2To3Migration() {
    setLoadMessage("Version 3 Upgrade Complete");
    showMessage(
      "Parser Updated to Version 3",
      "Match length corrected to estimate from last XP Breakdown. Additional database fields added. You do not need to re-import your matches. However, if you feel that the match lengths are still incorrect, you may want to re-create (not re-import) the entire database.",
      { sticky: true, class: "positive" }
    );
    DB.setDBVersion(3, checkDBVersion(3));
  }

  function finishVersion3To4Migration() {
    setLoadMessage("Version 4 Upgrade Complete");
    showMessage(
      "Parser and Database Updated to Version 4",
      "Added 6 additional stats to the database. No re-import is necessary.<br>A backup was created at " +
        settings.get("dbPath") +
        "/db3-backup. If the database updated correctly, you can safely delete this folder",
      { sticky: true, class: "positive" }
    );
    DB.setDBVersion(4, checkDBVersion(4));
  }

  function checkDBVersion(dbVer) {
    console.log("Database and Parser version: " + dbVer);

    if (dbVer < Parser.VERSION) {
      // here's where database migrations go, if any
      console.log(
        "Updating database from version " +
          dbVer +
          " to version " +
          Parser.VERSION
      );
      if (dbVer === 1) {
        migrateVersion1ToVersion2();
        // migrate will call back to check DB version after updating the version
        return;
      } else if (dbVer === 2) {
        migrateVersion2ToVersion3();
        return;
      } else if (dbVer === 3) {
        migrateVersion3ToVersion4();
        return;
      }
    } else if (dbVer > Parser.VERSION) {
      showMessage(
        "Warning: Loading Newer Database in Older App",
        "The app should function normally, however the database is newer than the app, and some unexpected errors may occur.",
        { sticky: true }
      );
    }

    setLoadMessage("Database and Parser Version " + dbVer);
    callback();
  }

  DB.getDBVersion(checkDBVersion);
};
