const MPQArchive = require("empeeku/mpyq").MPQArchive;
const XRegExp = require("xregexp");

function getBattletags(archive) {
  const data = new MPQArchive(archive);
  const battlelobby = data.readFile("replay.server.battlelobby").toString();

  const btagRegExp = XRegExp("(\\p{L}|\\d){3,24}#\\d{4,10}[zØ]?", "g");
  const matches = battlelobby.match(btagRegExp);

  // process
  const tagMap = [];
  for (const match of matches) {
    // split into name + tag
    const name = match.substr(0, match.indexOf("#"));
    const tag = match.substr(match.indexOf("#") + 1);
    tagMap.push({ tag, name, full: match });
    console.log("found tag: " + match);
  }

  return tagMap;
}

exports.get = getBattletags;
