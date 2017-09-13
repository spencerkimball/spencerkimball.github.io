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
  if (bytes < 1) return '0 B/s';
  var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes * 10 / Math.pow(1024, i), 2) / 10 + ' ' + sizes[i];
}

function latencyMilliseconds(latency) {
  return Math.round(latency * 10) / 10 + ' ms';
}

function showUsageDetail(model, d, database) {
  if (model.showLatencies) {
    return;
  }
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
  if (model.showLatencies) {
    return;
  }
  model.svg.selectAll(".locality-link-group")
    .transition()
    .duration(250)
    .attr("visibility", function(d) { return (d.l1 == locality || d.l2 == locality) ? "visible" : "hidden"; })
    .attr("opacity", function(d) { return (d.l1 == locality || d.l2 == locality) ? 1 : 0; });
}

function hideLocalityLinks(model, locality) {
  model.svg.selectAll(".locality-link-group")
    .transition()
    .duration(250)
    .attr("visibility", "hidden")
    .attr("opacity", 0);
}

function setLocalitiesVisibility(model) {
  var capacityVisibility = model.showLatencies ? "hidden" : "visible";
  var latencyVisibility = model.showLatencies ? "visible" : "hidden";
  model.svgParent.selectAll(".capacity-centric")
    .attr("visibility", capacityVisibility);
  model.svgParent.selectAll(".latency-centric")
    .attr("visibility", latencyVisibility);
  model.svgParent.selectAll(".latency-legend")
    .attr("visibility", latencyVisibility);
  model.projectionG.selectAll(".city")
    .attr("opacity", function(d) {
      if (model.showCityDetail != null) {
        return (model.showCityDetail == d.name) ? 1.0 : 0.15;
      }
      return 1.0;
    })
    .attr("visibility", latencyVisibility);
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
      outerR = innerR + arcWidth,
      maxRadius = this.maxRadius(model);

  sel.attr("transform", "translate(" + -100 + ", " + -100 + ")");

  // Locality status ring.
  var statusRings = sel.append("circle")
      .attr("class", "status-ring available");
  repeat();
  function repeat() {
    statusRings.attr("r", maxRadius * 1.4)
      .transition()
      .duration(750)
      .ease("linear")
      .attr("r", maxRadius * 1.5)
      .transition()
      .duration(750)
      .ease("linear")
      .attr("r", maxRadius * 1.4)
      .each("end", repeat);
  }

  // The capacity-centric locality group.
  var capacityG = sel.append("g")
      .attr("class", "capacity-centric");

  // Capacity arc.
  capacityG.append("path")
    .attr("d", function(d) { return createArcPath(innerR, outerR, arcAngleFromPct(0), arcAngleFromPct(1)); })
    .attr("class", "capacity-background");
  capacityG.append("text")
    .attr("class", "capacity-label");

  // Used capacity arc segments (one per database).
  var usedG = capacityG.append("g");
  usedG.append("text")
    .attr("class", "capacity-used-label");
  var arcSel = usedG.selectAll("path")
      .data(function(d) { return d.getDatabasesByUsage(); });
  arcSel.enter().append("g")
  arcSel.append("path")
    .attr("class", "capacity-used");
  arcSel.exit().remove();
  var labelG = arcSel.append("g")
      .attr("class", "arc-label")
  labelG.append("polyline")
    .attr("class", "guide");
  labelG.append("text")
    .attr("class", "name");
  labelG.append("text")
    .attr("class", "size");

  // Capacity labels.
  var capacityLabels = capacityG.append("g")
      .attr("transform", "translate(" + -outerR + ", " + -outerR + ")");
  var capacityLabelsSVG = capacityLabels.append("svg")
      .attr("width", outerR * 2)
      .attr("height", outerR * 2);
  capacityLabelsSVG.append("text")
    .attr("class", "capacity-used-pct-label")
    .attr("x", "50%")
    .attr("y", "40%");
  capacityLabelsSVG.append("text")
    .attr("class", "capacity-used-text")
    .attr("x", "50%")
    .attr("y", "60%")
    .text("CAPACITY USED");

  // Client / network activity.
  var activityG = capacityG.append("g")
      .attr("transform", "translate(" + 0 + ", " + (innerR * Math.sin(angleFromPct(0))) + ")");
  activityG.append("line")
    .attr("class", "client-activity");
  activityG.append("text")
    .attr("class", "client-activity-label");
  activityG.append("line")
    .attr("class", "network-activity");
  activityG.append("text")
    .attr("class", "network-activity-label");

  // Locality label.
  var localityLabels = capacityG.append("g")
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
    .text(function(d) { return d.name; });

  // Circle for showing usage detail.
  capacityG.append("circle")
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
  capacityG.append("circle")
    .style("opacity", 0)
    .attr("r", innerR - arcWidth * 2)
    .style("cursor", "pointer")
    .on("mouseover", function(d) { showLocalityLinks(model, d); })
    .on("mouseout", function(d) { hideLocalityLinks(model, d); });

  // The latency-centric, simplified locality group.
  var latencyR = innerR / 2,
      latencyG = sel.append("g")
      .attr("class", "latency-centric")
      .attr("visibility", "hidden");
  latencyG.append("circle")
    .attr("class", "capacity-background")
    .attr("r", latencyR)
  latencyG.append("text")
    .attr("class", "capacity-used-pct-label");
  latencyG.append("path")
    .attr("transform", "translate(-" + latencyR * 2 + "," + (latencyR + 2) + ")")
    .attr("d", function(d) { return drawBox(latencyR * 4, 18, 0.05); })
    .attr("class", "locality-label-background")
  latencyG.append("text")
    .attr("class", "locality-label")
    .attr("y", latencyR + 12)
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

  locSel.selectAll(".status-ring")
    .attr("class", function(d) { return "status-ring " + d.state(); });

  locSel.selectAll(".capacity-label")
    .attr("x", (outerR + arcWidth) * Math.cos(0))
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
      var usage = (d.name in d.locality.usageMap) ? d.locality.usageMap[d.name] : 0,
          startPct = (d.prev != null) ? d.prev.endPct : 0,
          endPct = 0,
          extraR = 0;
      if (d.locality.showDetail != null) {
        endPct = startPct + usage / d.locality.usageSize;
        extraR = arcWidth * 1.5;
      } else {
        endPct = startPct + usage / d.locality.cachedCapacity;
      }
      var midAngle = angleFromPct((startPct + endPct) / 2),
          extraRI = d3.interpolate(d.extraR, extraR);
      d.startI = d3.interpolate(d.startPct, startPct),
      d.endI = d3.interpolate(d.endPct, endPct);
      d.extraR = extraR;
      d.startPct = startPct;
      d.endPct = endPct;
      if (midAngle < -Math.PI) {
        d.textOff = [-16, 8];
      } else if (midAngle < -0.75 * Math.PI) {
        d.textOff = [0, -8];
      } else if (midAngle > -0.25 * Math.PI) {
        d.textOff = [8, -8];
      } else {
        d.textOff = [0, -8];
      }
      if (d.last != null) {
        d.locality.angleInterp = d.endI;
      }
      return function(t) {
        d.extraR = extraRI(t);
        d.startPct = d.startI(t);
        d.endPct = d.endI(t);
        return createArcPath(innerR, outerR + d.extraR, arcAngleFromPct(d.startPct), arcAngleFromPct(d.endPct));
      }
    });

  locSel.selectAll(".arc-label")
    .attr("opacity", function(d) {
      return (d.locality.showDetail != null && d.name in d.locality.showDetail) ? 1.0 : 0.0;
    })
    .attr("visibility", function(d) {
      return (d.locality.showDetail != null && d.name in d.locality.showDetail) ? "visible" : "hidden";
    });
  locSel.selectAll(".arc-label .guide")
    .transition()
    .duration(250)
    .attrTween("points", function(d) {
      return function(t) {
        var midPct = (d.startI(t) + d.endI(t)) / 2,
            angle = angleFromPct(midPct),
            norm = [Math.cos(angle), Math.sin(angle)],
            start = mult(norm, outerR + arcWidth * 1.5),
            end = mult(norm, outerR + arcWidth * 5.5);
        d.textPos = end;
        return [start, end];
      }
    });
  locSel.selectAll(".arc-label text")
    .transition()
    .duration(250)
    .attrTween("transform", function(d) {
      return function(t) {
        return "translate(" + (d.textPos[0] + d.textOff[0]) + ", " + (d.textPos[1] + d.textOff[1]) + ")";
      }
    });
  locSel.selectAll(".arc-label .name")
    .text(function(d) { return d.name; })
  locSel.selectAll(".arc-label .size")
    .attr("y", "1em")
    .text(function(d) { return bytesToSize(d.locality.usageMap[d.name] * model.unitSize); })
  locSel.selectAll(".capacity-used-label")
    .transition()
    .duration(250)
    .attrTween("transform", function(d) {
      return function(t) {
        var x = Math.cos(angleFromPct(d.angleInterp(t))),
            y = Math.sin(angleFromPct(d.angleInterp(t))),
            radius = (outerR + arcWidth * (d.showDetail != null ? 2.5 : 1));
        return "translate(" + (x * radius) + "," + (y * radius) + ")";
      }
    })
    .attrTween("text-anchor", function(d) {
      return function(t) {
        return (d.angleInterp(t) < 0.75) ? "end" : "start";
      }
    })
    .text(function(d) { return bytesToSize(d.usageSize * model.unitSize); });
  locSel.selectAll(".capacity-used-pct-label")
    .text(function(d) { return Math.round(100 * d.usagePct) + "%"; });

  var barsX = innerR * Math.cos(angleFromPct(0)),
      barsWidth = outerR - barsX - 4,
      labelX = outerR + arcWidth,
      labelH = 8;
  locSel.selectAll(".client-activity")
    .transition()
    .duration(250)
    .attr("x1", outerR - 2)
    .attr("y1", -labelH)
    .attr("x2", function(d) { return Math.round(outerR - barsWidth * (d.cachedClientActivity / model.maxClientActivity)); })
    .attr("y2", -labelH);
  locSel.selectAll(".client-activity-label")
    .attr("x", labelX)
    .attr("y", -labelH)
    .text(function(d) { return bytesToActivity(d.cachedClientActivity * model.unitSize); });
  locSel.selectAll(".network-activity")
    .transition()
    .duration(250)
    .attr("x1", outerR - 2)
    .attr("y1", 0)
    .attr("x2", function(d) { return Math.round(outerR - barsWidth * (d.cachedTotalNetworkActivity / model.maxNetworkActivity)); })
    .attr("y2", 0);
  locSel.selectAll(".network-activity-label")
    .attr("x", labelX)
    .attr("y", 0)
    .text(function(d) { return bytesToActivity(d.cachedTotalNetworkActivity * model.unitSize); });

  linkSel.selectAll(".incoming-throughput-label")
    .text(function(d) { return "←" + bytesToActivity(d.cachedNetworkActivity[1] * model.unitSize); });
  linkSel.selectAll(".outgoing-throughput-label")
    .text(function(d) { return bytesToActivity(d.cachedNetworkActivity[0] * model.unitSize) + "→"; });
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
