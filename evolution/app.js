function App(zone, tables, model) {
  this.index = model.apps.length;
  this.id = "app" + this.index;
  this.zone = zone;
  this.tables = tables;
  this.retries = 0;
  this.stopped = true;
  this.routes = {};
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
  this.run();
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
  // Select a roachNode from within nodes matching the specified zone.
  nodes = this.model.findMatchingNodes(this.zone, []);
  if (nodes.length == 0) {
    console.log("ERROR: not enough nodes matching zone \"" + this.zone + "\" to accommodate app");
  }
  var node = nodes[Math.floor(Math.random() * nodes.length)];
  var replica = node.replicas[Math.floor(Math.random() * node.replicas.length)];
  if (replica != null && replica.range.leader != null) {
    var size = this.model.reqSize * 0.75 + (0.25 * Math.random() * this.model.reqSize);
    req = new Request(new DataPayload(size, "write"), replica.range.leader, this, this.model);
    req.completionFn = function(req) { node.appRoute.record(req); };
    req.route(node, null);
  }
}
