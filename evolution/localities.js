var gridLabelWidth = 65,
    gridHeight = 84;

function drawBox(w, h, cornerPct) {
  var c = w * cornerPct;
  return "M" + c + ",0 L" + (w-c) + ",0 A" + c + "," + c + " 0 0 1 " + w + "," + c +
    " L" + w + "," + (h-c) + " A" + c + "," + c + " 0 0 1 " + (w-c) + "," + h +
    " L" + c + "," + h + " A" + c + "," + c + " 0 0 1 0," + (h-c) +
    " L0," + c + " A" + c + "," + c + " 0 0 1 " + c + ",0 Z";
}

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

function qpsToActivity(qps) {
  return Math.round(qps * 1000) / 10 + ' Reqs/s';
}

function latencyMilliseconds(latency) {
  return Math.round(latency * 10) / 10 + ' ms';
}

function showUsageDetail(model, d, table) {
  var set = {};
  if (table == "*") {
    for (var i = 0; i < model.tables.length; i++) {
      set[model.tables[i].name] = true;
    }
  } else {
    set[table.name] = true;
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

function showLink(model, source, target, opacity) {
  if (!(target.id in source.links)) {
    return;
  }
  model.svg.selectAll("#" + source.links[target.id].id)
    .transition()
    .duration(250)
    .attr("opacity", function(d) { d.opacity += opacity; return d.opacity; });
}

function hideLink(model, source, target, opacity) {
  if (!(target.id in source.links)) {
    return;
  }
  model.svg.selectAll("#" + source.links[target.id].id)
    .transition()
    .duration(250)
    .attr("opacity", function(d) { d.opacity -= opacity; return d.opacity; });
}

function showLocalityLinks(model, locality) {
  model.svg.selectAll(".locality-link-group")
    .transition()
    .duration(250)
    .attr("opacity", function(d) {
      if (d.l1 == locality || d.l2 == locality) {
        d.opacity += 1;
      }
      return d.opacity;
    });
}

function hideLocalityLinks(model, locality) {
  model.svg.selectAll(".locality-link-group")
    .transition()
    .duration(250)
    .attr("opacity", function(d) {
      if (d.l1 == locality || d.l2 == locality) {
        d.opacity -= 1;
      }
      return d.opacity;
    });
}

function toggleStatusRing(model, locality) {
  var maxRadius = model.nodeRadius * 1.6,
      ring = model.svg.select("#status-" + locality.id);
  repeat();
  function repeat() {
    var state = locality.state();
    ring.attr("r", maxRadius * 1.4)
      .attr("class", "status-ring " + state)
      .attr("visibility", "visible")
      .transition()
      .duration(750)
      .ease("linear")
      .attr("r", maxRadius * 1.5)
      .transition()
      .duration(750)
      .ease("linear")
      .attr("r", maxRadius * 1.4)
      .each("end", function(d) {
        if (state == "available") {
          ring.attr("visibility", "hidden");
          return;
        }
        repeat();
      });
  }
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
      arcWidth = model.nodeRadius * 0.15111,
      outerR = innerR + arcWidth,
      maxRadius = this.maxRadius(model);

  sel.attr("transform", "translate(" + -100 + ", " + -100 + ")");

  // Locality status ring.
  var statusRings = sel.append("circle")
      .attr("id", function(d) { return "status-" + d.id; })
      .attr("class", "status-ring available");

  // The capacity-centric locality group.
  var capacityG = sel.append("g")
      .attr("class", "capacity-centric");

  // Capacity arc.
  capacityG.append("path")
    .attr("d", function(d) { return createArcPath(innerR, outerR, arcAngleFromPct(0), arcAngleFromPct(1)); })
    .attr("class", "capacity-background");
  capacityG.append("text")
    .attr("class", "capacity-label");

  // Used capacity arc segments (one per table).
  var usedG = capacityG.append("g");
  usedG.append("text")
    .attr("class", "capacity-used-label");
  var arcSel = usedG.selectAll("path")
      .data(function(d) { return d.getTablesByUsage(); });
  arcSel.enter().append("g")
  arcSel.append("path")
    .attr("class", function(d) { return "capacity-used"; });
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
    .attr("y", "65%")
    .text("CAPACITY USED");

  // Client / network activity.
  var activityG = capacityG.append("g")
      .attr("transform", "translate(" + 0 + ", " + (innerR * Math.sin(angleFromPct(0))) + ")");
  activityG.append("line")
    .style("stroke", "url(#" + model.id + "-gradient)")
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
    .on("click", function(d) {
      d3.event.stopPropagation();
      d.toggleState();
      refreshModel(d.model);
    });
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

  // Range grid.
  var gridG = capacityG.append("g")
      .attr("class", "grid");
  gridG.append("rect")
    .attr("class", "grid-outline")
    .attr("height", gridHeight);
  var gridTableSel = gridG.selectAll(".grid-table")
      .data(function(d) { return d.getTables(); });
  var gridTableG = gridTableSel.enter().append("g")
      .attr("class", "grid-table")
      .attr("transform", function(d) { return "translate(0," + (20 * d.index) + ")"; });
  gridTableSel.exit().remove();
  gridTableG.append("text")
    .attr("class", "grid-label")
    .attr("x", 5)
    .attr("y", 18)
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
      arcWidth = model.nodeRadius * 0.15111,
      outerR = innerR + arcWidth,
      locSel = model.localitySel,
      linkSel = model.localityLinkSel;

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
        if (d.locality.usageSize > 0) {
          endPct = startPct + usage / d.locality.usageSize;
        } else {
          endPct = startPct;
        }
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
        return [start, mult(norm, outerR + arcWidth * 4.0)];
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
      labelH = 10;
  locSel.selectAll(".client-activity")
    .transition()
    .duration(250)
    .attr("x1", outerR - 2)
    .attr("y1", -labelH+0.001)
    .attr("x2", outerR - barsWidth)
    .attr("y2", -labelH)
    .style("clip-path", function(d) {
      return "inset(-2.5px -2.5px -2.5px " +
        Math.round(100 * (model.maxClientActivity - d.cachedClientActivity) / model.maxClientActivity) + "%)";
    })
  locSel.selectAll(".client-activity-label")
    .style("fill", function(d) { return model.activityScale(d.cachedClientActivity); })
    .attr("x", labelX)
    .attr("y", -labelH)
    .text(function(d) { return qpsToActivity(d.cachedClientActivity); });
  locSel.selectAll(".network-activity")
    .transition()
    .duration(250)
    .attr("x1", outerR - 2)
    .attr("y1", 0)
    .attr("x2", function(d) {
      if (model.maxNetworkActivity == 0) {
        return outerR;
      }
      return Math.round(outerR - barsWidth * (d.cachedTotalNetworkActivity / model.maxNetworkActivity));
    })
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

  var gridDim = 5;
  var grids = locSel.selectAll(".grid");
  grids.selectAll(".grid-outline")
    .attr("width", function(d) {
      var max = 0;
      for (name in d.usageMap) {
        if (name == "__total") continue;
        var table = model.tablesByName[name];
        if (table.ranges.length > max) { max = table.ranges.length; }
      }
      d.gridWidth = gridLabelWidth + (max + 1) * gridDim;
      return d.gridWidth;
    });
  grids.attr("transform", function(d) {
    var x = Math.cos(d.gridOrientation),
        y = Math.sin(d.gridOrientation),
        r = Math.abs(x) / 1.25 > Math.abs(y) ? (d.gridWidth/2 + outerR * 2) : outerR * 2.25;
    return "translate(" + (r*x - d.gridWidth/2) + "," + (r*y - gridHeight/2) + ")";
  });
  var replicaGroupSel = locSel.selectAll(".grid-table").selectAll(".replica-group")
      .data(function(d) {
        var table = model.tablesByName[d.name];
        table.maybeOrderByRegion(); // keep it sorted.
        return table.ranges.map(function(x, i) {
          return {range: x, locality: d.locality};
        });
      }, function(d) { return d.range.id; });
  var newReplicaGroups = replicaGroupSel.enter().append("g")
      .attr("class", "replica-group");
  replicaGroupSel.exit().remove();
  replicaGroupSel
    .attr("transform", function(d) { return "translate(" + (d.range.index * gridDim + gridLabelWidth) + ",4)"; });
  newReplicaGroups.append("rect")
    .attr("class", "grid-range replica1")
    .attr("y", 0)
    .attr("width", gridDim)
    .attr("height", gridDim);
  newReplicaGroups.append("rect")
    .attr("class", "grid-range replica2")
    .attr("y", gridDim)
    .attr("width", gridDim)
    .attr("height", gridDim);
  newReplicaGroups.append("rect")
    .attr("class", "grid-range replica3")
    .attr("y", 10)
    .attr("width", gridDim)
    .attr("height", gridDim);
  replicaGroupSel.selectAll(".replica1")
    .style("fill", function(d) { return (d.locality.replicasByRangeID[d.range.id] & 0x1) ? d.range.color() : "none"; });
  replicaGroupSel.selectAll(".replica2")
    .style("fill", function(d) { return (d.locality.replicasByRangeID[d.range.id] & 0x2) ? d.range.color() : "none"; });
  replicaGroupSel.selectAll(".replica3")
    .style("fill", function(d) { return (d.locality.replicasByRangeID[d.range.id] & 0x4) ? d.range.color() : "none"; });
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
  animateRequest(model, payload, link, reverse, endFn);
  //setTimeout(function() { endFn(); }, Math.max(250, link.latency * timeScale));
}
