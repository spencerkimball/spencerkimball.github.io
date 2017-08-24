// createArcPath returns an svg arc object. startAngle and endAngle are
// expressed in radians.
function createArcPath(innerR, outerR, startAngle, endAngle) {
  return d3.svg.arc()
    .innerRadius(innerR)
    .outerRadius(outerR)
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

function showUsageDetail(model, d, database) {
  var set = {};
  if (database == "*") {
    for (var i = 0; i < model.databases.length; i++) {
      set[model.databases[i].name] = true;
    }
  } else {
    set[database.name] = true;
  }
  // Show all usages.
  if (d == null) {
    model.localitySel.each(function(d) { d.showDetail = set; });
  } else {
    d.showDetail = set;
  }
  model.skin.update(model);
}

function hideUsageDetail(model, d) {
  if (d == null) {
    model.localitySel.each(function(d) { d.showDetail = null; });
  } else {
    d.showDetail = null;
  }
  model.skin.update(model);
}

function showLocalityLinks(model, locality) {
  model.svg.selectAll(".locality-link-group")
    .transition()
    .duration(250)
    .attr("visibility", function(d) { return (d.l1 == locality || d.l2 == locality) ? "visible" : "hidden"; })
    .attr("opacity", function(d) { return (d.l1 == locality || d.l2 == locality) ? 1 : 0; });
  model.svg.selectAll(".expand-label")
    .transition()
    .duration(250)
    .attr("visibility", function(d) { return (d == locality) ? "visible" : "hidden"; })
    .attr("opacity", function(d) { return (d == locality) ? 1 : 0; });
}

function hideLocalityLinks(model, locality) {
  model.svg.selectAll(".locality-link-group")
    .transition()
    .duration(250)
    .attr("visibility", "hidden")
    .attr("opacity", 0);
  model.svg.selectAll(".expand-label")
    .transition()
    .duration(250)
    .attr("visibility", "hidden")
    .attr("opacity", 0);
}

function Localities() {
}

Localities.prototype.init = function(model) {
}

Localities.prototype.maxRadius = function(model) {
  return model.nodeRadius * 1.6;
}

Localities.prototype.locality = function(model, sel) {
  var innerR = model.nodeRadius,
      arcWidth = model.nodeRadius * 0.11111,
      outerR = innerR + arcWidth;

  sel.attr("transform", "translate(" + -100 + ", " + -100 + ")");

  // Capacity arc.
  var capacityG = sel.append("g");
  capacityG.append("path")
    .attr("d", function(d) { return createArcPath(innerR, outerR, arcAngleFromPct(0), arcAngleFromPct(1)); })
    .attr("class", "capacity-background");
  capacityG.append("text")
    .attr("class", "capacity-label")
    .attr("x", (outerR + arcWidth) * Math.cos(0))
    .attr("text-anchor", "left");

  // Used capacity arc segments (one per database).
  var usedG = sel.append("g");
  var arcSel = usedG.selectAll("path")
      .data(function(d) { return d.getDatabasesByUsage(); });
  arcSel.enter()
    .append("path")
    .attr("class", "capacity-used")
    .attr("id", function(d) { return d.name; });
  arcSel.exit().remove();
  usedG.append("text")
    .attr("class", "capacity-used-label");

  // Capacity labels.
  var capacityLabels = sel.append("g")
      .attr("transform", "translate(" + -outerR + ", " + -outerR + ")");
  var capacityLabelsSVG = capacityLabels.append("svg")
      .attr("width", outerR * 2)
      .attr("height", outerR * 2);
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
  var labelX = outerR + arcWidth,
      labelH = 8,
      barsY = innerR * Math.sin(angleFromPct(0));
  var activityG = sel.append("g")
      .attr("transform", "translate(" + 0 + ", " + barsY + ")");
  activityG.append("line")
    .attr("class", "client-activity")
    .attr("x1", outerR - 2)
    .attr("y1", -labelH)
    .attr("y2", -labelH);
  activityG.append("text")
    .attr("class", "client-activity-label")
    .attr("x", labelX)
    .attr("y", -labelH);
  activityG.append("line")
    .attr("class", "network-activity")
    .attr("x1", outerR - 2)
    .attr("y1", 0)
    .attr("y2", 0);
  activityG.append("text")
    .attr("class", "network-activity-label")
    .attr("x", labelX)
    .attr("y", 0);

  // Locality label.
  var localityLabels = sel.append("g")
      .attr("transform", "translate(" + -outerR + ", " + outerR * 0.9 + ")");
  localityLabels.append("path")
    .attr("d", function(d) { return drawBox(outerR * 2, 20, 0.05); })
    .attr("class", "locality-label-background")
  localityLabels.append("svg")
    .attr("width", function(d) { return outerR * 2 })
    .attr("height", "20")
    .append("text")
    .attr("class", "locality-label")
    .attr("x", "50%")
    .attr("y", "55%")
    .attr("alignment-baseline", "middle")
    .attr("text-anchor", "middle")
    .text(function(d) { return d.name; });

  // Expand label.
  sel.append("text")
    .attr("class", "expand-label")
    .attr("transform", "translate(0, " + (-1.1 * outerR) + ")")
    .attr("opacity", 0)
    .text(function(d) { return d.nodes.length > 1 ? "Expand x" + d.nodes.length : ""; });

  // Circle for showing usage detail.
  sel.append("circle")
    .style("opacity", 0)
    .attr("r", outerR + arcWidth * 4)
    .on("mouseover", function(d) {
      d.showUsageDetailTimeout = setTimeout(function() {
        d.showUsageDetailTimeout = null;
        showUsageDetail(model, d, "*");
      }, 250);
    })
    .on("mouseout", function(d) {
      if (d.showUsageDetailTimeout != null) {
        clearTimeout(d.showUsageDetailTimeout);
        d.showUsageDetailTimeout = null;
      } else {
        hideUsageDetail(model, d);
      }
    });

  // Circle for showing inter-locality network links.
  sel.append("circle")
    .style("opacity", 0)
    .attr("r", innerR - arcWidth * 2)
    .style("cursor", "pointer")
    .on("mouseover", function(d) { showLocalityLinks(model, d); })
    .on("mouseout", function(d) { hideLocalityLinks(model, d); });
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

  sel.selectAll(".locality-link-group")
    .append("use")
    .attr("id", function(d) { return "incoming-" + d.id + "-path"; })
    .attr("xlink:href", function(d) { return "#incoming-" + d.id; });
  sel.selectAll(".locality-link-group")
    .append("use")
    .attr("id", function(d) { return "outgoing-" + d.id + "-path"; })
    .attr("xlink:href", function(d) { return "#outgoing-" + d.id; });
  sel.selectAll(".locality-link-group")
    .append("use")
    .attr("id", function(d) { return "rtt-" + d.id + "-path"; })
    .attr("xlink:href", function(d) { return "#rtt-" + d.id; });
}

Localities.prototype.update = function(model) {
  var innerR = model.nodeRadius,
      arcWidth = model.nodeRadius * 0.11111,
      outerR = innerR + arcWidth,
      locSel = model.localitySel,
      linkSel = model.localityLinkSel;

  locSel.selectAll(".capacity-label")
    .transition()
    .duration(250)
    .attr("opacity", function(d) { return (d.showDetail != null) ? 0 : 1; })
    .text(function(d) { return bytesToSize(d.capacity() * model.unitSize); });

  locSel.selectAll(".capacity-used")
    .transition()
    .duration(250)
    .attr("class", function(d) {
      if (d.locality.showDetail == null) {
        return "capacity-used";
      } else if (d.name in d.locality.showDetail) {
        return "capacity-used detail highlight";
      } else {
        return "capacity-used detail ";
      }
    })
    .attrTween("d", function(d) {
      var usage = d.locality.usageMap[d.name],
          startPct = (d.prev != null) ? d.prev.endPct : 0,
          endPct = 0,
          extraR = 0;
      if (d.locality.showDetail != null) {
        endPct = startPct + usage / d.locality.usageBytes;
        extraR = arcWidth * 1.5;
      } else {
        endPct = startPct + usage / d.locality.cachedCapacity;
      }
      var extraRI = d3.interpolate(d.extraR, extraR),
          startI = d3.interpolate(d.startPct, startPct),
          endI = d3.interpolate(d.endPct, endPct);
      d.extraR = extraR;
      d.startPct = startPct;
      d.endPct = endPct;
      if (d.last != null) {
        d.locality.angleInterp = endI;
      }
      return function(t) {
        d.extraR = extraRI(t);
        d.startPct = startI(t);
        d.endPct = endI(t);
        return createArcPath(innerR, outerR + d.extraR, arcAngleFromPct(d.startPct), arcAngleFromPct(d.endPct));
      }
    });
  locSel.selectAll(".capacity-used-label")
    .transition()
    .duration(250)
    .attrTween("x", function(d) {
      return function(t) {
        return (outerR + arcWidth * (d.showDetail != null ? 2.5 : 1)) * Math.cos(angleFromPct(d.angleInterp(t)));
      }
    })
    .attrTween("y", function(d) {
      return function(t) {
        return (outerR + arcWidth * (d.showDetail != null ? 2.5 : 1)) * Math.sin(angleFromPct(d.angleInterp(t)));
      }
    })
    .attrTween("text-anchor", function(d) {
      return function(t) {
        return (d.angleInterp(t) < 0.75) ? "end" : "start";
      }
    })
    .text(function(d) { return bytesToSize(d.usageBytes * model.unitSize); });
  locSel.selectAll(".capacity-used-pct-label")
    .text(function(d) { return Math.round(100 * d.usagePct) + "%"; });

  var barsX = innerR * Math.cos(angleFromPct(0)),
      barsWidth = outerR - barsX - 4;
  locSel.selectAll(".client-activity")
    .transition()
    .duration(250)
    .attr("x2", function(d) { return Math.round(outerR - barsWidth * (d.cachedClientActivity / model.maxClientActivity)); });
  locSel.selectAll(".client-activity-label")
    .text(function(d) { return bytesToActivity(d.cachedClientActivity); });
  locSel.selectAll(".network-activity")
    .transition()
    .duration(250)
    .attr("x2", function(d) { return Math.round(outerR - barsWidth * (d.cachedTotalNetworkActivity / model.maxNetworkActivity)); });
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
