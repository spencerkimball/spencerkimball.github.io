// This file defines a simple model for describing a CockroachDB cluster.

var modelCount = 0;
var models = [];

function Model(id, width, height, initFn) {
  this.index = modelCount++;
  this.id = id;
  this.width = width;
  this.height = height;
  this.initFn = initFn;
  this.nodeRadius = 36;
  this.appRadius = 0;
  this.interNodeDistance = 25;
  this.nodeCapacity = 50.0;
  this.reqSize = 0.1;
  this.splitSize = 1.0;
  this.unitSize = 64<<20;
  this.appXfer = 3000;           // in ms
  this.minAppXfer = 1000;        // in ms
  this.maxAppXfer = 10000;       // in ms
  this.heartbeatInterval = 1500; // in ms
  this.periodicInterval = 2000;  // in ms
  this.roachNodes = [];
  this.tables = [];
  this.databases = [];
  this.databasesByName = {};
  this.databaseCount = 0;
  this.apps = [];
  this.reqCount = 0;
  this.rangeCount = 0;
  this.links = [];
  this.linkCount = 0;
  this.routeCount = 0;
  this.replicaCount = 0;
  this.maxClientActivity = 1;
  this.maxNetworkActivity = 1;
  this.exactRebalancing = false;
  this.currentLocality = [];
  this.localities = [];
  this.localityCount = 0;
  this.localityLinks = [];
  this.localityLinkCount = 0;
  this.defaultZoneConfig = [[], [], []]; // three replicas
  this.showHeartbeats = false;
  this.quiesceRaft = true;
  this.stopped = true;
  this.played = false;
  this.showLatencies = false;

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
  for (var i = 0; i < this.localities.length; i++) {
    // Add localityLinks from all pre-existing localities to this newly added locality.
    var oLocality = this.localities[i];
    this.localityLinks.push(new LocalityLink(oLocality, locality, this));
  }

  // Add to array of datacenters.
  this.localities.push(locality);
}

// findMatchingNodes finds and returns a list of nodes which match the
// constraints specified in the supplied zone constraints array.
Model.prototype.findMatchingNodes = function(zone) {
  var nodes = [];
  if (zone == null) {
    return nodes;
  }
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

Model.prototype.latency = function(coords, oCoords) {
  return 5 + 80000 * distance(coords, oCoords) / (viewWidth * this.projection.scale());
}

// localityLatencies computes the latencies from the city's location
// via attributes 'latitude' and 'longitude' and returns an array of
// latencies, one per locality in order of localities. The array of
// latencies is cached on the city object for performance.
Model.prototype.localityLatencies = function(city) {
  if (city.latencies == null) {
    city.latencies = [];
    for (var i = 0; i < this.localities.length; i++) {
      city.latencies.push(this.latency(
        this.projection(this.localities[i].location),
        this.projection([city.longitude, city.latitude])));
    }
  }
  return city.latencies;
}

Model.prototype.addNode = function(node) {
  // Link this node to all others.
  var coords = this.projection(node.location);
  for (var i = 0; i < this.roachNodes.length; i++) {
    var oNode = this.roachNodes[i];
    var oCoords = this.projection(oNode.location);
    var latency = this.latency(coords, oCoords);
    var l = new Link(node, oNode, "route", latency, this);
    node.routes[oNode.id] = l;
    var rl = new Link(oNode, node, "route", latency, this);
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

Model.prototype.addDatabase = function(db) {
  this.databases.push(db);
  // For ordering databases by index when we only have access to the name.
  this.databasesByName[db.name] = db;
}

// Note that we've disabled visualization of apps. They now send
// requests directly from the gateway node they're connected to.
Model.prototype.addApp = function(app) {
  this.apps.push(app);
  app.roachNode.addApp(app);
  app.routes[app.roachNode.id] = new Link(app, app.roachNode, "route", 0, this);;
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
  // Setup periodic display refresh.
  this.setRefreshTimeout()
}

Model.prototype.setRefreshTimeout = function() {
  clearTimeout(this.timeout);
  var that = this;
  this.timeout = setTimeout(function() {
    that.refreshLayout();
    that.setRefreshTimeout();
  }, 2500);
}

Model.prototype.stop = function() {
  clearTimeout(this.timeout);
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
  // Reset all city latencies.
  for (var i = 0; i < globalCities.length; i++) {
    globalCities[i].latencies = null;
  }
  // Determine localities to display based on current locality.
  var localityMap = {};
  this.localities = [];
  this.localityLinks = [];
  this.localityScale = 1;
  this.maxClientActivity = 1;
  this.maxNetworkActivity = 1;
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
    var l = new Locality(localityMap[loc].locality, localityMap[loc].nodes, this);
    // Initialize the max client and network activity values for the displayed localities.
    l.clientActivity();
    l.totalNetworkActivity();
  }
  this.layout();
}

function distance(n1, n2) {
  return Math.sqrt((n1[0] - n2[0]) * (n1[0] - n2[0]) + (n1[1] - n2[1]) * (n1[1] - n2[1]));
}

function length(v) {
  return Math.sqrt(v[0]*v[0] + v[1]*v[1]);
}

function add(v1, v2) {
  return [v1[0] + v2[0], v1[1] + v2[1]];
}

function sub(v1, v2) {
  return [v1[0] - v2[0], v1[1] - v2[1]];
}

function mult(v1, scalar) {
  return [v1[0] * scalar, v1[1] * scalar];
}

function normalize(v) {
  var l = length(v);
  if (l == 0) {
    return [0, 0];
  }
  return [v[0] / l, v[1] / l];
}

function invert(v) {
  return [v[1], -v[0]];
}

function dotprod(v1, v2) {
  return v1[0] * v2[0] + v1[1] * v2[1];
}

// computeLocalityScale returns a scale factor in the interval (0, 1]
// that allows for all localities to exist with no overlap.
// TODO(spencer): use a quadtree for performance if there are many
// localities.
Model.prototype.computeLocalityScale = function() {
  var scale = 1,
      maxDistance = this.skin.maxRadius(this) * 2;
  for (var i = 0; i < this.localityLinks.length; i++) {
    var link = this.localityLinks[i],
        l1 = this.projection(link.l1.location),
        l2 = this.projection(link.l2.location),
        d = distance(l1, l2);
    link.l1.pos = l1;
    link.l2.pos = l2;
    if (d < maxDistance) {
      var newScale = d / maxDistance;
      if (newScale < scale) {
        scale = newScale;
      }
    }
  }
  this.localityScale = scale;
}

// findClosestPoint locates the closest point on the vector starting
// from point s and extending through u (t=1), nearest to point p.
// Returns an empty vector if the closest point is either start or end
// point or located before or after the line segment defined by [s,
// e].
function findClosestPoint(s, e, p) {
  // u = e - s
  // v = s+tu - p
  // d = length(v)
  // d = length((s-p) + tu)
  // d = sqrt(([s-p].x + tu.x)^2 + ([s-p].y + tu.y)^2)
  // d = sqrt([s-p].x^2 + 2[s-p].x*tu.x + t^2u.x^2 + [s-p].y^2 + 2[s-p].y*tu.y + t^2*u.y^2)
  // ...minimize with first derivative with respect to t
  // 0 = 2[s-p].x*u.x + 2tu.x^2 + 2[s-p].y*u.y + 2tu.y^2
  // 0 = [s-p].x*u.x + tu.x^2 + [s-p].y*u.y + tu.y^2
  // t*(u.x^2 + u.y^2) = [s-p].x*u.x + [s-p].y*u.y
  // t = ([s-p].x*u.x + [s-p].y*u.y) / (u.x^2 + u.y^2)
  var u = sub(e, s),
      d = sub(s, p),
      t = -(d[0]*u[0] + d[1]*u[1]) / (u[0]*u[0] + u[1]*u[1]);
  if (t <= 0 || t >= 1) {
    return [0, 0];
  }
  return add(s, mult(u, t));
}

// computeLocalityLinkPaths starts with a line between the outer radii
// of each locality. Each line is drawn as a cardinal curve. This
// initially straight curve is intersected with each locality and bent
// in order to avoid intersection. The bending is straightforward and
// will by no means avoid intersections entirely.
Model.prototype.computeLocalityLinkPaths = function() {
  var maxR = this.nodeRadius * 1.11111 * this.localityScale;
  for (var i = 0; i < this.localityLinks.length; i++) {
    var link = this.localityLinks[i];
    // Make sure the link goes from left to right.
    if (link.l1.pos > link.l2.pos) {
      var l1Tmp = link.l1;
      link.l1 = link.l2;
      link.l2 = l1Tmp;
    }
    var vec = sub(link.l2.pos, link.l1.pos),
        len = length(vec),
        norm = normalize(vec),
        skip = maxR;
    link.points = [link.l1.pos, add(link.l1.pos, mult(norm, skip))];

    // Bend the curve around any localities which come too close to
    // the line drawn to represent this locality link. This inner
    // loop just adds additional points to the cardinal curve.
    for (var j = 0; j < this.localities.length; j++) {
      // First, find the closest point on the locality link segment to
      // the center of each locality.
      var loc = this.localities[j],
          closest = findClosestPoint(link.l1.pos, link.l2.pos, loc.pos);
      // Only consider bending the locality link IF the closest point
      // lies on the segment _between_ the two localities.
      if (closest != [0, 0]) {
        // We bend if the distance is within 2x the max radius (2x is
        // determined empirically for aesthetics).
        var dist = distance(closest, loc.pos);
        if (dist < maxR * 2) {
          // This part is a bit dicey, so here's an explanation of the
          // algorithm:
          // - Compute the vector from the locality center to closest point.
          // - Measure the angle; if between 45 degrees and 135 degrees:
          //   - If vector points down, bend 2x the max radius to clear the
          //     locality name tag.
          //   - Otherwise, bend 1.5x max radius.
          var cVec = sub(closest, loc.pos),
              angle = (cVec[0] == 0) ? Math.PI / 2 : Math.abs(Math.atan(cVec[1] / cVec[0])),
              magnitude = (angle < Math.PI * 3 / 4 && angle > Math.PI / 4) ? (cVec[1] > 1 ? maxR * 2 : maxR * 1.5) : maxR * 1.5,
              invertNorm = invert(norm),
              perpV = mult(invertNorm, magnitude),
              dir1 = add(loc.pos, perpV),
              dir2 = sub(loc.pos, perpV);
          if (dist < magnitude) {
            if (distance(closest, dir1) < distance(closest, dir2)) {
              link.points.push(dir1);
            } else {
              link.points.push(dir2);
            }
          }
        }
      }
    }

    // Add remaining points to the curve.
    link.points.push(sub(link.l2.pos, mult(norm, skip)));
    link.points.push(link.l2.pos);
  }
}

Model.prototype.layout = function() {
  layoutModel(this);
  for (var i = 0; i < this.tables.length; i++) {
    this.tables[i].flush();
  }
  this.refreshLayout();
}

Model.prototype.refreshLayout = function() {
  for (var i = 0; i < this.localities.length; i++) {
    this.localities[i].refreshUsageDetails();
  }
  for (var i = 0; i < this.localityLinks.length; i++) {
    var ll = this.localityLinks[i];
    ll.cachedNetworkActivity = ll.networkActivity();
  }
  refreshModel(this);
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

function findModel(id) {
  for (var i = 0; i < models.length; i++) {
    if (models[i].id == id) {
      return models[i];
    }
  }
  return null;
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
