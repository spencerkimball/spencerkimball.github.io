function RoachNode(name, location, locality, model) {
  this.name = name;
  // Add node name as last, most-specific locality entry.
  locality.push("node=" + name);
  this.location = location;
  this.locality = locality;
  this.capacity = model.nodeCapacity;
  this.index = model.roachNodes.length;
  this.id = "node" + this.index;
  this.x = 0;
  this.y = 0;
  this.radius = model.nodeRadius;
  this.clazz = "roachnode";
  this.state = "healthy";
  this.replicas = [];
  this.apps = [];
  this.children = this.replicas;
  this.routes = {};
  this.busy = false;
  // Set the replicas as the "children" array of the node in order to set
  // them up to be a packed layout.
  this.model = model;

  this.model.addNode(this);
}

RoachNode.prototype.down = function() {
  return this.state != "healthy";
}

RoachNode.prototype.addApp = function(app) {
  this.apps.push(app);
}

RoachNode.prototype.pctUsage = function(countLog) {
  var pctUsage = (this.usage(countLog) * 100.0) / this.capacity;
  if (pctUsage > 100) {
    pctUsage = 100;
  }
  return pctUsage;
}

RoachNode.prototype.usage = function(countLog) {
  var usage = 0;
  for (var i = 0; i < this.replicas.length; i++) {
    if (this.replicas[i].range != null) {
      usage += this.replicas[i].getSize(countLog);
    }
  }
  return usage;
}

// leaderCount returns the number of replicas this node contains which
// are leaders of their respective ranges.
RoachNode.prototype.leaderCount = function() {
  var count = 0
  for (var i = 0; i < this.replicas.length; i++) {
    if (this.replicas[i].isLeader()) count++
  }
  return count
}

RoachNode.prototype.nonSplitting = function() {
  var count = 0
  for (var i = 0; i < this.replicas.length; i++) {
    if (this.replicas[i].splitting) continue
    count++
  }
  return count
}

// Returns whether the node has space.
RoachNode.prototype.hasSpace = function(size, countLog) {
  return this.usage(countLog) + size <= this.capacity;
}

RoachNode.prototype.setBusy = function(busy) {
  this.busy = busy
}

// usageByTable adds the replica size counts (including Raft log) to
// the supplied usageMap, with an additional entry for total.
RoachNode.prototype.usageByTable = function(usageMap) {
  for (var i = 0; i < this.replicas.length; i++) {
    if (this.replicas[i].range != null) {
      var size = this.replicas[i].getSize(false),
          table = this.replicas[i].range.table.name;
      if (table in usageMap) {
        usageMap[table] += size;
      } else {
        usageMap[table] = size;
      }
      usageMap["__total"] += size;
    }
  }
}

RoachNode.prototype.usageByDB = function(usageMap) {
  for (var i = 0; i < this.replicas.length; i++) {
    if (this.replicas[i].range != null) {
      var size = this.replicas[i].getSize(false),
          db = this.replicas[i].range.table.db.name;
      if (db in usageMap) {
        usageMap[db] += size;
      } else {
        usageMap[db] = size;
      }
      usageMap["__total"] += size;
    }
  }
}

RoachNode.prototype.throughputByDB = function(throughputMap) {
  for (var i = 0; i < this.replicas.length; i++) {
    if (this.replicas[i].range != null) {
      var throughput = this.replicas[i].throughput.getValue(),
          db = this.replicas[i].range.table.db.name;
      if (db in throughputMap) {
        throughputMap[db] += throughput;
      } else {
        throughputMap[db] = throughput;
      }
      throughputMap["__total"] += throughput;
    }
  }
}

RoachNode.prototype.clientActivity = function() {
  var activity = 0;
  for (var i = 0; i < this.apps.length; i++) {
    var app = this.apps[i];
    activity += app.routes[app.roachNode.id].getThroughput();
  }
  return activity;
}

// networkActivity returns a tuple of values: [outgoing throughput,
// incoming throughput, average latency]. Throughput values are in
// bytes / s; latency is in milliseconds. If filter is null, all
// connected nodes are measured; otherwise, only nodes with IDs in
// filter are measured.
RoachNode.prototype.networkActivity = function(filter) {
  var activity = [0, 0, 0],
      count = 0;
  for (key in this.routes) {
    var route = this.routes[key];
    if (filter == null || (route.target.id in filter)) {
      activity[0] += route.getThroughput()
      activity[1] += route.target.routes[this.id].getThroughput();
      activity[2] += route.latency;
      count++;
    }
  }
  activity[2] /= count;
  return activity;
}
