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
  return Math.round(bytes * 10 / Math.pow(1024, i), 2) / 10 + ' ' + sizes[i];
}

function bytesToActivity(bytes) {
  var sizes = ['B/s', 'KiB/s', 'MiB/s', 'GiB/s', 'TiB/s'];
  if (bytes == 0) return '0 B/s';
  var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes * 10 / Math.pow(1024, i), 2) / 10 + ' ' + sizes[i];
}

function latencyMilliseconds(latency) {
  return Math.round(latency * 10) / 10 + ' ms';
}

function Localities() {
}

Localities.prototype.init = function(model) {
}

Localities.prototype.maxRadius = function(model) {
  return model.nodeRadius * 1.6;
}

Localities.prototype.locality = function(model, sel) {
  var radius = model.nodeRadius,
      arcWidth = model.nodeRadius / 10;

  sel.attr("transform", "translate(" + -100 + ", " + -100 + ")");

  // Circle for mouse events.
  sel.append("circle")
    .style("opacity", 0)
    .attr("r", radius);

  // Capacity arc.
  sel.append("path")
    .attr("d", function(d) { return createArc(radius, arcWidth, arcAngleFromPct(0), arcAngleFromPct(1)); })
    .attr("class", "capacity-background");
  sel.append("text")
    .attr("class", "capacity-label")
    .attr("x", (radius + arcWidth) * Math.cos(0))
    .attr("text-anchor", "left")
    .text(function(d) { return bytesToSize(d.capacity() * model.unitSize); });

  // Used capacity arc.
  sel.append("path")
    .attr("class", "capacity-used");
  sel.append("text")
    .attr("class", "capacity-used-label");

  // Capacity labels.
  var capacityLabels = sel.append("g")
      .attr("transform", "translate(" + -radius + ", " + -radius + ")");
  var capacityLabelsSVG = capacityLabels.append("svg")
      .attr("width", radius * 2)
      .attr("height", radius * 2);
  capacityLabelsSVG.append("text")
    .attr("class", "capacity-used-pct-label")
    .attr("x", "50%")
    .attr("y", "40%")
    .attr("alignment-baseline", "middle")
    .attr("text-anchor", "middle");
  capacityLabelsSVG.append("text")
    .attr("class", "capacity-used-text")
    .attr("x", "50%")
    .attr("y", "60%")
    .attr("alignment-baseline", "middle")
    .attr("text-anchor", "middle")
    .text("CAPACITY USED");

  // Client / network activity.
  var labelX = radius + arcWidth,
      labelH = 8,
      barsY = (radius - arcWidth) * Math.sin(angleFromPct(0));
  var activityG = sel.append("g")
      .attr("transform", "translate(" + 0 + ", " + barsY + ")");
  activityG.append("line")
    .attr("class", "client-activity")
    .attr("x1", radius - 2)
    .attr("y1", -labelH)
    .attr("y2", -labelH);
  activityG.append("text")
    .attr("class", "client-activity-label")
    .attr("x", labelX)
    .attr("y", -labelH);
  activityG.append("line")
    .attr("class", "network-activity")
    .attr("x1", radius - 2)
    .attr("y1", 0)
    .attr("y2", 0);
  activityG.append("text")
    .attr("class", "network-activity-label")
    .attr("x", labelX)
    .attr("y", 0);

  // Locality label.
  var localityLabels = sel.append("g")
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

Localities.prototype.localityLink = function(model, sel) {
  sel.append("path")
    .attr("id", function(d) { return d.id + "-path"; })
    .attr("class", "locality-link");

  sel.append("text")
    .attr("id", function(d) { return "incoming-" + d.id; })
    .append("textPath")
    .attr("class", "incoming-throughput-label")
    .attr("startOffset", "50%")
    .attr("xlink:href", function(d) { return "#" + d.id + "-path"; });
  sel.append("text")
    .attr("id", function(d) { return "outgoing-" + d.id; })
    .append("textPath")
    .attr("class", "outgoing-throughput-label")
    .attr("startOffset", "50%")
    .attr("xlink:href", function(d) { return "#" + d.id + "-path"; })
  sel.append("text")
    .attr("id", function(d) { return "rtt-" + d.id; })
    .append("textPath")
    .attr("class", "rtt-label")
    .attr("startOffset", "60%")
    .attr("xlink:href", function(d) { return "#" + d.id + "-path"; })
}

Localities.prototype.update = function(model, locSel, linkSel) {
  var radius = model.nodeRadius,
      arcWidth = model.nodeRadius / 10;

  locSel.selectAll(".capacity-used")
    .transition()
    .duration(250)
    .attr("d", function(d) {
      return createArc(radius, arcWidth, arcAngleFromPct(0), arcAngleFromPct(d.usagePct));
    });
  locSel.selectAll(".capacity-used-label")
    .transition()
    .duration(250)
    .attr("x", function(d) { return (radius + arcWidth) * Math.cos(angleFromPct(d.usagePct)); })
    .attr("y", function(d) { return (radius + arcWidth) * Math.sin(angleFromPct(d.usagePct)); })
    .attr("text-anchor", function(d) { return (d.usagePct < 0.75) ? "end" : "start"; })
    .text(function(d) { return bytesToSize(d.usageBytes * model.unitSize); });
  locSel.selectAll(".capacity-used-pct-label")
    .text(function(d) { return Math.round(100 * d.usagePct) + "%"; });

  var barsX = (radius - arcWidth) * Math.cos(angleFromPct(0)),
      barsWidth = radius - barsX - 4;
  locSel.selectAll(".client-activity")
    .transition()
    .duration(250)
    .attr("x2", function(d) { return Math.round(radius - barsWidth * (d.cachedClientActivity / model.maxClientActivity)); });
  locSel.selectAll(".client-activity-label")
    .text(function(d) { return bytesToActivity(d.cachedClientActivity); });
  locSel.selectAll(".network-activity")
    .transition()
    .duration(250)
    .attr("x2", function(d) { return Math.round(radius - barsWidth * (d.cachedTotalNetworkActivity / model.maxNetworkActivity)); });
  locSel.selectAll(".network-activity-label")
    .text(function(d) { return bytesToActivity(d.cachedTotalNetworkActivity); });

  linkSel.selectAll(".incoming-throughput-label")
    .text(function(d) { return "←" + bytesToActivity(d.cachedNetworkActivity[1]); });
  linkSel.selectAll(".outgoing-throughput-label")
    .text(function(d) { return bytesToActivity(d.cachedNetworkActivity[0]) + "→"; });
  linkSel.selectAll(".rtt-label")
    .text(function(d) { return latencyMilliseconds(d.cachedNetworkActivity[2]); });
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
