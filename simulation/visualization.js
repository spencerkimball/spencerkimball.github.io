// This file defines the visual elements corresponding to the CockroachDB
// distributed system and their animations.

var viewWidth = 960, viewHeight = 500;
var timeScale = 2; // multiple for slowing down (< 1) or speeding up (> 1) animations
var color = d3.scale.category20();

d3.selection.prototype.moveToBack = function() {
  return this.each(function() {
    var firstChild = this.parentNode.firstChild;
    if (firstChild) {
      this.parentNode.insertBefore(this, firstChild);
    }
  })
}

function addModel(model) {
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
    .text(localityName(model.currentLocality));

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

  if (model.enableAddNodeAndApp) {
    row = div.append("table")
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

function zoomToLocality(model, duration, locality) {
  model.setLocality(locality);
  var bounds = model.bounds();

  var localityLabel = model.svgParent.select(".current-locality");
  localityLabel
    .transition()
    .duration(duration / 2)
    .style("opacity", 0)
    .each("end", function() {
      localityLabel.text(localityName(model.currentLocality))
        .style("opacity", 0)
        .transition()
        .duration(duration / 2)
        .style("opacity", 1);
    });

  var scalex = findScale(bounds[0][0], bounds[1][0], model.width / (Math.PI / 180)),
      scaley = findScale(bounds[0][1], bounds[1][1], model.height / (Math.PI / 90)),
      scale = Math.min(scalex, scaley);

  if (scale == 0) {
    scale = model.scaleExtent[1];
  }

  // Compute the initial translation to center the deployed datacenters.
  //model.projection.scale(scale).translate([0, 0]);
  model.projection.rotate([0, 0]).scale(scale).translate([0, 0]);
  var center = [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2];
  var p = model.projection(center);

  model.svgParent
    .transition()
    .duration(duration)
    .call(model.zoom
          .translate([model.width / 2 - p[0], model.height / 2 - p[1]])
          .scale(scale)
          .event);
}

function layoutProjection(model) {
  var pathGen = d3.geo.path().projection(model.projection);

  // Compute the scale intent (min to max zoom).
  var minScale = model.width / 2 / Math.PI,
      maxScale = maxScaleFactor * minScale,
      scaleExtent = [minScale, maxScale];

  model.scaleExtent = scaleExtent;
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
        model.usStatesG.selectAll("path")
          .attr("d", pathGen);
        model.usStatesG
          .style("opacity",  (usScale - 0.2) / (0.33333 - 0.2));
      } else {
        model.usStatesG
          .style("opacity", 0);
      }

      // Fade out geographic projection when approaching max scale.
      model.projectionG
        .style("opacity", 1 - s / maxScale)

      model.redraw();
    });

  // Enable this to pan and zoom manually.
  /*model.svgParent
    .attr("class", "projection")
    .call(model.zoom);*/

  d3.select("body")
    .on("keydown", function() {
      if (d3.event.keyCode == 27 /* esc */ && model.currentLocality.length > 0) {
        model.lastLocality = null;
        zoomToLocality(model, 750, model.currentLocality.slice(0, -1));
      }
    });
  model.projectionG = model.svgParent.append("g");

  model.worldG = model.projectionG.append("g");
  d3.json("https://spencerkimball.github.io/simulation/world.json", function(error, collection) {
    if (error) throw error;
    model.worldG.selectAll("path")
      .data(collection.features)
      .enter().append("path")
      .attr("class", "geopath");
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

  zoomToLocality(model, 0, []);
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
  linkSel.exit()
    .transition()
    .duration(250)
    .style("fill-opacity", 0)
    .style("stroke-opacity", 0)
    .remove();

  linkSel.style("fill-opacity", 0)
    .style("stroke-opacity", 0)
    .transition()
    .duration(750)
    .style("fill-opacity", 1)
    .style("stroke-opacity", 1);

  var localitySel = model.svg.selectAll(".locality")
      .data(model.localities, function(d) { return d.id; });
  model.skin
    .locality(model, localitySel.enter().append("g")
              .attr("id", function(d) { return d.id; })
              .attr("class", "locality")
              .on("click", function(d) {
                // Store the transform for the clicked locality; we
                // use this as initial position for the new localities
                // being zoomed.
                model.lastLocality = d;
                zoomToLocality(model, 750, d.locality);
              }));
  localitySel.exit()
    .transition()
    .duration(250)
    .style("fill-opacity", 0)
    .style("stroke-opacity", 0)
    .remove();

  localitySel.style("fill-opacity", 0)
    .style("stroke-opacity", 0)
    .transition()
    .duration(750)
    .style("fill-opacity", 1)
    .style("stroke-opacity", 1);

  if (model.enablePlayAndReload) {
    model.controls.transition()
      .duration(100 * timeScale)
      .attr("visibility", model.stopped ? "visible" : "hidden");
    model.controls.select(".button-image")
      .attr("xlink:href", model.played ? "reload-button.png" : "play-button.png");
  }

  model.redraw = function() {
    localitySel
      .attr("transform", function(d) {
        var loc = model.projection(d.location);
        d.x = loc[0];
        d.y = loc[1];
        return "translate(" + loc + ")";
      });
    linkSel.attr("x1", function(d) { return d.source.x; })
      .attr("y1", function(d) { return d.source.y; })
      .attr("x2", function(d) { return d.target.x; })
      .attr("y2", function(d) { return d.target.y; });
  }
  model.redraw();
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
