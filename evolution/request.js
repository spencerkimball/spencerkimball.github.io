function Request(payload, destReplica, app, model) {
  this.id = "req" + model.reqCount++;
  this.payload = payload;
  this.payload.req = this;
  this.destReplica = destReplica;
  this.originApp = app;
  this.replicated = {};
  this.routes = [];
  this.done = false;
  this.model = model;
}

Request.prototype.clone = function(newDestReplica) {
  var cloned = new Request(this.payload.clone(), newDestReplica, null, this.model);
  cloned.id = this.id;
  cloned.replicated = this.replicated;
  cloned.completionFn = this.completionFn;
  return cloned;
}

Request.prototype.size = function() {
  return this.payload.size;
}

Request.prototype.send = function(link, endFn) {
  this.model.sendRequest(this.payload, link, false, endFn);
}

Request.prototype.applySuccess = function() {
  this.payload.applySuccess();
}

Request.prototype.propagateError = function() {
  if (this.routes.length == 0) {
    // Notify the app if origin is set.
    if (this.originApp != null) {
      this.originApp.backoff();
      return false;
    }
    return true;
  }
  link = this.routes.pop();
  var that = this;
  // Propagate error backwards using sendRequest with reverse=true and
  // an endFn which recursively descends into the link stack.
  var error_payload = new ErrorPayload(this.payload);
  this.model.sendRequest(error_payload, link, true, function() { return that.propagateError(); });
  return true;
}

Request.prototype.route = function(sourceNode, endFn) {
  var destNode = this.destReplica.roachNode;
  if (destNode.id == sourceNode.id) {
    // Loopback; just process the request without sending further.
    this.process(true, endFn);
    return;
  }
  this.writeDirect(sourceNode, destNode, endFn);
}

Request.prototype.writeDirect = function(sourceNode, targetNode, endFn) {
  // Route the request.
  if (!(targetNode.id in sourceNode.routes)) {
    throw "missing route from " + sourceNode.id + " to " + targetNode.id + "; ignoring.";
    return;
  }
  // No-op if target node is down.
  if (targetNode.down()) {
    this.process(false, endFn);
    return;
  }
  var route = sourceNode.routes[targetNode.id];

  // Animate the request from the app's graph node along the graph
  // route to the roachnode's graph node.
  this.routes.push(route);
  var that = this;
  this.send(route, function() {
    // Check if the route target has reached the destination replica.
    var destNode = that.destReplica.roachNode;
    if (targetNode != destNode) {
      // If we're not at the correct node yet, route.
      that.route(targetNode, endFn);
      route.record(that);
      return true;
    } else {
      // Check if the leader has changed; if so, and this request has
      // not been replicated yet, we need to forward to the leader.
      if (that.replicated.length == 0 && !that.destReplica.isLeader()) {
        that.destReplica = that.destReplica.range.leader;
        that.route(targetNode, endFn);
        route.record(that);
        //console.log(req.id + " being reforwarded to changed leader")
        return true;
      }
      that.process(that.payload.canSucceed(), endFn);
      route.record(that);
      return that.success;
    }
  })
}

Request.prototype.process = function(success, endFn) {
  // We've arrived at the correct replica; try to add the request
  // to the replica. If there's no space here and we're the
  // leader, fail the request immediately (i.e. skip forwarding to
  // followers).
  this.success = success;
  if (endFn != null) {
    endFn();
  } else {
    this.destReplica.range.add(this);
    if (!this.success && this.destReplica.isLeader()) {
      //console.log(req.id + " arrived at full leader; propagating error without forwarding")
      this.propagateError();
    }
  }
  return this.success;
}

function DataPayload(size, typ) {
  this.size = size;
  this.typ = typ;
}

DataPayload.prototype.clone = function() {
  return new DataPayload(this.size, this.typ);
}

DataPayload.prototype.color = function() {
  return this.req.destReplica.range.color();
}

DataPayload.prototype.radius = function() {
  return 5;
  //return this.req.model.replicaRadius(this.size);
}

DataPayload.prototype.typ = function() {
  return this.typ;
}

DataPayload.prototype.canSucceed = function() {
  return !this.req.destReplica.roachNode.down() &&
    this.req.destReplica.hasSpace(this.size, true /* count log */);
}

DataPayload.prototype.applySuccess = function() {
  this.req.destReplica.add(this.req);
}

// SplitPayload contains information necessary to effect a split request.
// The new range created by the split and the new replicas are provided
// as arguments.
function SplitPayload(newRange, newReplicas) {
  this.newRange = newRange;
  this.newReplicas = newReplicas;
  this.size = 0;
}

SplitPayload.prototype.clone = function() {
  return new SplitPayload(this.newRange, this.newReplicas);
}

SplitPayload.prototype.color = function() {
  return "#ee0";
}

SplitPayload.prototype.typ = function() {
  return "split";
}

SplitPayload.prototype.radius = function() {
  return 2;
}

SplitPayload.prototype.canSucceed = function() {
  return !this.req.destReplica.roachNode.down();
}

SplitPayload.prototype.applySuccess = function() {
  this.req.destReplica.split(this.newReplicas[this.req.destReplica.id]);
}

// HeartbeatPayload contains information necessary to effect a heartbeat request.
function HeartbeatPayload() {
  this.size = 0;
}

HeartbeatPayload.prototype.clone = function() {
  return new HeartbeatPayload();
}

HeartbeatPayload.prototype.color = function() {
  return "#f00";
}

HeartbeatPayload.prototype.typ = function() {
  return "heartbeat";
}

HeartbeatPayload.prototype.radius = function() {
  return 2;
}

HeartbeatPayload.prototype.canSucceed = function() {
  return !this.req.destReplica.roachNode.down();
}

HeartbeatPayload.prototype.applySuccess = function() {
  this.req.destReplica.heartbeat();
}

// ErrorPayload is sent on a failed request.
function ErrorPayload(orig_payload) {
  this.size = orig_payload.size;
}

ErrorPayload.prototype.clone = function() {
  return new ErrorPayload();
}

ErrorPayload.prototype.color = function() {
  return "#f00";
}

ErrorPayload.prototype.typ = function() {
  return "error";
}

ErrorPayload.prototype.radius = function() {
  return 2;
}

ErrorPayload.prototype.canSucceed = function() {
  return true;
}

ErrorPayload.prototype.applySuccess = function() {
}
