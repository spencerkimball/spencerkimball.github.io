// createArc returns an svg arc object. startAngle and endAngle are
// expressed in radians.
function createArc(radius, width, startAngle, endAngle) {
  return d3.svg.arc()
    .innerRadius(radius - width)
    .outerRadius(radius)
    .startAngle(startAngle)
    .endAngle(endAngle)()
}

function arcAngleFromPct(pct) {
  return Math.PI * (pct * 1.25 - 0.75);
}

function angleFromPct(pct) {
  return Math.PI * (-1.25 + 1.25 * pct);
}

function bytesToSize(bytes) {
  var sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  if (bytes == 0) return '0 B';
  var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
}

function Localities() {
}

Localities.prototype.init = function(model) {
}

Localities.prototype.locality = function(model, sel) {
  var g = sel.append("g"),
      bounds = model.bounds(),
      radius = model.nodeRadius,
      arcWidth = model.nodeRadius / 10;

  // Capacity arc.
  g.append("path")
    .attr("d", function(d) { return createArc(radius, arcWidth, arcAngleFromPct(0), arcAngleFromPct(1)); })
    .attr("class", "capacity-background");
  g.append("text")
    .attr("class", "capacity-label")
    .attr("x", (radius + arcWidth) * Math.cos(0))
    .attr("text-anchor", "left")
    .text(function(d) { return bytesToSize(d.capacity() * model.unitSize); });

  // Used capacity arc.
  g.append("path")
    .attr("d", function(d) {
      var capacity = d.capacity(),
          usage = d.usage();
      return createArc(radius, arcWidth, arcAngleFromPct(0), arcAngleFromPct(usage / capacity));
    })
    .attr("class", "capacity-used");
  g.append("text")
    .attr("class", "capacity-used-label")
    .attr("x", function(d) {
      var capacity = d.capacity(),
          usage = d.usage();
      return (radius + arcWidth) * Math.cos(angleFromPct(usage / capacity));
    })
    .attr("y", function(d) {
      var capacity = d.capacity(),
          usage = d.usage();
      return (radius + arcWidth) * Math.sin(angleFromPct(usage / capacity));
    })
    .attr("text-anchor", function(d) {
      var capacity = d.capacity(),
          usage = d.usage();
      return (usage / capacity < 0.75) ? "end" : "start";
    })
    .text(function(d) { return bytesToSize(d.usage() * model.unitSize); });

  // Capacity labels.
  var capacityLabels = g.append("g")
      .attr("transform", "translate(" + -radius + ", " + -radius + ")");
  var capacityLabelsSVG = capacityLabels.append("svg")
      .attr("width", radius * 2)
      .attr("height", radius * 2);
  capacityLabelsSVG.append("text")
    .attr("class", "capacity-used-pct-label")
    .attr("x", "50%")
    .attr("y", "40%")
    .attr("alignment-baseline", "middle")
    .attr("text-anchor", "middle")
    .text(function(d) {
      var capacity = d.capacity(),
          usage = d.usage();
      return Math.round(100 * usage / capacity) + "%";
    });
  capacityLabelsSVG.append("text")
    .attr("class", "capacity-used-text")
    .attr("x", "50%")
    .attr("y", "60%")
    .attr("alignment-baseline", "middle")
    .attr("text-anchor", "middle")
    .text("CAPACITY USED");

  // Locality label.
  var localityLabels = g.append("g")
      .attr("transform", "translate(" + -radius + ", " + radius * 0.9 + ")");
  localityLabels.append("path")
    .attr("d", function(d) { return drawBox(radius * 2, 20, 0.05); })
    .attr("class", "locality-label-background")
  localityLabels.append("svg")
    .attr("width", function(d) { return radius * 2 })
    .attr("height", "20")
    .append("text")
    .attr("class", "locality-label")
    .attr("x", "50%")
    .attr("y", "55%")
    .attr("alignment-baseline", "middle")
    .attr("text-anchor", "middle")
    .text(function(d) { return d.name; });
}

Localities.prototype.node = function(model, sel) {
  return sel.append("circle")
    .attr("vector-effect", "non-scaling-stroke")
    .attr("class", function(d) { return d.clazz; });
}

Localities.prototype.packRanges = function(model, n, sel) {
  var pctUsage = Math.floor(n.pctUsage(true));
  //model.svg.select("#" + n.id).selectAll(".roachnode")
    //.style("fill", "url(#fullnessGradient-" + pctUsage + ")")
}

Localities.prototype.sendRequest = function(model, payload, link, reverse, endFn) {
  setTimeout(function() { endFn(); }, link.latency * timeScale);
}
