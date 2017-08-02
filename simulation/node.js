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
  this.children = this.replicas;
  this.routes = {};
  this.busy = false;
  // Set the replicas as the "children" array of the node in order to set
  // them up to be a packed layout.
  this.model = model;

  this.model.addNode(this);
}

RoachNode.prototype.clicked = function() {
  if (this.state == "unreachable") {
    this.state = "healthy";
    this.model.setNodeHealthy(this);
  } else if (this.state == "healthy") {
    this.state = "unreachable";
    var that = this;
    this.model.setNodeUnreachable(this, function() {
      this.state = "dead";
      for (var i = 0; i < this.replicas.length; i++) {
        var r = this.replicas[i];
        r.stop();
        var index = r.range.replicas.indexOf(r);
        if (index != -1) {
          r.range.replicas.splice(index, 1);
          console.log("with " + this.id + " dead, removing " + r.id + " from " + r.range.id);
        }
      }
      this.replicas = [];
      this.model.removeNode(this);
    })
  }
  console.log(this.id + " moved to state " + this.state);
}

RoachNode.prototype.down = function() {
  return this.state != "healthy";
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
  return this.usage(countLog) + size <= this.capacity
}

RoachNode.prototype.setBusy = function(busy) {
  this.busy = busy
}
