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
  this.zoneConfig = zoneConfig;
  this.color = color(model.tables.length);
  this.ranges = [];
  this.throughput = 0;
  this.lastTime = 0;
  this.totalBytes = 0;
  this.db = db;
  this.model = model;

  var rangeSize = model.splitSize / 2;
  for (; size >= 0; size -= rangeSize) {
    var range = new Range(this, model);
    this.ranges.push(range);
    for (var i = 0; i < zoneConfig.length; i++) {
      var nodes = model.findMatchingNodes(zoneConfig[i]);
      if (nodes.length == 0) {
        console.log("ERROR: there are no nodes available that match constraints for zoneConfig[" + i + "]=" + zoneConfig[i]);
        return null;
      }
      var nodeIdx = Math.floor(Math.random() * nodes.length);
      var replica = new Replica(Math.min(size, rangeSize), range, nodes[nodeIdx], true, model);
      if (i == 0) {
        range.leader = replica;
      }
    }
  }

  this.db.addTable(this);
  this.model.addTable(this);
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
  return this.totalBytes;
}

Table.prototype.record = function(req) {
  var time = Date.now(),
      deltaTime = (time - this.lastTime) / 1000.0,
      bytes = req.size() * this.model.unitSize;
  this.totalBytes += bytes;
  this.throughput = this.throughput * Math.exp(-deltaTime / 10) + bytes;
  this.lastTime = time;
}

// getThroughput calculates an exponential window function, with half
// life set to 10s. The value returned here is in bytes / s.
Table.prototype.getThroughput = function() {
  var time = Date.now(),
      deltaTime = (time - this.lastTime) / 1000.0;
  return (this.throughput * Math.exp(-deltaTime / 10)) / 10;
}
