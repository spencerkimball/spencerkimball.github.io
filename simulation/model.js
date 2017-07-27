// This file defines a simple model for describing a CockroachDB cluster.

var modelCount = 0;
var models = [];

function Model(id, width, height, initFn) {
  this.index = modelCount++;
  this.id = id;
  this.width = width;
  this.height = height;
  this.initFn = initFn;
  this.nodeRadius = 35;
  this.appRadius = 0;
  this.nodeDistance = 150;
  this.interNodeDistance = 25;
  this.nodeCapacity = 5000.0;
  this.reqSize = 0.1;
  this.splitSize = 1.0;
  this.unitSize = 64<<20;
  this.appXfer = 3000;           // in ms
  this.minAppXfer = 1000;        // in ms
  this.maxAppXfer = 10000;       // in ms
  this.heartbeatInterval = 1500; // in ms
  this.periodicInterval = 1000;  // in ms
  this.roachNodes = [];
  this.tables = [];
  this.apps = [];
  this.reqCount = 0;
  this.rangeCount = 0;
  this.links = [];
  this.linkCount = 0;
  this.routeCount = 0;
  this.replicaCount = 0;
  this.exactRebalancing = false;
  this.currentLocality = [];
  this.lastLocality = null;
  this.localities = [];
  this.localityCount = 0;
  this.defaultZoneConfig = [[], [], []]; // three replicas
  this.showHeartbeats = false;
  this.quiesceRaft = true;
  this.stopped = true;
  this.played = false;

  this.projectionName = "none";
  this.projection = function(p) { return p };
  this.skin = new Circles();
  this.enablePlayAndReload = true;
  this.enableAddNodeAndApp = false;
  models.push(this);

  if (initFn != null) {
    initFn(this);
  }
}

// bounds returns longitude / latitude pairs representing the minimum
// and maximum bounds.
Model.prototype.bounds = function() {
  var locXYMin = [180, -90],
      locXYMax = [-180, 90];

  for (var i = 0; i < this.localities.length; i++) {
    var loc = this.localities[i];
    if (loc.location[0] < locXYMin[0]) {
      locXYMin[0] = loc.location[0];
    }
    if (loc.location[0] > locXYMax[0]) {
      locXYMax[0] = loc.location[0];
    }
    if (loc.location[1] > locXYMin[1]) {
      locXYMin[1] = loc.location[1];
    }
    if (loc.location[1] < locXYMax[1]) {
      locXYMax[1] = loc.location[1];
    }
  }

  return [locXYMin, locXYMax];
}

Model.prototype.setLocality = function(locality) {
  this.currentLocality = locality;
  this.resetLocalities();
}

Model.prototype.addLocality = function(locality) {
  // Link this locality to all others.
  var coords = this.projection(locality.location);
  for (var i = 0; i < this.localities.length; i++) {
    var oLocality = this.localities[i];
    var oCoords = this.projection(oLocality.location);
    latency = 4000 * Math.sqrt((coords[0] - oCoords[0]) * (coords[0] - oCoords[0]) + (coords[1] - oCoords[1]) * (coords[1] - oCoords[1])) / viewWidth;
    var l = {id: "link" + this.linkCount++, source: locality, target: oLocality, clazz: "link", latency: latency};
    locality.links[oLocality.id] = l;
    this.links.push(l);
    var rl = {id: "link" + this.linkCount++, source: oLocality, target: locality, clazz: "link", latency: latency};
    oLocality.links[locality.id] = rl;
    this.links.push(rl);
  }

  // Add to array of datacenters.
  this.localities.push(locality);
}

// findMatchingNodes finds and returns a list of nodes which match the
// constraints specified in the supplied zone constraints array.
Model.prototype.findMatchingNodes = function(zone) {
  var nodes = [];
  for (var i = 0; i < this.roachNodes.length; i++) {
    var node = this.roachNodes[i];
    var matches = true; // does this replica match all constraints on the zone config?
    for (var j = 0; j < zone.length && matches; j++) {
      if (zone[j] != "*") {
        matches = false;
        for (var k = 0; k < node.locality.length && !matches; k++) {
          if (zone[j] == node.locality[k]) {
            matches = true;
          }
        }
      }
    }
    if (matches) {
      nodes.push(node);
    }
  }
  return nodes;
}

// selectNodes returns all nodes with localities that have
// prefixes matching the specified locality.
Model.prototype.selectNodes = function(locality) {
  var nodes = [];
  for (var i = 0; i < this.roachNodes.length; i++) {
    if (localityHasPrefix(this.roachNodes[i].locality, locality)) {
      nodes.push(this.roachNodes[i]);
    }
  }
  return nodes;
}

Model.prototype.addNode = function(node) {
  // Link this node to all others.
  var coords = this.projection(node.location);
  for (var i = 0; i < this.roachNodes.length; i++) {
    var oNode = this.roachNodes[i];
    var oCoords = this.projection(oNode.location);
    var latency = 4000 * Math.sqrt((coords[0] - oCoords[0]) * (coords[0] - oCoords[0]) + (coords[1] - oCoords[1]) * (coords[1] - oCoords[1])) / viewWidth;
    var l = {id: "route" + this.routeCount++, source: node, target: oNode, clazz: "route", latency: latency};
    node.routes[oNode.id] = l;
    var rl = {id: "route" + this.routeCount++, source: oNode, target: node, clazz: "route", latency: latency};
    oNode.routes[node.id] = rl;
  }

  // Add new node & update visualization.
  this.roachNodes.push(node);
  this.layout();
}

Model.prototype.removeNode = function(node) {
  var index = this.roachNodes.indexOf(node);
  if (index != -1) {
    this.roachNodes.splice(index, 1);
  }
  for (var i = 0, keys = Object.keys(node.routes); i < keys.length; i++) {
    var l = node.routes[keys[i]];
    var rl = l.target.routes[node.id];
    delete l.target.routes[node.id];
  }
  for (var i = 0; i < this.apps.length; i++) {
    if (this.apps[i].roachNode == node) {
      this.removeApp(this.apps[i]);
    }
  }
  this.layout();
}

Model.prototype.addTable = function(table) {
  this.tables.push(table);
}

// Note that we've disabled visualization of apps. They now send
// requests directly from the gateway node they're connected to.
Model.prototype.addApp = function(app) {
  this.apps.push(app);
}

Model.prototype.removeApp = function(app) {
  app.stop();
  var index = this.apps.indexOf(app);
  if (index != -1) {
    this.apps.splice(index, 1);
  }
}

Model.prototype.start = function() {
  this.startTime = Date.now();
  if (this.played) {
    this.restart();
  }
  this.stopped = false;
  // If there are no tables, create the first table, using the default zone config.
  if (this.tables.length == 0) {
    new Table("default", this.defaultZoneConfig, 0, this);
  }

  for (var i = 0; i < this.apps.length; i++) {
    this.apps[i].start();
  }
  for (var i = 0; i < this.tables.length; i++) {
    this.tables[i].start();
  }
  if (this.simTime > 0) {
    var that = this;
    setTimeout(function() { that.stop(); }, this.simTime);
  }
}

Model.prototype.stop = function() {
  for (var i = 0; i < this.apps.length; i++) {
    this.apps[i].stop();
  }
  for (var i = 0; i < this.tables.length; i++) {
    this.tables[i].stop();
  }
  this.stopped = true;
  this.played = true;
  this.layout();
}

Model.prototype.restart = function() {
  // Remove model.
  removeModel(this);

  this.apps = [];
  this.roachNodes = [];
  this.tables = [];
  this.clearRequests();

  // Re-initialize from scratch.
  this.initFn(this);
}

Model.prototype.elapsed = function() {
  return Date.now() - this.startTime;
}

Model.prototype.appDistance = function() {
  return this.nodeRadius * 1.5 + this.appRadius;
}

Model.prototype.capConstant = function() {
  return Math.sqrt(this.nodeCapacity / Math.PI) / (this.nodeRadius * 0.70);
}

Model.prototype.replicaRadius = function(size) {
  return Math.sqrt(size / Math.PI) / this.capConstant();
}

Model.prototype.leaderCount = function(roachNode) {
  var count = 0;
  for (var i = 0; i < this.roachNodes.length; i++) {
    count += this.roachNodes[i].leaderCount();
  }
  return count;
}

Model.prototype.sendRequest = function(payload, link, reverse, endFn) {
  sendRequest(this, payload, link, reverse, endFn);
}

Model.prototype.resetLocalities = function() {
  // Determine localities to display based on current locality.
  var localityMap = {};
  this.localities.length = [];
  this.links.length = [];
  for (var i = 0; i < this.roachNodes.length; i++) {
    var node = this.roachNodes[i];
    if (localityHasPrefix(node.locality, this.currentLocality)) {
      var locality = node.locality.slice(0, this.currentLocality.length + 1);
      var key = localityKey(locality);
      if (!(key in localityMap)) {
        localityMap[key] = {
          locality: locality,
          nodes: [],
        };
      }
      localityMap[key].nodes.push(node);
    }
  }
  for (loc in localityMap) {
    new Locality(localityMap[loc].locality, localityMap[loc].nodes, this);
  }
  this.layout();
}

Model.prototype.layout = function() {
  layoutModel(this);
  for (var i = 0; i < this.tables.length; i++) {
    this.tables[i].flush();
  }
}

Model.prototype.packRanges = function(node) {
  packRanges(this, node);
}

Model.prototype.clearRequests = function() {
  clearRequests(this);
}

Model.prototype.setNodeHealthy = function(node) {
  setNodeHealthy(this, node);
}

Model.prototype.setNodeUnreachable = function(node, endFn) {
  setNodeUnreachable(this, node, endFn);
}

function restart(modelIdx) {
  var model = models[modelIdx];
  model.restart();
}

function addNode(modelIdx) {
  var model = models[modelIdx];
  TODO
}

function addApp(modelIdx) {
  var model = models[modelIdx];
  TODO
}
