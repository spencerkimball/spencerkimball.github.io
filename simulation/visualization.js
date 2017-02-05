// This file defines the visual elements corresponding to the CockroachDB
// distributed system and their animations.

var viewWidth = 960, viewHeight = 500
var timeScale = 2 // multiple for slowing down (< 1) or speeding up (> 1) animations
var color = d3.scale.category20()

d3.selection.prototype.moveToBack = function() {
  return this.each(function() {
    var firstChild = this.parentNode.firstChild
    if (firstChild) {
      this.parentNode.insertBefore(this, firstChild)
    }
  })
}

function addModel(model) {
  var div = d3.select("#" + model.id)

  model.svgParent = div.append("div")
    .classed("model-container", true)
    .style("position", "relative")
    .style("padding-bottom", (100 * model.height / model.width) + "%")
    .append("svg")
    .attr("preserveAspectRatio", "xMinYMin meet")
    .attr("viewBox", "0 0 " + model.width + " " + model.height)
    .classed("model-content-responsive", true)

  if (model.projection) {
    layoutProjection(model)
  }

  model.svg = model.svgParent.append("g")
  model.defs = model.svg.append("defs")
  model.skin.init(model)

  if (model.displaySimState) {
    model.rpcSendCount = 0
    model.svg.append("text")
      .attr("class", "stats")
      .attr("id", "rpc-count")
      .attr("x", 20)
      .attr("y", 32)

    model.bytesXfer = 0
    model.svg.append("text")
      .attr("class", "stats")
      .attr("id", "bytes-xfer")
      .attr("x", 20)
      .attr("y", 54)

    model.svg.append("text")
      .attr("class", "stats")
      .attr("id", "elapsed")
      .attr("x", model.width-20)
      .attr("y", 32)
      .style("text-anchor", "end")
  }

  // Add control group to hold play or reload button.
  if (model.enablePlayAndReload) {
    model.controls = model.svgParent.append("g")
    model.controls.append("rect")
      .attr("class", "controlscreen")
    model.controls.append("image")
      .attr("class", "button-image")
      .attr("x", "50%")
      .attr("y", "50%")
      .attr("width", 200)
      .attr("height", 200)
      .attr("transform", "translate(-100,-100)")
      .on("click", function() { model.start() })
  }

  model.layout()

  if (model.enableAddNodeAndApp) {
    row = div.append("table")
      .attr("width", "100%")
      .append("tr")
    for (var i = 0; i < model.datacenters.length; i++) {
      var td = row.append("td")
          .attr("align", "center")
      td.append("input")
        .attr("class", "btn-addnode")
        .attr("type", "button")
        .attr("value", "Add Node")
        .attr("onclick", "addNode(" + model.index + ", " + i + ")")
      td.append("input")
        .attr("class", "btn-addapp")
        .attr("type", "button")
        .attr("value", "Add App")
        .attr("onclick", "addApp(" + model.index + ", " + i + ")")
    }
  }

  if (!model.enablePlayAndReload) {
    model.start()
  }
}

var maxlat = 83, // clip northern and southern poles
    mercatorBounds = [[-180+1e-6, maxlat], [180-1e-6, -maxlat]],
    usStatesBounds = [[-124.626080, 48.987386], [-62.361014, 18.005611]];

function projectBounds(projection, b) {
  var yaw = projection.rotate()[0],
      xymin = projection([b[0][0] - yaw, b[0][1]]),
      xymax = projection([b[1][0] - yaw, b[1][1]]);
  return [xymin, xymax];
}

function redrawProjection(model, redrawParams) {
  if (d3.event) {
    var scale = d3.event.scale,
        t = d3.event.translate;
    // If scaling changes, ignore translation (otherwise touch zooms are weird).
    if (scale != redrawParams.slast) {
      model.projection.scale(scale);
    } else {
      var dx = t[0]-redrawParams.tlast[0],
          dy = t[1]-redrawParams.tlast[1],
          yaw = model.projection.rotate()[0],
          tp = model.projection.translate();

      // Use x translation to rotate based on current scale.
      model.projection.rotate([yaw+360.*dx/model.width*redrawParams.scaleExtent[0]/scale, 0, 0]);
      // Use y translation to translate projection, clamped by min/max.
      var b = projectBounds(model.projection, mercatorBounds);
      if (b[0][1] + dy > 0) dy = -b[0][1];
      else if (b[1][1] + dy < model.height) dy = model.height-b[1][1];
      model.projection.translate([tp[0],tp[1]+dy]);
    }
    // Save last values. Resetting zoom.translate() and scale() would
    // seem equivalent but doesn't seem to work reliably?
    redrawParams.slast = scale;
    redrawParams.tlast = t;
  }

  model.worldG.selectAll("path")
    .attr("d", redrawParams.pathGen);

  // Draw US states if they intersect our viewable area.
  var usB = [model.projection(usStatesBounds[0]), model.projection(usStatesBounds[1])]
  var usScale = (usB[1][1] - usB[0][1]) / model.width
  if (usB[0][0] < model.width && usB[1][0] > 0 && usB[0][1] < model.height && usB[1][1] > 0 && usScale >= 0.2) {
    // Set opacity based on zoom scale.
    model.usStatesG.selectAll("path")
      .attr("d", redrawParams.pathGen)
      .attr("visibility", "visible")
      .style("opacity",  (usScale - 0.2) / (0.33333 - 0.2));
  } else {
    model.usStatesG.selectAll("path")
      .attr("visibility", "hidden");
  }

  model.layout()
}

function layoutProjection(model) {
  var pathGen = d3.geo.path()
      .projection(model.projection);

  // Compute the scale intent (min to max zoom).
  var minScale = model.width / 2 / Math.PI,
      scaleExtent = [minScale, 20 * minScale]

  var dcXYMin = [180, -maxlat],
      dcXYMax = [-180, maxlat]

  for (var i = 0; i < model.datacenters.length; i++) {
    var dc = model.datacenters[i]
    if (dc.location[0] < dcXYMin[0]) {
      dcXYMin[0] = dc.location[0]
    }
    if (dc.location[0] > dcXYMax[0]) {
      dcXYMax[0] = dc.location[0]
    }
    if (dc.location[1] > dcXYMin[1]) {
      dcXYMin[1] = dc.location[1]
    }
    if (dc.location[1] < dcXYMax[1]) {
      dcXYMax[1] = dc.location[1]
    }
  }
  // Compute yaw in order to center the deployed datacenters.
  // Compute scale based on the longitudinal span of datacenters, with
  // a constant factor to provide an inset.
  var yaw = -(dcXYMin[0] + dcXYMax[0]) / 2,
      scale = model.width / ((dcXYMax[0] - dcXYMin[0]) * Math.PI / 180) / 1.75;
  model.projection
    .rotate([yaw, 0])
    .scale(scale);

  var redrawParams = {
    tlast: [0, 0],
    slast: null,
    scaleExtent: scaleExtent,
    pathGen: pathGen,
  };

  // Compute the initial y translation to center the deployed
  // datacenters latitudinally.
  var bDC = [model.projection(dcXYMin), model.projection(dcXYMax)],
      dy = model.height / 2 -(bDC[0][1] + bDC[1][1]) / 2,
      tp = model.projection.translate();
  tp[1] += dy
  model.projection.translate(tp)

  model.zoom = d3.behavior.zoom()
    .translate([0, dy])
    .scale(model.projection.scale())
    .scaleExtent(scaleExtent)
    .on("zoom", function() { redrawProjection(model, redrawParams) });

  model.svgParent
    .attr("class", "projection")
    .call(model.zoom)

  model.projectionG = model.svgParent.append("g")

  model.worldG = model.projectionG.append("g")
  d3.json("https://spencerkimball.github.io/simulation/world.json", function(error, collection) {
    if (error) throw error;
    model.worldG.selectAll("path")
      .data(collection.features)
      .enter().append("path")
      .attr("class", "geopath");
    redrawProjection(model, redrawParams)
  });

  model.usStatesG = model.projectionG.append("g")
  d3.json("https://spencerkimball.github.io/simulation/us-states.json", function(error, collection) {
    if (error) throw error;
    model.usStatesG.selectAll("path")
      .data(collection.features)
      .enter().append("path")
      .attr("class", "geopath");
    redrawProjection(model, redrawParams)
  });
}

function removeModel(model) {
  d3.select("#" + model.id).select(".model-container").remove()
}

function layoutModel(model) {
  if (model.svg == null) return

  var dcLinkSel = model.svg.selectAll(".dclink")
  dcLinkSel = dcLinkSel.data(model.dcLinks, function(d) { return d.source.id + "-" + d.target.id })
  dcLinkSel.enter().append("line")
    .attr("id", function(d) { return d.source.id + "-" + d.target.id })
    .attr("class", function(d) { return d.clazz })
  dcLinkSel.exit().remove()

  var dcSel = model.svg.selectAll(".dc")
      .data(model.datacenters, function(d) { return d.id })
  model.skin.dc(model, dcSel.enter().append("g")
                .attr("id", function(d) { return d.id })
                .attr("class", "dc")
                .on("click", function() {
                  console.log(model.zoom.scale())
                  console.log(model.zoom.scaleExtent()[1])
                  model.svgParent.transition()
                    .duration(1000)
                    .call(model.zoom.translate(model.zoom.translate()).event)
                }))
  dcSel.exit().remove()

  var linkSel = dcSel.selectAll(".dc-contents").selectAll(".link") // select both switch and node links
      .data(function(d) { return d.nodeLinks }, function(d) { return d.source.id + "-" + d.target.id })
  linkSel.enter().append("line")
    .attr("id", function(d) { return d.source.id + "-" + d.target.id })
    .attr("vector-effect", "non-scaling-stroke")
    .attr("class", function(d) { return d.clazz })
  linkSel.exit().remove()

  var nodeSel = dcSel.selectAll(".dc-contents").selectAll(".node")
      .data(function(d) { return d.roachNodes }, function(d) { return d.id })
  model.skin.node(model, nodeSel.enter().append("g")
                  .attr("id", function(d) { return d.id })
                  .attr("class", "node"))
  nodeSel.exit().remove()

  if (model.enablePlayAndReload) {
    model.controls.transition()
      .duration(100 * timeScale)
      .attr("visibility", model.stopped ? "visible" : "hidden")
    model.controls.select(".button-image")
      .attr("xlink:href", model.played ? "reload-button.png" : "play-button.png")
  }

  model.layout = function() {
    dcSel
      .attr("transform", function(d) {
        var loc = model.projection(d.location)
        d.x = loc[0]
        d.y = loc[1]
        return "translate(" + loc + ")"
      })
    dcLinkSel.attr("x1", function(d) { return d.source.x })
      .attr("y1", function(d) { return d.source.y })
      .attr("x2", function(d) { return d.target.x })
      .attr("y2", function(d) { return d.target.y })
    linkSel.attr("x1", function(d) { return d.source.x })
      .attr("y1", function(d) { return d.source.y })
      .attr("x2", function(d) { return 0 })
      .attr("y2", function(d) { return 0 })
  }
  model.layout()
}

function setNodeHealthy(model, n) {
}

function setNodeUnreachable(model, n, endFn) {
  model.svg.select("#" + n.id).selectAll(".roachnode")
}

function packRanges(model, n) {
  if (model.svg == null) return
  model.skin.packRanges(model, n, model.svg.select("#" + n.id).selectAll(".range"))
}

function setAppClass(model, n) {
  model.svg.select("#" + n.id).selectAll("circle").attr("class", n.clazz)
}

function sendRequest(model, payload, link, reverse, endFn) {
  // Light up link connection to show activity.
  if (link.source.clazz == "roachnode" || link.source.clazz == "dc") {
    var stroke = "#aaa"
    var width = Math.min(3, payload.radius())
    model.svg.select("#" + link.source.id + "-" + link.target.id)
      .transition()
      .duration(0.8 * link.latency * timeScale)
      .style("stroke-width", width)
      .transition()
      .duration(0.2 * link.latency * timeScale)
      .style("stroke-width", 0)
  }

  model.skin.sendRequest(model, payload, link, reverse, endFn)
}

// Animate circle which is the request along the link. If the supplied
// endFn returns false, show a quick red flash around the source node.
function animateRequest(model, payload, link, reverse, endFn) {
  var source = link.source,
      target = link.target
  if (reverse) {
    source = link.target
    target = link.source
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
    .attrTween("cx", function(d, i, a) {return function(t) { return source.x + (target.x - source.x) * t }})
    .attrTween("cy", function(d, i, a) {return function(t) { return source.y + (target.y - source.y) * t }})
    .each("end", function() {
      circle.remove()
      if (model.displaySimState) {
        model.rpcSendCount++
        model.bytesXfer += payload.size * model.unitSize
        model.svg.select("#rpc-count").text("RPCs: " + model.rpcSendCount)
        model.svg.select("#bytes-xfer").text("MBs: " + Math.round(model.bytesXfer / (1<<20)))
        model.svg.select("#elapsed").text("Elapsed: " + Number(model.elapsed() / 1000).toFixed(1) + "s")
      }
      if (!endFn()) {
        model.svg.select("#" + target.id).append("circle")
          .attr("r", payload.radius())
          .attr("class", "request node-full")
          .transition()
          .duration(75 * timeScale)
          .attr("r", target.radius * 1.2)
          .transition()
          .remove()
      }
    })
}

function clearRequests(model) {
  var sel = model.svg.selectAll(".request")
  sel.transition().duration(0).remove()
}
