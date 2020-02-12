function Link(source, target, clazz, latency, model) {
  this.id = "route" + model.routeCount++;
  this.source = source;
  this.target = target;
  this.clazz = clazz;
  this.latency = latency;
  this.model = model;
  this.errors = 0;
  this.totalSize = 0;
  this.throughput = new ExpVar();
  this.qps = new ExpVar();
}

Link.prototype.record = function(req) {
  if (!req.success) {
    this.errors++;
    return;
  }
  this.totalSize += req.size();
  this.throughput.record(req.size());
}

// Throughput is calculated as an exponential window function, with
// half life set to 10s. The value returned here is in bytes / s.
Link.prototype.getThroughput = function() {
  return this.throughput.getValue();
}

Link.prototype.getQPS = function() {
  return this.throughput.getCount();
}
