// Table creates a table with the specified name and zoneConfig and
// adds ranges according to the constraints in the zoneConfig, so there
// are enough ranges to cover the specified size.
//
// The zoneConfig parameter is an array of zones, where zones specify
// constraints for each desired replica, expressed as localities. For
// example:
// ["region=us", "city=San Francisco", "rack=1a"]
function Table(name, zoneConfig, size, db, model) {
  this.name = name;
  this.ranges = [];
  this.throughput = new ExpVar();
  this.totalSize = 0;
  this.idx = model.tableCount++;
  this.db = db;
  this.model = model;
  this.setZoneConfig(zoneConfig);

  var rangeSize = model.splitSize / 2,
      sizeLeft = size;
  for (; sizeLeft >= 0; sizeLeft -= rangeSize) {
    var range = new Range(this, model);
    for (var i = 0; i < zoneConfig.length; i++) {
      var nodes = model.findMatchingNodes(zoneConfig[i], range.replicas);
      if (nodes.length == 0) {
        break;
      }
      var nodeIdx = 0;
      if (nodes.length > (zoneConfig.length - range.replicas.length)) {
        nodeIdx = Math.floor(Math.random() * nodes.length);
      }
      var replica = new Replica(Math.min(sizeLeft, rangeSize), i, range, nodes[nodeIdx], true, model);
      if (i == 0) {
        range.leader = replica;
      }
    }
  }

  this.db.addTable(this);
  this.model.addTable(this);
}

Table.prototype.setZoneConfig = function(zoneConfig) {
  this.zoneConfig = zoneConfig;
}

Table.prototype.maybeOrderByRegion = function() {
  // Keep the ranges sorted by region if necessary.
  this.ranges.sort(function(a, b) {
    if (a.region != null && b.region != null) {
      if (a.region != b.region) {
        return a.region > b.region ? -1 : 1;
      }
    }
    return a.id < b.id ? -1 : 1;
  });
  // Set index so we can keep the ranges visually sorted.
  for (var i = 0; i < this.ranges.length; i++) {
    this.ranges[i].index = i;
  }
}

Table.prototype.color = function(region) {
  return this.model.color(region, this.name);
}

Table.prototype.start = function() {
  for (var i = 0; i < this.ranges.length; i++) {
    this.ranges[i].start();
  }
}

Table.prototype.stop = function() {
  for (var i = 0; i < this.ranges.length; i++) {
    this.ranges[i].stop();
  }
}

Table.prototype.flush = function() {
  for (var i = 0; i < this.ranges.length; i++) {
    this.ranges[i].flushLog();
  }
}

Table.prototype.usage = function() {
  return this.totalSize;
}

Table.prototype.record = function(req) {
  this.throughput.record(req.size());
  this.totalSize += req.size();
}

// getThroughput calculates an exponential window function, with half
// life set to 10s. The value returned here is in bytes / s.
Table.prototype.getThroughput = function() {
  return this.throughput.getValue();
}
