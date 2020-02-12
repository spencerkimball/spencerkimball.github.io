// Creates a replica and adds it to the roach node and the range.
function Replica(size, index, range, roachNode, add, model) {
  this.id = "replica" + model.replicaCount++;
  this.size = size;
  this.index = index;
  this.logIndex = 0;
  this.flushed = true;
  this.range = range;
  this.roachNode = roachNode;
  this.model = model;
  this.splitting = false;
  this.splitEpoch = 0;
  this.throughput = new ExpVar();
  this.stopped = true;
  this.lastRequestTime = 0;
  this.allotment = model.maxRequestsPerSecond;
  if (add) {
    this.roachNode.replicas.push(this);
    this.range.addReplica(this);
  }
}

Replica.prototype.isLeader = function() {
  return this == this.range.leader;
}

Replica.prototype.hasSpace = function(size, countLog) {
  return this.roachNode.hasSpace(size, countLog);
}

Replica.prototype.canReceiveRequest = function() {
  if (this.splitting) {
    return false;
  }
  var time = Date.now(),
      deltaTime = (time - this.lastRequestTime) / 1000,
      newAllotment = this.allotment + Math.floor(deltaTime * this.model.maxRequestsPerSecond);
  this.lastRequestTime = time;
  this.allotment = Math.min(this.model.maxRequestsPerSecond, newAllotment);
  if (this.allotment > 0) {
    this.allotment--;
    return true;
  }
  return false;
}

Replica.prototype.getSize = function(countLog) {
  var size = this.size;
  if (countLog) {
    for (var i = this.logIndex; i < this.range.log.length; i++) {
      var req = this.range.log[i];
      size += req.size();
    }
  }
  return size;
}

Replica.prototype.start = function() {
  this.stopped = false;
  this.setTimeout(this.model.periodicInterval * timeScale * Math.random());
}

Replica.prototype.stop = function() {
  clearTimeout(this.timeout);
  this.stopped = true;
}

Replica.prototype.run = function() {
  if (this.stopped) return;
  if (!this.roachNode.down()) {
    this.replicate();
    this.rebalance();
    this.leadership();
  }
  this.setTimeout(this.model.periodicInterval * timeScale);
}

Replica.prototype.setTimeout = function(timeout) {
  var that = this;
  clearTimeout(this.timeout);
  this.timeout = setTimeout(function() { that.run(); }, timeout);
}

Replica.prototype.replicate = function() {
  var zoneConfig = this.range.getZoneConfig();
  if (this.roachNode.busy || !this.isLeader() || this.range.replicas.length == zoneConfig.length) return;
  // Choose target and create new replica.
  var that = this;
  var targetNode = this.chooseReplicateTarget();
  if (targetNode == null) {
    return;
  }
  // Set nodes busy until replication is complete.
  this.roachNode.setBusy(true);
  targetNode.setBusy(true);
  var newReplica = new Replica(this.size, this.range.replicas.length, this.range, targetNode, false, this.model);
  newReplica.logIndex = this.logIndex;
  newReplica.flushed = this.flushed;
  newReplica.splitEpoch = this.splitEpoch;
  // Send the replicated snapshot.
  var req = new Request(new DataPayload(this.size, "replicate"), newReplica, null, this.model);
  req.route(this.roachNode, function() {
    that.roachNode.setBusy(false);
    targetNode.setBusy(false);
    targetNode.replicas.push(newReplica);
    that.range.addReplica(newReplica);
    that.model.packRanges(targetNode);
    if (!newReplica.range.stopped) {
      newReplica.start();
    }
    return true;
  })
  // Forward any requests which are still pending quorum from the leader.
  for (var i = 0, keys = Object.keys(this.range.reqMap); i < keys.length; i++) {
    var req = this.range.reqMap[keys[i]];
    this.range.forwardReqToReplica(req, newReplica);
  }
}

Replica.prototype.rebalance = function() {
  if (this.roachNode.busy) return;
  var that = this;
  var targetNode = this.chooseRebalanceTarget();
  if (targetNode == null) return;
  // Set nodes busy until rebalance is complete.
  this.roachNode.setBusy(true);
  targetNode.setBusy(true);
  var newReplica = new Replica(this.size, this.index, this.range, targetNode, false, this.model);
  newReplica.logIndex = this.logIndex;
  newReplica.flushed = this.flushed;
  newReplica.splitEpoch = this.splitEpoch;
  // Send the replicated snapshot.
  var req = new Request(new DataPayload(this.size, "rebalance"), newReplica, null, this.model);
  req.route(this.roachNode, function() {
    that.stop();
    that.roachNode.setBusy(false);
    targetNode.setBusy(false);
    // Remove this replica from its node.
    var index = that.roachNode.replicas.indexOf(that);
    if (index == -1) return;
    that.roachNode.replicas.splice(index, 1);
    index = that.range.replicas.indexOf(that);
    if (index == -1) return;
    that.range.setReplica(newReplica, index);
    targetNode.replicas.push(newReplica);
    that.model.packRanges(that.roachNode);
    that.model.packRanges(targetNode);
    if (!newReplica.range.stopped) {
      newReplica.start();
    }
    return true
  })
}

// Let replicas which are leaders pass leadership to other replicas
// periodically.
Replica.prototype.leadership = function() {
  if (!this.isLeader()) return;
  var nodeLeaderCount = this.roachNode.leaderCount();
  //console.log("considering leadership change for " + this.range.id + " from " + this.id + ", node " + this.roachNode.id + " lc=" + nodeLeaderCount)
  // Choose target and create new replica.
  var that = this;
  var targetNode = this.chooseExisting(
    function(n) { return n != that.roachNode && n.leaderCount() < nodeLeaderCount - 1; },
    function(nA, nB) { return nA.leaderCount() < nB.leaderCount(); });
  if (targetNode == null) {
    //console.log("found no suitable target for leadership change for " + this.range.id + " from " + this.id)
    return;
  }
  for (var i = 0; i < this.range.replicas.length; i++) {
    if (this.range.replicas[i].roachNode == targetNode) {
      //console.log("changing leadership for " + this.range.id + " from " + this.id + " to " + this.range.replicas[i].id)
      this.range.leader = this.range.replicas[i];
      return;
    }
  }
}

// Chooses a target which returns true for filterFn and sorts lowest
// on the scoreFn.
Replica.prototype.chooseExisting = function(filterFn, scoreFn) {
  var best = null;
  for (var i = 0; i < this.range.replicas.length; i++) {
    if (this.range.replicas[i].splitting) continue;
    var rn = this.range.replicas[i].roachNode;
    // Skip any nodes which are currently busy rebalancing or already part of the range.
    //console.log("candidate " + rn.id + " down: " + rn.down() + " busy: " + rn.busy + " !filtered? " + !filterFn(rn) + " lc=" + rn.leaderCount())
    if (rn.down() || rn.busy || !filterFn(rn)) continue;
    if (best == null || scoreFn(rn, best)) {
      best = rn;
    }
  }
  return best;
}

// findFirstMissingZone finds the first zone in this range's zone config
// for which there is no replica which matches the constraints.
Replica.prototype.findFirstMissingZone = function() {
  var zoneConfig = this.range.getZoneConfig();
  for (var z = 0; z < zoneConfig.length; z++) {
    var zone = zoneConfig[z];
    if (z >= this.range.replicas.length) {
      return zone;
    }
    var found = false; // did we find a replica matching the constraints of this zone?
    for (var i = 0; i < this.range.replicas.length && !found; i++) {
      var node = this.range.replicas[i].roachNode;
      var matches = true; // does this replica match all constraints on the zone config?
      for (var j = 0; j < zone.length && matches; j++) {
        var matchForJ = false;
        for (var k = 0; k < node.locality.length; k++) {
          if (zone[j] == node.locality[k]) {
            matchForJ = true;
            break;
          }
        }
        if (!matchForJ) {
          matches = false;
        }
      }
      if (matches) {
        found = true;
      }
    }
    if (!found) {
      return zone;
    }
  }
  return null;
}

// chooseReplicateTarget chooses a target from another datacenter (or
// if there's only one, use that), which has space and has the fewest
// number of non-splitting ranges.
Replica.prototype.chooseReplicateTarget = function() {
  var that = this;
  var filterFn = function(n) { return n.hasSpace(that.size, true /* count log */); };
  var scoreFn = function(nA, nB) { return nA.nonSplitting() < nB.nonSplitting(); };

  // Find first missing zone from zoneConfig.
  var zone = this.findFirstMissingZone();
  if (zone == null) {
    return null;
  }

  // Find nodes matching the constraints of the missing zone.
  var nodes = this.model.findMatchingNodes(zone, this.range.replicas);

  // Find the best node amongst those available.
  var best = null;
  for (var i = 0; i < nodes.length; i++) {
    var rn = nodes[i];
    // Skip any nodes which are currently busy rebalancing or already part of the range.
    if (rn.down() || rn.busy || !filterFn(rn)) continue;
    if (best == null || scoreFn(rn, best)) {
      best = rn;
    }
  }
  return best;
}

// Chooses a target node that matches the zone config constraints of
// this replica's index, and which has space and the fewest number of
// non-splitting ranges.
Replica.prototype.chooseRebalanceTarget = function() {
  var that = this;
  var filterFn = function(n) { return n.hasSpace(that.size, true /* count log */); };
  var scoreFn = function(nA, nB) { return nA.nonSplitting() < nB.nonSplitting(); };

  // Create a set of existing replica's nodeIDs for this range.
  var repExist = {};
  for (var i = 0; i < this.range.replicas.length; i++) {
    repExist[this.range.replicas[i].roachNode.id] = true;
  }

  // Find nodes matching the constraints of this replica's zone.
  var index = this.range.replicas.indexOf(this),
      zone = this.range.getZoneConfig()[index],
      nodes = this.model.findMatchingNodes(zone, []),
      mean = 0,
      candidates = [],
      violation = true;
  for (var i = 0; i < nodes.length; i++) {
    var rn = nodes[i];
    if (rn == this.roachNode) { violation = false; }
    mean += rn.nonSplitting();
    // Skip any nodes which are currently busy rebalancing or already part of the range.
    //console.log("down: " + rn.down() + ", busy: " + rn.busy + ", exists: " + (rn.id in repExist) + ", !filtered: " + !filterFn(rn));
    if (rn.down() || rn.busy || (rn.id in repExist) || !filterFn(rn)) continue;
    candidates.push(rn);
  }
  mean /= nodes.length;

  var reqDistance = 2;
  if (this.model.exactRebalancing) {
    reqDistance = 0;
  }

  var best = null;
  for (var i = 0; i < candidates.length; i++) {
    var rn = candidates[i];
    if (!violation) {
      if (this.roachNode.nonSplitting() - mean < reqDistance || mean - rn.nonSplitting() < reqDistance) continue;
    }
    if (best == null || scoreFn(rn, best)) {
      best = rn;
    }
  }
  if (violation && best != null) {
    //console.log("have violation " + this.roachNode.locality + " in zone " + zone + "; rebalancing to " + best.locality);
  }

  return best;
}

// Writes data to the replica.
Replica.prototype.add = function(req) {
  // Update the node once the data has been set.
  this.size += req.size();
  this.throughput.record(req.size());
  this.range.table.record(req);
  if (req.originApp != null) {
    req.originApp.success();
  }
}

// Heartbeats in this model are for show; do nothing.
Replica.prototype.heartbeat = function() {
}

Replica.prototype.split = function(newReplica) {
  var leftover = this.size - this.size / 2;
  this.size = this.size / 2;
  this.splitEpoch = this.range.nextSplitEpoch;
  // If the new replica is null, it means that the original pre-split
  // range was not fully up-replicated at the time of the split, so
  // no replica was created to house the right hand side of this replica's
  // split. That's OK as that RHS will be up-replicated from the new range
  // automatically. We just want to set this replica's size appropraitely
  // and return.
  if (newReplica == null) {
    return;
  }
  // The first split replica is set as the leader. Having a leader set
  // enables this range to receive app writes.
  if (newReplica.range.leader == null) {
    newReplica.range.leader = newReplica;
  }
  newReplica.splitting = false;
  newReplica.splitEpoch = this.range.nextSplitEpoch;
  newReplica.size = leftover;
  newReplica.start(); // start now that the split is complete
  //console.log("split " + this.range.id + " " + this.id + " left=" + this.size + ", right=" + leftover);
}
