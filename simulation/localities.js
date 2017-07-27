function Localities() {
}

Localities.prototype.init = function(model) {
}

function computeAngle(i, count) {
  return 2 * Math.PI * (i + 1) / count - Math.PI / 2;
}

Localities.prototype.locality = function(model, sel) {
  var g = sel.append("g"),
      bounds = model.bounds();

  if (bounds[0][0] == bounds[1][0] && bounds[0][1] == bounds[1][1]) {
    if (model.lastLocality != null) {
      var lx = model.lastLocality.tx,
          ly = model.lastLocality.ty;
      g.attr("transform", function(d) { return "translate(" + lx + "," + ly + ")"; })
        .transition()
        .duration(750)
        .attr("transform", function(d, i) {
          var angle = computeAngle(i, model.localities.length),
              radius = 0.2 * model.width;
          d.tx = radius * Math.cos(angle),
          d.ty = radius * Math.sin(angle);
          return "translate(" + d.tx + ", " + d.ty + ")";
        });
    } else {
      g.attr("transform", function(d, i) {
        var angle = computeAngle(i, model.localities.length),
            radius = 0.2 * model.width;
        d.tx = radius * Math.cos(angle),
        d.ty = radius * Math.sin(angle);
        return "translate(" + d.tx + ", " + d.ty + ")";
      });
    }
  }

  // Locality bounding box.
  g.append("path")
    .attr("d", function(d) { return drawBox(40, 40, 0.1); })
    .attr("vector-effect", "non-scaling-stroke")
    .attr("class", function(d) { return d.clazz; })
    .attr("transform", function(d, i) { return "translate(-20, -20)"; });
  // Locality label.
  g.append("text")
    .attr("class", "locality-label")
    .attr("dx", function(d) { return "22"; })
    .attr("dy", function(d) { return "0.5em"; })
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
