function Link(source, target, clazz, latency, model) {
  this.id = "route" + model.routeCount++;
  this.source = source;
  this.target = target;
  this.clazz = clazz;
  this.latency = latency;
  this.model = model;
  this.errors = 0;
  this.totalBytes = 0;
  this.throughput = 0;
  this.lastTime = 0;
}

Link.prototype.record = function(req) {
  if (("success" in req) && !req.success) {
    this.errors++;
    return;
  }
  var time = Date.now(),
      deltaTime = (time - this.lastTime) / 1000.0,
      bytes = req.size() * this.model.unitSize;
  this.totalBytes += bytes;
  this.throughput = this.throughput * Math.exp(-deltaTime / 10) + bytes;
  this.lastTime = time;
}

// Throughput is calculated as an exponential window function, with
// half life set to 10s. The value returned here is in bytes / s.
Link.prototype.getThroughput = function() {
  var time = Date.now(),
      deltaTime = (time - this.lastTime) / 1000.0;
  return (this.throughput * Math.exp(-deltaTime / 10)) / 10;
}
