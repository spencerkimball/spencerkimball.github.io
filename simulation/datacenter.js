function Datacenter(longitude, latitude, model) {
  this.index = model.dcCount++
  this.id = "dc" + this.index
  this.apps = []
  this.roachNodes = []
  this.model = model
  this.location = model.projection([longitude, latitude])
  this.dcNode = {id: "datacenter" + this.index, x: this.location[0], y: this.location[1], fixed: true, radius: 3, clazz: "datacenter", dc: this, links: {}}
  this.model.forceNodes.push(this.dcNode)
  if (!this.model.useSwitches) {
    this.dcNode.radius = 0
  }

  // Link this datacenter to all others.
  for (var i = 0; i < this.model.datacenters.length; i++) {
    var dc = this.model.datacenters[i]
    latency = 4000 * Math.sqrt((this.location[0] - dc.location[0]) * (this.location[0] - dc.location[0]) +
                               (this.location[1] - dc.location[1]) * (this.location[1] - dc.location[1])) / viewWidth
    var l = {id: "link" + this.model.linkCount++, source: this.dcNode, target: dc.dcNode, clazz: "dclink", latency: latency}
    this.dcNode.links[dc.dcNode.id] = l
    var rl = {id: "link" + this.model.linkCount++, source: dc.dcNode, target: this.dcNode, clazz: "dclink", latency: latency}
    dc.dcNode.links[this.dcNode.id] = rl
    // Use non-force links.
    this.model.links.push(l)
    this.model.links.push(rl)
  }

  // Add to array of datacenters.
  this.model.datacenters.push(this)
}

Datacenter.prototype.addNode = function(rn) {
  // Link this node to the node.
  var clazz = "switchlink"
  if (!this.model.useSwitches) {
    clazz = ""
  }
  l = {id: "link" + this.model.linkCount++, source: rn, target: this.dcNode, clazz: clazz, distance: this.model.nodeDistance, latency: this.model.dcLatency}
  rn.links[this.dcNode.id] = l
  rl = {id: "link" + this.model.linkCount++, source: this.dcNode, target: rn, clazz: clazz, distance: this.model.nodeDistance, latency: this.model.dcLatency}
  this.dcNode.links[rn.id] = rl
  this.model.forceLinks.push(l)
  this.model.forceLinks.push(rl)

  // Add new node & update visualization.
  this.roachNodes.push(rn)
  this.buildInterNodeLinks()
  this.model.forceNodes.push(rn)
  this.model.layout()
}

Datacenter.prototype.removeNode = function(rn) {
  var index = this.roachNodes.indexOf(this)
  if (index != -1) {
    this.roachNodes.splice(index, 1)
  }
  index = this.model.forceNodes.indexOf(this)
  if (index != -1) {
    this.model.forceNodes.splice(index, 1)
  }
  for (var i = 0, keys = Object.keys(rn.links); i < keys.length; i++) {
    var l = rn.links[keys[i]]
    index = this.model.forceLinks.indexOf(l)
    if (index != -1) {
      this.model.forceLinks.splice(index, 1)
    }
    var rl = l.target.links[rn.id]
    delete l.target.links[rn.id]
    index = this.model.forceLinks.indexOf(rl)
    if (index != -1) {
      this.model.forceLinks.splice(index, 1)
    }
  }
  if (rn.app != null) {
    this.removeApp(rn.app)
  }
  this.buildInterNodeLinks()
  this.model.layout()
}

Datacenter.prototype.buildInterNodeLinks = function() {
  // Create forward and backward connections from each node to all other nodes in the datacenter.
  for (var i = 0; i < this.roachNodes.length; i++) {
    source = this.roachNodes[i]
    for (var j = i + 1; j < this.roachNodes.length; j++) {
      target = this.roachNodes[j]
      // Compute internode distance, which is length of chord separating nodes.
      var distance = j - i
      var half = this.roachNodes.length / 2
      if (distance > half) {
        distance = i + (this.roachNodes.length - j)
      }
      var angle = Math.PI * 0.5 / (half / distance)
      var interNodeDistance = Math.abs((2 * this.model.nodeDistance) * Math.sin(angle))
      //console.log("internodedistance: " + interNodeDistance + ", angle: " + angle)
      if (!(target.id in source.links)) {
        var l = {id: "link" + this.model.linkCount++, source: source, target: target, clazz: "nodelink", latency: this.model.dcLatency}
        source.links[target.id] = l
        var rl = {id: "link" + this.model.linkCount++, source: target, target: source, clazz: "nodelink", latency: this.model.dcLatency}
        target.links[source.id] = rl
        this.model.forceLinks.push(source.links[target.id])
        this.model.forceLinks.push(target.links[source.id])
      }
      source.links[target.id].distance = interNodeDistance
      target.links[source.id].distance = interNodeDistance
    }
  }
}

// Note that we've disabled visualization of apps. They now send
// requests directly from the gateway node they're connected to.
Datacenter.prototype.addApp = function(app) {
  /*
  if (this.dcNode != null) {
    // Link to node node.
    app.datacenterLink = {source: app, target: this.dcNode, clazz: "", distance: this.model.nodeDistance + this.model.appDistance(), latency: 0.25}
    this.model.forceLinks.push(app.datacenterLink)
  }

  // Add link from app to node.
  this.model.forceLinks.push(app.link)
  */

  this.apps.push(app)
  //this.model.forceNodes.push(app)
  //this.model.layout()
}

Datacenter.prototype.removeApp = function(app) {
  app.stop()
  var index = this.apps.indexOf(app)
  if (index != -1) {
    this.apps.splice(index, 1)
  }
  index = this.model.forceNodes.indexOf(app)
  if (index != -1) {
    this.model.forceNodes.splice(index, 1)
  }
  index = this.model.forceLinks.indexOf(app.link)
  if (index != -1) {
    this.model.forceLinks.splice(index, 1)
  }
  if (app.datacenterLink != null) {
    index = this.model.forceLinks.indexOf(app.datacenterLink)
    if (index != -1) {
      this.model.forceLinks.splice(index, 1)
    }
  }
  this.model.layout()
}

Datacenter.prototype.leaderCount = function() {
  var count = 0
  for (var i = 0; i < this.roachNodes.length; i++) {
    count += this.roachNodes[i].leaderCount()
  }
  return count
}
