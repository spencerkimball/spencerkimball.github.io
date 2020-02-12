function LocalityLink(l1, l2, model) {
  this.id = model.id + "-loc-link" + model.localityLinkCount++;
  this.l1 = l1;
  this.l1.links[l2.id] = this;
  this.l2 = l2;
  this.l2.links[l1.id] = this;
  this.opacity = 0;
  this.clazz = "locality-link";
  this.cachedNetworkActivity = [0, 0];
  this.model = model;
}

// networkActivity returns a tuple of values: [outgoing throughput,
// incoming throughput, average latency].
LocalityLink.prototype.networkActivity = function() {
  var filter = {};
  for (var i = 0; i < this.l2.nodes.length; i++) {
    filter[this.l2.nodes[i].id] = null;
  }
  var total = [0, 0, 0],
      count = 0;
  for (var i = 0; i < this.l1.nodes.length; i++) {
    var activity = this.l1.nodes[i].networkActivity(filter);
    total = [total[0] + activity[0], total[1] + activity[1], total[2] + activity[2]];
    count++;
  }
  total[2] /= count;
  return total;
}
