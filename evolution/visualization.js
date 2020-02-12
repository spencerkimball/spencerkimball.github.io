// This file defines the visual elements corresponding to the CockroachDB
// distributed system and their animations.

var viewWidth = 960, viewHeight = 640;
var timeScale = 5; // multiple for slowing down (< 1) or speeding up (> 1) animations
var activityColors = ["#00ff00", "#36cc00","#91cc00","#eccc00","#ffb000","#ff4e00","#ff0000"];

function scrollPage(model, el, endFn) {
  var offsetTop = window.pageYOffset || document.documentElement.scrollTop;
  d3.transition()
    .each("end", function () { if (endFn != null) endFn(); })
      .duration(400)
    .ease('cubic-in-out')
    .tween("scroll", (offset => () => {
      var i = d3.interpolateNumber(offsetTop, offset);
      return t => scrollTo(0, i(t));
    })(offsetTop + el.getBoundingClientRect().top));
}

function addModel(model) {
  window.onpopstate = function(event) {
    if (event.state == null) {
      console.log("event state is null")
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
  var startExplanation = div.append("div");
  startExplanation.attr("class", "explanation")
    .html(model.startExplanationHTML);
  var button = startExplanation.append("button");
  var span = button.append("span")
      .html("Start the Simulation");

  button.attr("class", "button start")
    .on("click", function() {
      model.startFn(model);
      //scrollPage(model, document.getElementById(model.id), function() { model.startFn(model); });
      button.attr("class", "button next")
        .on("click", function() {
          model.stepFn(model);
          //button.remove();
          var explain = div.append("div");
          explain.attr("class", "explanation")
            .html(model.nextStepExplanationHTML);
          var toggle = explain.append("button");
          var toggleSpan = toggle.append("span");
          toggle.attr("class", "button stop")
            .on("click", function() {
              if (toggleSpan.html() == "Stop the Simulation") {
                toggleSpan.html("Continue the Simulation");
                toggle.attr("class", "button next")
                model.stop();
              } else {
                toggleSpan.html("Stop the Simulation");
                toggle.attr("class", "button stop")
                model.start();
              }
            });
          toggleSpan.html("Stop the Simulation");
          //scrollPage(model, document.getElementById(model.id + "-container"),
          //function() {  });
          zoomToLocality(model, 750, model.currentLocality, true);
        });
      span.html(model.nextStepHTML);
      model.start();
    })
    .style("vertical-align", "middle");

  model.svgParent = div.append("div")
    .attr("id", model.id + "-container")
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

  var domain = [0, model.maxClientActivity],
      step = d3.scale.linear().domain([1,activityColors.length]).range(domain);
  model.activityScale = d3.scale.linear().domain([step(1), step(2), step(3), step(4), step(5), step(6), step(7), step(8), step(9), step(10), step(11)])
    .interpolate(d3.interpolateHcl)
    .range(activityColors);

  var activityGradient = model.defs.append("svg:linearGradient")
      .attr("id", model.id + "-gradient")
      .attr("x1", "100%")
      .attr("y1", "100%")
      .attr("x2", "0%")
      .attr("y2", "100%")
      .attr("spreadMethod", "pad");
  for (var i = 0; i < activityColors.length; i++) {
    var offset = i * (100 / (activityColors.length - 1));
    activityGradient.append("stop").attr("offset", offset + "%").attr("stop-color", activityColors[i]).attr("stop-opacity", 1);
  }

  // Current locality label.
  model.backArrow = model.svgParent.append("svg")
    .attr("width", "45.58px")
    .attr("height", "45.58px");
  model.backArrow.append("path")
    .attr("class", "back-arrow")
    .attr("transform", "scale(0.8)")
    .attr("d", "M45.506,33.532c-1.741-7.42-7.161-17.758-23.554-19.942V7.047c0-1.364-0.826-2.593-2.087-3.113c-1.261-0.521-2.712-0.229-3.675,0.737L1.305,19.63c-1.739,1.748-1.74,4.572-0.001,6.32L16.19,40.909c0.961,0.966,2.415,1.258,3.676,0.737c1.261-0.521,2.087-1.75,2.087-3.113v-6.331c5.593,0.007,13.656,0.743,19.392,4.313c0.953,0.594,2.168,0.555,3.08-0.101C45.335,35.762,45.763,34.624,45.506,33.532z")
    .style("visibility", "hidden")
    .on("click", function() { zoomToLocality(model, 750, model.currentLocality.slice(0, model.currentLocality.length-1)); });

  model.svgParent.append("text")
    .attr("class", "current-locality")
    .attr("dx", function(d) { return "50"; })
    .attr("dy", function(d) { return "1em"; })
    .text(fullLocalityName(model.currentLocality, model));

  model.layout();
}

var usStatesBounds = [[-124.626080, 48.987386], [-62.361014, 18.005611]],
    maxLatitude = 83, // clip northern and southern poles
    maxScaleFactor = 100;

function findScale(b1, b2, factor, vertical) {
  if (b1 == b2) {
    return 0.0;
  } else if (b1 > b2) {
    var tmp = b1;
    b1 = b2;
    b2 = tmp;
  }
  // Compute scale based on the latitudinal / longitudinal span of
  // this locality, with a constant factor to provide an inset.
  var inset = vertical ? 1.2 : 1.35;
  return factor / (b2 - b1) / inset;
}

function zoomToLocality(model, duration, locality, updateHistory) {
  var topLevel = model.currentLocality.length == 0;
  if (!model.setLocality(locality)) {
    return;
  }

  // Add label.
  model.svgParent.select(".back-arrow")
    .style("visibility", function() { return model.currentLocality.length > 0 ? "visible" : "hidden"; })
  var localityLabel = model.svgParent.select(".current-locality");
  localityLabel.text(fullLocalityName(model.currentLocality, model));

  var bounds = model.bounds(),
      scalex = findScale(bounds[0][0], bounds[1][0], model.width / (Math.PI / 180), false),
      scaley = findScale(bounds[0][1], bounds[1][1], model.height / (Math.PI / 90), true),
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
      model.localities[i].adjustLocation(i, model.localities.length, 0.24 * model.width)
    }
    bounds = model.bounds();
  }

  model.layout();
  model.svgParent
    .transition()
    .duration(duration)
    .call(model.zoom
          .translate([model.width / 2 - p[0], model.height / 2 - p[1]])
          .scale(scale)
          .event);

  if (updateHistory) {
    if (topLevel) {
      history.pushState({modelID: model.id, locality: []}, "");
    }
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

      // Draw US states if they intersect our viewable area.
      var usB = [model.projection(usStatesBounds[0]), model.projection(usStatesBounds[1])];
      var usScale = (usB[1][1] - usB[0][1]) / model.width;
      if (usB[0][0] < model.width && usB[1][0] > 0 && usB[0][1] < model.height && usB[1][1] > 0 && usScale >= 0.2) {
        // Set opacity based on zoom scale.
        model.usStatesG.selectAll("path").attr("d", pathGen);
        var opacity = (usScale - 0.2) / (0.33333 - 0.2)
        model.usStatesG.style("opacity",  opacity);
        // Set opacity for the considerably less detailed world map's version of the US.
        model.projectionG.select("#world-840").style("opacity", opacity < 1 ? 1 : 0);
      } else {
        model.usStatesG.style("opacity", 0);
        model.projectionG.select("#world-840").style("opacity", 1);
      }

      // Fade out geographic projection when approaching max scale.
      model.projectionG.style("opacity", 1 - 0.5 * Math.min(1, (s / maxScale)));

      model.redraw();
    });

  // Enable this to pan and zoom manually.
  //model.svgParent.call(model.zoom);

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
    model.worldG.selectAll("path")
      .data(collection.features)
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

  model.projection.scale(model.maxScale);
  zoomToLocality(model, 0, model.currentLocality, false);
}

function removeModel(model) {
  d3.select("#" + model.id).select(".model-container").remove();
}

function layoutModel(model) {
  if (model.svg == null) return;

  var linkSel = model.svg.selectAll(".link");
  linkSel = linkSel.data(model.links, function(d) { return d.source.id + "-" + d.target.id });
  linkSel.enter().append("line")
    .attr("id", function(d) { return d.source.id + "-" + d.target.id; })
    .attr("class", function(d) { return d.clazz; });
  linkSel.exit().remove();

  model.localityLinkSel = model.svg.selectAll(".locality-link-group")
    .data(model.localityLinks, function(d) { return d.id; });
  model.skin
    .localityLink(model, model.localityLinkSel.enter().append("g")
                  .attr("class", "locality-link-group")
                  .attr("opacity", 0)
                  .attr("id", function(d) { return d.id; }));
  model.localityLinkSel.exit().remove();

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
  // Only animate the request if the two localities are visible.
  var sourceLoc = source.belongsToLoc,
      targetLoc = target.belongsToLoc;
  if (sourceLoc == null || targetLoc == null || !(targetLoc.id in sourceLoc.links)) {
    endFn();
    return;
  }
  var sourcePos = sourceLoc.pos,
      targetPos = targetLoc.pos,
      radius = payload.radius(),
      opacity = 1;
  if (payload.typ != "replicate" && payload.typ != "rebalance") {
    radius = 0;
    opacity = 0.2;
  }
  showLink(model, sourceLoc, targetLoc, opacity);

  var circle = model.svg.append("circle")
  circle.attr("class", "request")
    .attr("fill", payload.color())
    .attr("transform", "translate(" + sourcePos + ")")
    .attr("r", radius)
    .transition()
    .ease("linear")
    .duration(500 + link.latency * timeScale)
    .attrTween("transform", function(d, i, a) { return function(t) {
      var link = sourceLoc.links[targetLoc.id],
          path = model.svg.select("#" + link.id + "-path");
      if (path == null || path.node() == null) {
        circle.remove();
        return "";
      }
      var reverse = (link.l1 == targetLoc),
          t = reverse ? (1-t) : t,
          l = path.node().getTotalLength(),
          p = path.node().getPointAtLength(t * l);
      return "translate(" + p.x + "," + p.y + ")";
    }; })
    .each("end", function() {
      circle.remove();
      hideLink(model, sourceLoc, targetLoc, opacity);
      if (!endFn()) {
        model.svg.select("#" + target.id).append("circle")
          .attr("r", radius)
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
