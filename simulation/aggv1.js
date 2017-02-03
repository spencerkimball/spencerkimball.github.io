function AggV1() {
}

AggV1.prototype.init = function(model) {
  // Create 101 linear gradients to represent 0-100% fullness,
  // inclusive.
  for (var pctUsage = 0; pctUsage <= 100; pctUsage++) {
    var color = "008000"
    if (pctUsage > 95) {
      color = "ff4500"
    } else if (pctUsage > 90) {
      color = "ff8c00"
    } else if (pctUsage > 85) {
      color = "#ffd700"
    }
    var grad = model.defs
        .append("linearGradient")
        .attr("id", "fullnessGradient-" + pctUsage)
        .attr("x1", "0%").attr("x2", "0%")
        .attr("y1", "100%").attr("y2", "0%")
    grad.append("stop").attr("offset", (pctUsage + "%")).style("stop-color", color)
    grad.append("stop").attr("offset", (pctUsage + "%")).style("stop-color", "white")
  }
}

AggV1.prototype.node = function(model, sel) {
  return sel.append("circle")
    .attr("r", function(d) { return d.radius })
    .attr("class", function(d) { return d.clazz })
    .call(model.force.drag)
}

AggV1.prototype.packRanges = function(model, n, sel) {
  var pctUsage = Math.floor(n.pctUsage(true))
  model.svg.select("#" + n.id).selectAll(".roachnode")
    .style("fill", "url(#fullnessGradient-" + pctUsage + ")")
}

AggV1.prototype.sendRequest = function(model, payload, link, reverse, endFn) {
  setTimeout(function() { endFn() }, link.latency * timeScale)
}
