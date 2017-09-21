// This file defines the visual elements corresponding to the CockroachDB
// distributed system and their animations.

var viewWidth = 960, viewHeight = 500;
var timeScale = 2; // multiple for slowing down (< 1) or speeding up (> 1) animations
var globalWorld = [];
var populationScale = d3.scale.sqrt();
var globalCities = [];
var globalCityMap = {};
//var latencyColors = ["#ff0000","#ff4e00","#ffb000","#eccc00","#91cc00","#36cc00","#00cc7f","#00b2cc","#0033cc","#5a00cc","#0000ff"];
var latencyColors = ["#0000ff","#5a00cc","#0033cc","#00b2cc","#00cc7f","#36cc00","#91cc00","#eccc00","#ffb000","#ff4e00","#ff0000"];
var color = d3.scale.category20();

function lookupCityLocation(name) {
  if (name in globalCityMap) {
    return [globalCityMap[name].longitude, globalCityMap[name].latitude];
  } else if (globalCities.length > 0) {
    alert("The deployment specifies a facility in city=\"" + name + "\", but the location of that city is unknown; using \"San Francisco\" as the location.");
    return [globalCityMap["San Francisco"].longitude, globalCityMap["San Francisco"].latitude];
  }
  return [0, 0];
}

function addModel(model) {
  window.onpopstate = function(event) {
    if (event.state == null) {
      for (var i = 0; i < models.length; i++) {
        zoomToLocality(models[i], 750, []);
      }
      return;
    }
    var model = findModel(event.state.modelID),
        locality = event.state.locality;
    zoomToLocality(model, 750, locality);
  }

  var div = d3.select("#" + model.id);

  model.svgParent = div.append("div")
    .classed("model-container", true)
    .style("position", "relative")
    .style("padding-bottom", (100 * model.height / model.width) + "%")
    .append("svg")
    .attr("preserveAspectRatio", "xMinYMin meet")
    .attr("viewBox", "0 0 " + model.width + " " + model.height)
    .classed("model-content-responsive", true);

  if (model.projection) {
    layoutProjection(model);
  }

  model.svg = model.svgParent.append("g");
  model.defs = model.svg.append("defs");
  model.skin.init(model);

  // Current locality label.
  model.svgParent.append("text")
    .attr("class", "current-locality")
    .attr("dx", function(d) { return "22"; })
    .attr("dy", function(d) { return "1em"; })
    .text(fullLocalityName(model.currentLocality, model));

  if (model.displaySimState) {
    model.rpcSendCount = 0;
    model.svg.append("text")
      .attr("class", "stats")
      .attr("id", "rpc-count")
      .attr("x", 20)
      .attr("y", 32);

    model.bytesXfer = 0;
    model.svg.append("text")
      .attr("class", "stats")
      .attr("id", "bytes-xfer")
      .attr("x", 20)
      .attr("y", 54);

    model.svg.append("text")
      .attr("class", "stats")
      .attr("id", "elapsed")
      .attr("x", model.width-20)
      .attr("y", 32)
      .style("text-anchor", "end");
  }

  // Add control group to hold play or reload button.
  if (model.enablePlayAndReload) {
    model.controls = model.svgParent.append("g");
    model.controls.append("rect")
      .attr("class", "controlscreen");
    model.controls.append("image")
      .attr("class", "button-image")
      .attr("x", "50%")
      .attr("y", "50%")
      .attr("width", 200)
      .attr("height", 200)
      .attr("transform", "translate(-100,-100)")
      .on("click", function() { model.start(); });
  }

  model.layout();

  var button = div.append("button")
      .attr("class", "button")
      .attr("id", "show-latencies")
      .on("click", function() { toggleLatenciesByCity(model); })
      .style("vertical-align", "middle")
      .append("span")
      .html("Show Customer Latencies");

  if (model.enableAddNodeAndApp) {
    var row = div.append("table")
      .attr("width", "100%")
      .append("tr");
    for (var i = 0; i < model.datacenters.length; i++) {
      var td = row.append("td")
          .attr("align", "center");
      td.append("input")
        .attr("class", "btn-addnode")
        .attr("type", "button")
        .attr("value", "Add Node")
        .attr("onclick", "addNode(" + model.index + ", " + i + ")");
      td.append("input")
        .attr("class", "btn-addapp")
        .attr("type", "button")
        .attr("value", "Add App")
        .attr("onclick", "addApp(" + model.index + ", " + i + ")");
    }
  }

  if (!model.enablePlayAndReload) {
    model.start();
  }
}

var usStatesBounds = [[-124.626080, 48.987386], [-62.361014, 18.005611]],
    maxLatitude = 83, // clip northern and southern poles
    maxScaleFactor = 100;

function findScale(b1, b2, factor) {
  if (b1 == b2) {
    return 0.0;
  } else if (b1 > b2) {
    var tmp = b1;
    b1 = b2;
    b2 = tmp;
  }
  // Compute scale based on the latitudinal / longitudinal span of
  // this locality, with a constant factor to provide an inset.
  return factor / (b2 - b1) / 1.2;
}

function zoomToLocality(model, duration, locality, updateHistory) {
  model.setLocality(locality);

  // Add label.
  var localityLabel = model.svgParent.select(".current-locality");
  localityLabel
    .transition()
    .duration(duration / 2)
    .style("opacity", 0)
    .each("end", function() {
      localityLabel.text(fullLocalityName(model.currentLocality, model))
        .style("opacity", 0)
        .transition()
        .duration(duration / 2)
        .style("opacity", 1);
    });

  var bounds = model.bounds(),
      scalex = findScale(bounds[0][0], bounds[1][0], model.width / (Math.PI / 180)),
      scaley = findScale(bounds[0][1], bounds[1][1], model.height / (Math.PI / 90)),
      scale = scalex == 0 ? scaley : (scaley == 0 ? scalex : Math.min(scalex, scaley)),
      needAdjust = false;

  if (scale == 0) {
    needAdjust = true;
    scale = model.maxScale * Math.pow(4, locality.length);
  }

  // Compute the initial translation to center the deployed datacenters.
  model.projection.rotate([0, 0]).scale(scale).translate([0, 0]);
  var center = [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2];
  var p = model.projection(center);

  // If necessary (all localities had the same location), adjust the
  // location of each localities so there's some differentiation for
  // display purposes.
  if (needAdjust) {
    for (var i = 0; i < model.localities.length; i++) {
      model.localities[i].adjustLocation(i, model.localities.length, 0.15 * model.width)
    }
    bounds = model.bounds();
  }

  model.svgParent
    .transition()
    .duration(duration)
    .call(model.zoom
          .translate([model.width / 2 - p[0], model.height / 2 - p[1]])
          .scale(scale)
          .event);

  if (updateHistory) {
    history.pushState({modelID: model.id, locality: model.currentLocality.slice(0)}, "");
  }
}

function layoutProjection(model) {
  var pathGen = d3.geo.path().projection(model.projection);

  // Compute the scale intent (min to max zoom).
  var minScale = model.width / 2 / Math.PI,
      maxScale = maxScaleFactor * minScale,
      scaleExtent = [minScale, maxScale * 1024];

  model.maxScale = maxScale;
  model.zoom = d3.behavior.zoom()
    .scaleExtent(scaleExtent)
    .on("zoom", function() {
      // Instead of translating the projection, rotate it (compute yaw as longitudinal rotation).
      var t = model.zoom.translate(),
          s = model.zoom.scale(),
          yaw = 360 * (t[0] - model.width / 2) / model.width * (minScale / s);
      // Compute limits for vertical translation based on max latitude.
      model.projection.scale(s).translate([0, 0]);
      var p = model.projection([0, maxLatitude]);
      if (t[1] > -p[1]) {
        t[1] = -p[1];
      } else if (t[1] - p[1] < model.height) {
        t[1] = model.height + p[1];
      }
      t[0] = model.width / 2;
      model.projection
        .rotate([yaw, 0])
        .translate(t)
        .scale(s);

      model.worldG.selectAll("path").attr("d", pathGen);

      if (model.showLatencies) {
        var peoplePerPixel = 2000000000 / (s * s),
            peopleMax = populationScale.domain()[1],
            rMin = 0,
            rMax = Math.sqrt(peopleMax / (peoplePerPixel * Math.PI));
        populationScale.range([rMin, rMax]);
        var domain = [d3.min(model.filteredCities, function(d) { return d3.min(model.localityLatencies(d)); }),
                      d3.max(model.filteredCities, function(d) { return d3.max(model.localityLatencies(d)); })],
            step = d3.scale.linear().domain([1,latencyColors.length]).range(domain),
            latencyScale = d3.scale.linear().range([0, viewWidth / 3]).domain(domain),
            colorScale = d3.scale.linear().domain([step(1), step(2), step(3), step(4), step(5), step(6), step(7), step(8), step(9), step(10), step(11)])
            .interpolate(d3.interpolateHcl)
            .range(latencyColors),
            legend = model.svgParent.select(".latency-legend");

        model.latencyLegend.scale(latencyScale)
          .tickSize(2, 2)
          .ticks(11)
          .tickFormat(d => d + " ms");
        legend.call(model.latencyLegend)
          .selectAll("text")
          .attr("y", -20)
          .attr("x", -7)
          .attr("dy", ".35em")
          .attr("transform", "translate(0,30)rotate(-45)")
          .style("text-anchor", "start");
        legend.select("rect")
          .attr("transform", "translate(0, -10)")
          .attr("width", latencyScale.range()[1])
          .attr("height", 10);

        minAvailable = function(latencies) {
          var min = domain[1];
          for (var i = 0; i < latencies.length; i++) {
            if (model.localities[i].state() != "unavailable" && latencies[i] < min) {
              min = latencies[i];
            }
          }
          return min;
        }

        var citiesSel = model.projectionG.selectAll(".city");
        citiesSel.attr("transform", function(d) {
            var coords = model.projection([d.longitude, d.latitude]);
            return "translate(" + coords[0] + "," + coords[1] + ")";
        });
        citiesSel.selectAll("text")
          .attr("x", function(d) { return populationScale(d.population); });
        citiesSel.selectAll(".population")
          .attr("r", function(d) { return populationScale(d.population); })
          .style("fill", function(d) { return colorScale(minAvailable(model.localityLatencies(d))); })
          .on("click", function(d) {
            if (model.showCityDetail != d.name) {
              model.showCityDetail = d.name;
            } else {
              model.showCityDetail = null;
            }
            setLocalitiesVisibility(model);
          })
          .on("mouseover", function(d) {
            var latency = minAvailable(model.localityLatencies(d));
          })
          .on("mouseout", function(d) {
          });
      }

      // Draw US states if they intersect our viewable area.
      var usB = [model.projection(usStatesBounds[0]), model.projection(usStatesBounds[1])];
      var usScale = (usB[1][1] - usB[0][1]) / model.width;
      if (usB[0][0] < model.width && usB[1][0] > 0 && usB[0][1] < model.height && usB[1][1] > 0 && usScale >= 0.2) {
        // Set opacity based on zoom scale.
        model.usStatesG.selectAll("path").attr("d", pathGen);
        var opacity = (usScale - 0.2) / (0.33333 - 0.2)
        model.usStatesG.style("opacity",  opacity);
        model.projectionG.select("#world-840").style("opacity", opacity < 1 ? 1 : 0);
      } else {
        model.usStatesG.style("opacity", 0);
        model.projectionG.select("#world-840").style("opacity", 1);
      }

      // Fade out geographic projection when approaching max scale.
      model.projectionG.style("opacity", 1 - 0.5 * Math.min(1, (s / maxScale)));

      setLocalitiesVisibility(model);

      model.redraw();
    });

  // Enable this to pan and zoom manually.
  model.svgParent.call(model.zoom);

  d3.select("body")
    .on("keydown", function() {
      if (d3.event.keyCode == 27 /* esc */ && model.currentLocality.length > 0) {
        window.history.back();
      }
    });
  model.projectionG = model.svgParent.append("g");
  model.projectionG
    .append("rect")
    .attr("class", "projection");

  model.worldG = model.projectionG.append("g");
  d3.json("https://spencerkimball.github.io/simulation/world.json", function(error, collection) {
    if (error) throw error;
    globalWorld = collection.features;
    model.worldG.selectAll("path")
      .data(globalWorld)
      .enter().append("path")
      .attr("class", "geopath")
      .attr("id", function(d) { return "world-" + d.id; });
    model.projectionG.call(model.zoom.event);
  });

  model.usStatesG = model.projectionG.append("g");
  d3.json("https://spencerkimball.github.io/simulation/us-states.json", function(error, collection) {
    if (error) throw error;
    model.usStatesG.selectAll("path")
      .data(collection.features)
      .enter().append("path")
      .attr("class", "geopath");
    model.projectionG.call(model.zoom.event);
  });

  d3.json("https://spencerkimball.github.io/simulation/cities100000.json", function(error, collection) {
    if (error) throw error;
    globalCities = collection;
    for (var i = 0; i < globalCities.length; i++) {
      var city = globalCities[i];
      if (!(city.name in globalCityMap) || city.population > globalCityMap[city.name].population) {
        globalCityMap[city.name] = city;
      }
    }
    populationScale.domain([0, d3.max(globalCities, function(d) { return d.population; })]);

    var updated = false;
    for (var i = 0; i < model.facilities.length; i++) {
      updated = model.facilities[i].updateLocation() || updated;
    }
    if (updated) {
      zoomToLocality(model, 0, model.currentLocality, false);
    }
    model.projectionG.call(model.zoom.event);
  });

  model.projection.scale(model.maxScale);
  zoomToLocality(model, 0, [], false);
}

function toggleLatenciesByCity(model) {
  if (globalCities.length == 0) {
    alert("Because per city stats could not be loaded, latencies and city populations cannot be modeled.");
    return;
  }

  model.showLatencies = !model.showLatencies;

  if (model.showLatencies && model.filteredCities == null) {
    model.filteredCities = model.filterCities(globalCities);
    var citiesG = model.projectionG.selectAll("g")
        .data(globalCities)
        .enter().append("g")
        .attr("class", "city");
    citiesG.append("circle")
      .attr("class", "population");
    citiesG.append("text")
      .text(function(d) { return d.name; });

    model.latencyLegend = d3.svg.axis().orient("bottom");
    var latencyG = model.svgParent.append("g")
        .attr("class", "latency-legend")
        .attr("transform", "translate(30," + (viewHeight - 30) + ")"),
        latencyGradient = latencyG.append("defs").append("svg:linearGradient")
        .attr("id", "latency-gradient")
        .attr("x1", "0%")
        .attr("y1", "100%")
        .attr("x2", "100%")
        .attr("y2", "100%")
        .attr("spreadMethod", "pad");
    latencyG.append("rect")
      .style("fill", "url(#latency-gradient)");

    for (var i = 0; i < latencyColors.length; i++) {
      var offset = i * (100 / (latencyColors.length - 1));
      latencyGradient.append("stop").attr("offset", offset + "%").attr("stop-color", latencyColors[i]).attr("stop-opacity", 1);
    }
  }
  model.projectionG.call(model.zoom.event);

  var div = d3.select("#" + model.id);
  div.select("#show-latencies").select("span").html(model.showLatencies ? "Show Capacity Utilization" : "Show Customer Latencies");
}

function removeModel(model) {
  d3.select("#" + model.id).select(".model-container").remove();
}

function formatLiveCount(loc) {
  var liveCount = loc.liveCount(),
      cl = loc.state();
  return "<span class=\"" + cl + "\">" + liveCount + " / " + loc.nodes.length + "</span>";
}

var localityTable = [
  { head: "Name", cl: "left", html: function(d) { return d.name; } },
  { head: "Usage", cl: "right", html: function(d) { return bytesToSize(d.usageSize * d.model.unitSize); } },
  { head: "Capacity", cl: "right", html: function(d) { return bytesToSize(d.capacity() * d.model.unitSize); } },
  { head: "Throughput", cl: "right", html: function(d) { return bytesToActivity(d.cachedTotalNetworkActivity * d.model.unitSize); } },
  { head: "Client&nbsp;traffic", cl: "right", html: function(d) { return bytesToActivity(d.cachedClientActivity * d.model.unitSize); } },
  { head: "Status", cl: "right status", html: function(d) { return formatLiveCount(d); } }
];

var databaseTable = [
  { head: "Name", cl: "left", html: function(d) { return d.name; } },
  { head: "Sites", cl: "left", html: function(d) { return d.sites(); } },
  { head: "Usage", cl: "right", html: function(d) { return bytesToSize(d.usage() * d.model.unitSize); } },
  { head: "Throughput", cl: "right", html: function(d) { return bytesToActivity(d.throughput() * d.model.unitSize); } },
  { head: "Avail.", cl: "right", html: function(d) { return (Math.round(d.availability() * 1000) / 10.0) + "%"; } },
  { head: "Rep.&nbsp;lag", cl: "right", html: function(d) { return bytesToSize(d.underReplicated() * d.model.unitSize); } }
];

function layoutModel(model) {
  if (model.svg == null) return;

  var linkSel = model.svg.selectAll(".link");
  linkSel = linkSel.data(model.links, function(d) { return d.source.id + "-" + d.target.id });
  linkSel.enter().append("line")
    .attr("id", function(d) { return d.source.id + "-" + d.target.id; })
    .attr("class", function(d) { return d.clazz; });
  linkSel.exit()
    .remove();

  model.localitySel = model.svg.selectAll(".locality")
      .data(model.localities, function(d) { return d.id; });
  model.skin
    .locality(model, model.localitySel.enter().append("g")
              .attr("id", function(d) { return d.id; })
              .attr("class", "locality")
              .on("click", function(d) {
                hideLocalityLinks(model, d);
                zoomToLocality(model, 750, d.locality, true);
              }));
  model.localitySel.exit()
    .transition()
    .duration(250)
    .style("fill-opacity", 0)
    .style("stroke-opacity", 0)
    .remove();
  model.localitySel.style("fill-opacity", 0)
    .style("stroke-opacity", 0)
    .transition()
    .duration(750)
    .style("fill-opacity", 1)
    .style("stroke-opacity", 1);

  var table = d3.select("#localities");
  table.select("thead").select("tr").selectAll("th")
    .data(localityTable)
    .enter()
    .append("th")
    .attr("class", function(d) { return d.cl; })
    .html(function(d) { return d.head; });
  model.localityRowSel = table.select("tbody").selectAll("tr")
    .data(model.localities, function(d) { return d.id; });
  model.localityRowSel.enter()
    .append("tr")
    .attr("id", function(d) { return d.id; })
    .style("cursor", "pointer")
    .on("mouseover", function(d) { showLocalityLinks(model, d); })
    .on("mouseout", function(d) { hideLocalityLinks(model, d); })
    .on("click", function(d) { zoomToLocality(model, 750, d.locality, true); });
  model.localityRowSel.selectAll("td")
    .data(function(locality) {
      return localityTable.map(function(column) {
        return {column: column, locality: locality};
      });
    })
    .enter()
    .append("td")
    .attr("class", function(d) { return d.column.cl; })
    .on("click", function(d) {
      if (d.column.head == "Status") {
        d3.event.stopPropagation();
        d.locality.toggleState();
        refreshModel(d.locality.model);
      }
    });
  model.localityRowSel.exit().remove();
  model.localityRowSel.style("fill-opacity", 0)
    .style("stroke-opacity", 0)
    .transition()
    .duration(750)
    .style("fill-opacity", 1)
    .style("stroke-opacity", 1);

  table = d3.select("#databases");
  table.select("thead").select("tr").selectAll("th")
    .data(databaseTable)
    .enter()
    .append("th")
    .attr("class", function(d) { return d.cl; })
    .html(function(d) { return d.head; });
  model.databaseRowSel = table.select("tbody").selectAll("tr")
    .data(model.databases, function(d) { return d.id; });
  model.databaseRowSel.enter()
    .append("tr")
    .attr("id", function(d) { return d.id; })
    .on("mouseover", function(d) { showUsageDetail(model, null, d); })
    .on("mouseout", function(d) { hideUsageDetail(model, null); });

  model.databaseRowSel.selectAll("td")
    .data(function(db) {
      return databaseTable.map(function(column) {
        return {column: column, db: db};
      });
    })
    .enter()
    .append("td")
    .attr("class", function(d) { return d.column.cl; });
  model.databaseRowSel.exit().remove();
  model.databaseRowSel.style("fill-opacity", 0)
    .style("stroke-opacity", 0)
    .transition()
    .duration(750)
    .style("fill-opacity", 1)
    .style("stroke-opacity", 1);

  model.localityLinkSel = model.svg.selectAll(".locality-link-group")
    .data(model.localityLinks, function(d) { return d.id; });
  model.skin
    .localityLink(model, model.localityLinkSel.enter().append("g")
                  .attr("class", "locality-link-group")
                  .attr("opacity", 0)
                  .attr("id", function(d) { return d.id; }));
  model.localityLinkSel.exit().remove();

  if (model.enablePlayAndReload) {
    model.controls.transition()
      .duration(100 * timeScale)
      .attr("visibility", model.stopped ? "visible" : "hidden");
    model.controls.select(".button-image")
      .attr("xlink:href", model.played ? "reload-button.png" : "play-button.png");
  }

  model.redraw = function() {
    // Now that we've set the projection and adjusted locality locations
    // in the event there are no differences in location, we can compute
    // the factor we need to scale each locality so that they don't
    // overlap.
    model.computeLocalityScale();

    // Compute locality link paths.
    model.computeLocalityLinkPaths();

    model.localitySel
      .attr("transform", function(d) {
        if (d == null) {
          return;
        }
        d.x = d.pos[0];
        d.y = d.pos[1];
        return "translate(" + d.pos + ")scale(" + model.localityScale + ")";
      });
    model.localityLinkSel.selectAll(".locality-link")
      .attr("d", function(d) { return d3.line().curve(d3.curveCardinalOpen.tension(0.5))(d.points); });
    linkSel.attr("x1", function(d) { return d.source.x; })
      .attr("y1", function(d) { return d.source.y; })
      .attr("x2", function(d) { return d.target.x; })
      .attr("y2", function(d) { return d.target.y; });
  }

  refreshModel(model);
  model.redraw();
}

function refreshModel(model) {
  if (model.svg == null) return;

  model.skin.update(model);

  model.localityRowSel.selectAll("td")
    .html(function(d) { return d.column.html(d.locality); });

  model.databaseRowSel.selectAll("td")
    .html(function(d) { return d.column.html(d.db); });

  model.projectionG.call(model.zoom.event);
}

function setNodeHealthy(model, n) {
}

function setNodeUnreachable(model, n, endFn) {
  model.svg.select("#" + n.id).selectAll(".roachnode");
}

function packRanges(model, n) {
  if (model.svg == null) return;
  model.skin.packRanges(model, n, model.svg.select("#" + n.id).selectAll(".range"));
}

function sendRequest(model, payload, link, reverse, endFn) {
  // Light up link connection to show activity.
  if (link.source.clazz == "roachnode" || link.source.clazz == "locality") {
    var stroke = "#aaa";
    var width = Math.min(3, payload.radius());
    model.svg.select("#" + link.source.id + "-" + link.target.id)
      .transition()
      .duration(0.8 * link.latency * timeScale)
      .style("stroke-width", width)
      .transition()
      .duration(0.2 * link.latency * timeScale)
      .style("stroke-width", 0);
  }

  model.skin.sendRequest(model, payload, link, reverse, endFn);
}

// Animate circle which is the request along the link. If the supplied
// endFn returns false, show a quick red flash around the source node.
function animateRequest(model, payload, link, reverse, endFn) {
  var source = link.source,
      target = link.target;
  if (reverse) {
    source = link.target;
    target = link.source;
  }

  var circle = model.svg.append("circle")
  circle.attr("class", "request")
    .attr("fill", payload.color())
    .attr("cx", source.x)
    .attr("cy", source.y)
    .attr("r", payload.radius())
    .transition()
    .ease("linear")
    .duration(link.latency * timeScale)
    .attrTween("cx", function(d, i, a) {return function(t) { return source.x + (target.x - source.x) * t; }})
    .attrTween("cy", function(d, i, a) {return function(t) { return source.y + (target.y - source.y) * t; }})
    .each("end", function() {
      circle.remove();
      if (model.displaySimState) {
        model.rpcSendCount++;
        model.bytesXfer += payload.size * model.unitSize;
        model.svg.select("#rpc-count").text("RPCs: " + model.rpcSendCount);
        model.svg.select("#bytes-xfer").text("MBs: " + Math.round(model.bytesXfer / (1<<20)));
        model.svg.select("#elapsed").text("Elapsed: " + Number(model.elapsed() / 1000).toFixed(1) + "s");
      }
      if (!endFn()) {
        model.svg.select("#" + target.id).append("circle")
          .attr("r", payload.radius())
          .attr("class", "request node-full")
          .transition()
          .duration(75 * timeScale)
          .attr("r", target.radius * 1.2)
          .transition()
          .remove();
      }
    })
}

function clearRequests(model) {
  var sel = model.svg.selectAll(".request");
  sel.transition().duration(0).remove();
}
