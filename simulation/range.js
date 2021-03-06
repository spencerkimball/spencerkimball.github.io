function Range(table, model) {
  this.id = "range" + model.rangeCount++;
  this.leader = null;
  this.replicas = [];
  this.log = []; // array of arrays of requests
  this.reqMap = {}; // map from request ID to array of requests pending consensus
  this.currentReq = null;
  this.curSplitEpoch = 0;
  this.nextSplitEpoch = 0;
  this.heartbeating = false;
  this.stopped = true;
  this.table = table;
  this.table.ranges.push(this);
  this.model = model;
}

Range.prototype.stop = function() {
  for (var i = 0; i < this.replicas.length; i++) {
    this.replicas[i].stop();
  }
  clearTimeout(this.timeout);
  this.stopped = true;
}

Range.prototype.start = function() {
  this.stopped = false;
  for (var i = 0; i < this.replicas.length; i++) {
    this.replicas[i].start();
  }
  this.startHeartbeat();
}

Range.prototype.hasQuorum = function() {
  var liveCount = 0;
  for (var i = 0; i < this.replicas.length; i++) {
    if (!this.replicas[i].roachNode.down()) {
      liveCount++;
    }
  }
  return liveCount >= this.quorum();
}

Range.prototype.quorum = function() {
  return Math.ceil((this.replicas.length + 1) / 2);
}

Range.prototype.quorumSize = function() {
  var sizes = [];
  for (var i = 0; i < this.replicas.length; i++) {
    sizes.push(this.replicas[i].size);
  }
  sizes.sort();
  return sizes[this.quorum() - 1];
}

// Apply a command to the raft log. A command is represented by an
// an object containing requests to replicas with keys equal to the
// replica IDs. Commands are applied when there are enough successes
// to make a quorum.
Range.prototype.applyCommand = function(req) {
  this.log.push(req);
  this.flushLog();
}

// Flushes the log for all replicas, ensuring that replicas receive
// any commands they missed while their node was full or down.
Range.prototype.flushLog = function() {
  var count = 0;
  for (var i = 0; i < this.replicas.length; i++) {
    var r = this.replicas[i];
    r.flushed = r.logIndex == this.log.length;
    if (r.splitting || r.roachNode.down()) {
      continue;
    }
    for (var j = r.logIndex; j < this.log.length; j++) {
      var req = this.log[j];
      // If this replica did not have a request, send a new one.
      if (! (r.id in req.replicated)) {
        if (!this.forwardReqToReplica(req, r)) {
          // Not enough bandwidth; skip for now.
          //console.log(r.id + ": behind in log by " + (this.log.length - j) + " (" + j + "); not forwarding");
          break;
        }
        continue;
      }
      // Get request corresponding to this replica.
      req = req.replicated[r.id];
      if (!req.done) {
        break;
      }
      if (req.success) {
        r.logIndex++;
        req.applySuccess();
        r.flushed = r.logIndex == this.log.length;
        if (r.flushed) {
          count++;
        }
        continue;
      } else if (r.roachNode.hasSpace(req.size(), false /* count log */) && r.canReceiveRequest()) {
        // Since the node is up and can handle the request, resend it.
        req.done = false;
        var that = this,
            thatReq = req;
        req.route(this.leader.roachNode, function() {
          thatReq.done = true;
          thatReq.success = true;
          that.flushLog();
          return true;
        })
      }
      break;
    }
  }
  for (var i = 0; i < this.replicas.length; i++) {
    var r = this.replicas[i];
    if (r.splitting) continue;
    this.model.packRanges(r.roachNode);
  }
  // If we're quiescing and all replicas are flushed, clear heartbeat
  // timeout and send an immediate quiescing heartbeat.
  var allFlushed = true;
  for (var i = 0; i < this.replicas.length; i++) {
    if (r.logIndex != this.log.length) {
      allFlushed = false;
    }
  }
  if (this.heartbeating && this.model.quiesceRaft && allFlushed) {
    this.heartbeating = false;
    this.sendHeartbeat();
  }
  //console.log(this.id + " has " + count + " of " + this.replicas.length + " replicas flushed");
}

// Check for a range split in the event that the range size has grown
// beyond the split threshold. If splittable, create a new range and
// placeholder replicas.
Range.prototype.maybeSplit = function() {
  // If size is splittable, split.
  while (true) {
    var qSize = this.quorumSize();
    if (this.curSplitEpoch == this.nextSplitEpoch && qSize >= this.model.splitSize) {
      this.nextSplitEpoch++;
      // Create a new range for right hand of split and choose a random leader replica.
      var newRange = new Range(this.table, this.model);
      // Create placeholders for the new replicas so the range doesn't try to up-replicate.
      // There's still a chance for up-replication in the event that the parent range
      // itself hasn't yet fully up-replicated. That case is handled by the split code.
      var newReplicas = {};
      for (var i = 0; i < this.replicas.length; i++) {
        var r = new Replica(0, newRange, this.replicas[i].roachNode, true, this.model);
        newReplicas[this.replicas[i].id] = r;
        r.splitting = true;
      }
      // Create initial split request and add directly to leader, which will forward
      // to replicas as appropriate.
      var req = new Request(new SplitPayload(newRange, newReplicas), this.leader, null, this.model);
      req.success = true;
      this.leader.range.add(req);
      break;
    } else if (this.curSplitEpoch < this.nextSplitEpoch && this.leader.splitEpoch == this.nextSplitEpoch) {
      this.curSplitEpoch = this.nextSplitEpoch;
    }
    break;
  }
}

// tryElection attempts to select a new leader if there are is at
// least a quorum of live replicas. The new leader is chosen randomly
// from amongst the live replicas.
Range.prototype.tryElection = function() {
  var live = [];
  for (var i = 0; i < this.replicas.length; i++) {
    if (!this.replicas[i].roachNode.down()) {
      live.push(this.replicas[i]);
    }
  }
  if (live.length >= this.quorum()) {
    //var oldLeader = this.leader;
    this.leader = live[Math.floor(Math.random() * live.length)];
    //console.log(this.id + " replacing leader " + oldLeader.roachNode.id + " with " + this.leader.roachNode.id);
  }
}

Range.prototype.startHeartbeat = function() {
  clearTimeout(this.timeout);
  // If the leader is down, try to elect a new leader.
  if (this.leader.roachNode.down()) {
    this.tryElection();
  }
  var that = this;
  this.timeout = setTimeout(function() {
    // TODO(spencer): perhaps this should be lazyloadRaft instead for
    // more options.
    if (!that.model.quiesceRaft) {
      this.heartbeating = true;
      that.sendHeartbeat();
    }
    that.startHeartbeat();
  }, this.model.heartbeatInterval);
}

Range.prototype.sendHeartbeat = function() {
  if (!this.model.showHeartbeats || this.stopped) return;
  clearTimeout(this.timeout);
  var req = new Request(new HeartbeatPayload(), this.leader, null, this.model);
  req.success = true;
  this.leader.range.add(req);
}

// addReplica appends the replica to the range's replica array.
Range.prototype.addReplica = function(replica) {
  this.replicas.push(replica);
  if (this.leader == null) {
    this.leader = replica;
  }
  /*
  console.log("adding replica to " + this.id)
  for (var i = 0; i < this.replicas.length; i++) {
    if (this.replicas[i] == null) continue
    console.log("  have " + this.replicas[i].id + ", size=" + this.replicas[i].size + " at " + this.replicas[i].roachNode.id)
  }
  */
  this.flushLog();
}

// Forward from leader to other replicas which haven't yet been
// replicated. This needs to always be invoked because new replicas
// might be added between the request to the leader and reaching
// consensus.
Range.prototype.forwardReq = function(req) {
  for (var i = 0; i < this.replicas.length; i++) {
    if (this.replicas[i] == null) continue;
    this.forwardReqToReplica(req, this.replicas[i]);
  }
}

// forwardReqToReplica checks available bandwidth for the request and
// returns false if not enough is available. "Bandwidth" is measured
// roughly, in requests per second.
Range.prototype.forwardReqToReplica = function(req, replica) {
  // Skip if already forwarded.
  if (replica.id in req.replicated || !replica.canReceiveRequest()) {
    return;
  }
  var forward = req.clone(replica);
  //console.log(req.id + " forwarding from " + this.leader.roachNode.id + " to " + replica.roachNode.id)
  forward.replicated[replica.id] = forward;
  forward.route(this.leader.roachNode, null);
}

// Add request to pending map; if there's consensus for request ID,
// add requests to pending replicas.
Range.prototype.add = function(req) {
  req.done = true;

  if (! (req.id in this.reqMap)) {
    if (!req.destReplica.isLeader()) {
      //console.log(req.id + " to " + req.destReplica.id + " arrived after quorum (leader is " + req.destReplica.range.leader.id + "); ignoring")
      this.flushLog();
      return;
    }
    //console.log("leader " + req.id + " arrived; forwarding")
    req.replicated[req.destReplica.id] = req;
    this.reqMap[req.id] = req;

    if (req.success) {
      this.forwardReq(req);
      // Start heartbeat only if this isn't a heartbeat.
      if (!(req.payload instanceof HeartbeatPayload)) {
        this.startHeartbeat();
      } else {
        return;
      }
    }
  }

  // Count successes and failures.
  var successes = 0, failures = 0;
  for (var i = 0; i < this.replicas.length; i++) {
    if (this.replicas[i] == null || !(this.replicas[i].id in req.replicated)) {
      continue;
    }
    var reqI = req.replicated[this.replicas[i].id]
    if (!reqI.done) {
      continue;
    }
    if (reqI.success) {
      successes++;
    } else {
      failures++;
    }
  }
  // See if we've reached quorum (or won't be able to). If quorum, add
  // all successful requests to their respective replicas; otherwise,
  // if quorum is impossible due to failures, propagate an error via
  // the leader's request.
  if (! ("completed" in req.replicated)) {
    if (failures > (this.replicas.length - this.quorum())) {
      req.replicated["completed"] = true;
      // If success is impossible, propagate error via leader.
      //console.log(req.id + " failed; propagating")
      req.replicated[this.leader.id].propagateError();
    } else if (successes >= this.quorum()) {
      req.replicated["completed"] = true;
      //console.log(req.id + " succeeded; applying to log")
      // Apply this command to the log.
      this.applyCommand(req);
      this.maybeSplit();
    } else {
      //console.log(req.id + " hasn't reached quorum");
      return;
    }
    // Delete request map entry if quorum or complete failure.
    delete this.reqMap[req.id];
  }
}
