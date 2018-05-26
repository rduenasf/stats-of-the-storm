const summarizeTrendData = require("./js/database/summarize-trend-data");

var trendsHeroDataFilter;
var trendsMapDataFilter;
var trendsHeroMatchThreshold = 0;
var trendsOverallHeroRowTemplate;
var trendsHeroPickTemplate;
var trendsHeroBanTemplate;
var trendsDateLimits = {
  "1-start": new Date(),
  "1-end": new Date(),
  "2-start": new Date(),
  "2-end": new Date()
};

function initTrendsPage() {
  trendsHeroDataFilter = {
    mode: {
      $in: [
        ReplayTypes.GameMode.UnrankedDraft,
        ReplayTypes.GameMode.HeroLeague,
        ReplayTypes.GameMode.TeamLeague,
        ReplayTypes.GameMode.Custom
      ]
    }
  };
  trendsMapDataFilter = {
    mode: {
      $in: [
        ReplayTypes.GameMode.UnrankedDraft,
        ReplayTypes.GameMode.HeroLeague,
        ReplayTypes.GameMode.TeamLeague,
        ReplayTypes.GameMode.Custom
      ]
    }
  };

  trendsOverallHeroRowTemplate = Handlebars.compile(
    getTemplate("trends", "#trends-hero-summary-row-template").find("tr")[0]
      .outerHTML
  );
  trendsHeroPickTemplate = Handlebars.compile(
    getTemplate("trends", "#trends-hero-pick-row-template").find("tr")[0]
      .outerHTML
  );
  trendsHeroBanTemplate = Handlebars.compile(
    getTemplate("trends", "#trends-hero-pick-ban-template").find("tr")[0]
      .outerHTML
  );

  //tables
  $("#hero-trends-body table").tablesort();
  $("#hero-trends-body table").floatThead({
    scrollContainer: closestWrapper,
    autoReflow: true
  });
  $("#hero-trends-body table th.stat").data("sortBy", function(
    th,
    td,
    tablesort
  ) {
    return parseFloat(td.attr("data-sort-value"));
  });

  // filter
  let filterWidget = $(
    getTemplate("filter", "#filter-popup-widget-template").find(
      ".filter-popup-widget"
    )[0].outerHTML
  );
  filterWidget.attr("widget-name", "hero-trends-filter");

  $("#filter-widget").append(filterWidget);
  initPopup(filterWidget);

  $("#hero-trends-filter-button").popup({
    popup: '.filter-popup-widget[widget-name="hero-trends-filter"]',
    on: "click",
    variation: "fluid",
    closable: false
  });

  // initialize the filter
  for (let m in trendsHeroDataFilter.mode.$in) {
    filterWidget
      .find(".filter-widget-mode")
      .dropdown("set selected", trendsHeroDataFilter.mode.$in[m]);
  }
  bindFilterButton(filterWidget, updateTrendsFilter);
  bindFilterResetButton(filterWidget, resetTrendsFilter);

  // hide the dates, we don't use them here
  filterWidget.find(".date-input").addClass("is-hidden");

  // tooltips
  $("#hero-trends-page-header input").popup({
    on: "focus"
  });

  // init values
  $("#hero-trends-hero-thresh input").val(trendsHeroMatchThreshold);

  $("#hero-trends-page-header .trends-date").datepicker({
    autoHide: false
  });
  $("#hero-trends-page-header .trends-date").on("pick.datepicker", function(e) {
    trendsDateLimits[$(this).attr("name")] = e.date;
  });

  for (let d in trendsDateLimits) {
    $('.trends-date[name="' + d + '"]').datepicker(
      "setDate",
      trendsDateLimits[d]
    );
  }

  // tabs and buttons
  $("#hero-trends-submenu .item").tab();
  $("#hero-trends-submenu .item").click(function() {
    $("#hero-trends-body table").floatThead("reflow");
  });

  $("#hero-trends-body .five.ui.buttons .button").click(function() {
    toggleHeroCollectionType("#hero-trends-body", $(this), "#hero-trends-body");
  });

  $("#trends-print-sections .ui.dropdown")
    .dropdown("get value")
    .split(",");
  $("#trends-file-menu").dropdown({
    onChange: handleTrendsAction
  });
}

function updateTrendsFilter(map, hero) {
  trendsHeroDataFilter = hero;
  trendsMapDataFilter = map;

  loadTrends();
}

function showTrendsSection() {
  $("#trends-file-menu").removeClass("is-hidden");
}

function resetTrendsFilter() {
  trendsHeroDataFilter = {
    mode: {
      $in: [
        ReplayTypes.GameMode.UnrankedDraft,
        ReplayTypes.GameMode.HeroLeague,
        ReplayTypes.GameMode.TeamLeague,
        ReplayTypes.GameMode.Custom
      ]
    }
  };
  trendsMapDataFilter = {
    mode: {
      $in: [
        ReplayTypes.GameMode.UnrankedDraft,
        ReplayTypes.GameMode.HeroLeague,
        ReplayTypes.GameMode.TeamLeague,
        ReplayTypes.GameMode.Custom
      ]
    }
  };

  let filterWidget = $(
    '.filter-popup-widget[widget-name="hero-trends-filter"]'
  );
  for (let m in trendsHeroDataFilter.mode.$in) {
    filterWidget
      .find(".filter-widget-mode")
      .dropdown("set selected", trendsHeroDataFilter.mode.$in[m]);
  }
}

function loadTrends() {
  // hero threshold
  trendsHeroMatchThreshold = $("#hero-trends-hero-thresh input").val();

  // update the queries
  let query1 = Object.assign({}, trendsMapDataFilter);
  query1.$where = function() {
    let d = new Date(this.date);
    return trendsDateLimits["1-start"] <= d && d < trendsDateLimits["1-end"];
  };

  let query2 = Object.assign({}, trendsMapDataFilter);
  query2.$where = function() {
    let d = new Date(this.date);
    return trendsDateLimits["2-start"] <= d && d < trendsDateLimits["2-end"];
  };

  DB.getMatches(query1, function(err, dp1) {
    DB.getMatches(query2, function(err, dp2) {
      $("#hero-trends-body tbody").html("");

      let p1stats = summarizeMatchData(dp1, Heroes);
      let p2stats = summarizeMatchData(dp2, Heroes);

      const { hContext, comps } = summarizeTrendData(p1stats, p2stats, Heroes, trendsHeroMatchThreshold);

      for (let context of hContext) {
        $("#hero-trends-summary tbody").append(
          trendsOverallHeroRowTemplate(context)
        );
        $("#hero-trends-picks tbody").append(trendsHeroPickTemplate(context));
        $("#hero-trends-bans tbody").append(trendsHeroBanTemplate(context));
      }

      for (let c in comps) {
        let comp = comps[c];
        let row =
          '<tr><td class="center aligned" data-sort-value="' +
          c +
          '">' +
          getCompositionElement(comp.roles) +
          "</td>";
        row +=
          '<td class="center aligned" data-sort-value="' +
          comp.p1Win +
          '">' +
          formatStat("pct", comp.p1Win) +
          "</td>";
        row +=
          '<td class="center aligned" data-sort-value="' +
          comp.p2Win +
          '">' +
          formatStat("pct", comp.p2Win) +
          "</td>";
        row +=
          '<td class="center aligned ' +
          (comp.winDelta > 0 ? "plus" : "minus") +
          '" data-sort-value="' +
          comp.winDelta +
          '">' +
          (comp.winDelta > 0 ? "+" : "") +
          formatStat("pct", comp.winDelta) +
          "</td>";
        row +=
          '<td class="center aligned" data-sort-value="' +
          comp.p1Pop +
          '">' +
          formatStat("pct", comp.p1Pop) +
          "</td>";
        row +=
          '<td class="center aligned" data-sort-value="' +
          comp.p2Pop +
          '">' +
          formatStat("pct", comp.p2Pop) +
          "</td>";
        row +=
          '<td class="center aligned ' +
          (comp.popDelta > 0 ? "plus" : "minus") +
          '" data-sort-value="' +
          comp.popDelta +
          '">' +
          (comp.popDelta > 0 ? "+" : "") +
          formatStat("pct", comp.popDelta) +
          "</td></tr>";

        $("#hero-trends-comps tbody").append(row);
      }

      $("#hero-trends-body table").floatThead("reflow");
      $("#hero-trends-body th").removeClass("sorted ascending descending");
    });
  });
}

function layoutTrendsPrint(sections) {
  let sects = sections;
  if (!sects) {
    sects = [
      "hero-trends-summary",
      "hero-trends-picks",
      "hero-trends-bans",
      "hero-trends-comps"
    ];
  }

  clearPrintLayout();
  addPrintHeader("Hero Trends");
  addPrintDate();
  $("#print-window .contents").append(
    "<p>[1] From: " +
      trendsDateLimits["1-start"] +
      " To: " +
      trendsDateLimits["1-end"]
  );
  $("#print-window .contents").append(
    "<p>[2] From: " +
      trendsDateLimits["2-start"] +
      " To: " +
      trendsDateLimits["2-end"]
  );

  for (let section of sects) {
    let sectionName = $("#" + section).attr("title");
    addPrintPage(section);
    addPrintSubHeader(sectionName, section);
    copyFloatingTable($("#" + section), getPrintPage(section));
  }

  $("#print-window")
    .find(".plus")
    .removeClass("plus")
    .addClass("positive");
  $("#print-window")
    .find(".minus")
    .removeClass("minus")
    .addClass("negative");
}

function printTrends(filename, section) {
  layoutTrendsPrint(section);
  renderAndPrint(filename, "Letter", true);
}

function handleTrendsAction(value, text, $elem) {
  if (value === "print") {
    dialog.showSaveDialog(
      {
        title: "Print Trends Report",
        filters: [{ name: "pdf", extensions: ["pdf"] }]
      },
      function(filename) {
        if (filename) {
          printTrends(filename, null);
        }
      }
    );
  } else if (value === "print-sections") {
    $("#trends-print-sections")
      .modal({
        onApprove: function() {
          dialog.showSaveDialog(
            {
              title: "Print Trends Report",
              filters: [{ name: "pdf", extensions: ["pdf"] }]
            },
            function(filename) {
              if (filename) {
                let sections = $("#trends-print-sections .ui.dropdown")
                  .dropdown("get value")
                  .split(",");
                printTrends(filename, sections);
              }
            }
          );
        },
        closable: false
      })
      .modal("show");
  }
}
