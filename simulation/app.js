function App(zone, tables, model) {
  this.index = model.apps.length;
  this.id = "app" + this.index;
  this.zone = zone;
  this.tables = tables;
  this.retries = 0;
  this.stopped = true;
  this.routes = {};
  // Select a roachNode from within nodes matching the specified zone.
  this.nodes = model.findMatchingNodes(zone);
  if (this.nodes.length == 0) {
    console.log("ERROR: not enough nodes matching zone \"" + zone + "\" to accommodate app");
  }
  this.model = model;
  this.model.addApp(this);
}

App.prototype.run = function() {
  if (this.stopped) return;
  this.write();
  this.resetTimeout();
}

App.prototype.start = function() {
  this.stopped = false;
  this.resetTimeout();
}

App.prototype.stop = function() {
  clearTimeout(this.timeout);
  this.stopped = true;
}

App.prototype.resetTimeout = function() {
  clearTimeout(this.timeout);
  var that = this;
  var timeout = Math.max(this.model.minAppXfer * timeScale, Math.random() * this.model.appXfer * timeScale);
  timeout = Math.min(this.model.maxAppXfer * timeScale, Math.pow(2, this.retries) * timeout);
  this.timeout = setTimeout(function() { that.run(); }, timeout);
}

App.prototype.backoff = function() {
  this.retries++;
  this.resetTimeout();
}

App.prototype.success = function() {
  if (this.retries == 0) {
    return;
  }
  this.retries = 0;
  this.resetTimeout();
}

// Send a randomly sized request from app to a randomly chosen range.
App.prototype.write = function() {
  if (this.tables.length == 0) {
    return;
  }
  var table = this.tables[Math.floor(Math.random() * this.tables.length)];
  var range = table.ranges[Math.floor(Math.random() * table.ranges.length)];
  if (range.leader != null) {
    // Find a target node which isn't down.
    var nodes = [];
    for (var i = 0; i < this.nodes.length; i++) {
      if (this.nodes[i].down()) continue;
      nodes.push(this.nodes[i]);
    }
    var node = nodes[Math.floor(Math.random() * nodes.length)];
    var size = this.model.reqSize * 0.75 + (0.25 * Math.random() * this.model.reqSize);
    req = new Request(new DataPayload(size), range.leader, this, this.model);
    // Record the app -> node client traffic.
    node.appRoute.record(req);
    req.route(node, null);
  }
}
