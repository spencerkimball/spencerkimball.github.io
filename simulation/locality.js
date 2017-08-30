function Locality(locality, nodes, model) {
  this.id = "loc" + model.localityCount++;
  this.name = localityName(locality);
  this.locality = locality;
  this.links = {};
  this.nodes = nodes;
  this.clazz = "locality";
  this.model = model;
  this.location = this.findCentroid();
  this.showDetail = null;
  this.cachedTotalNetworkActivity = 0;
  this.cachedClientActivity = 0;
  this.model.addLocality(this);
  var that = this;
  this.angleInterp = function(t) { return that.usagePct; }
  this.refreshUsageDetails();
}

Locality.prototype.findCentroid = function() {
  var centroid = [0, 0];
  for (var i = 0; i < this.nodes.length; i++) {
    centroid = [centroid[0] + this.nodes[i].location[0],
                centroid[1] + this.nodes[i].location[1]];
  }
  return [centroid[0] / this.nodes.length, centroid[1] / this.nodes.length];
}

function computeAngle(i, count) {
  return 2 * Math.PI * (i + 1) / count - Math.PI / 2;
}

// adjustLocation adjusts the locality location so that it lies on a
// circle of size radius at an angle defined by computeAngle(i, count).
Locality.prototype.adjustLocation = function(i, count, radius) {
  var angle = computeAngle(i, count),
      xy = this.model.projection(this.location),
      xyAdjusted = [xy[0] + radius * Math.cos(angle), xy[1] + radius * Math.sin(angle)];
  this.location = this.model.projection.invert(xyAdjusted);
  for (var i = 0; i < this.nodes.length; i++) {
    this.nodes[i].location = this.location;
  }
}

Locality.prototype.state = function() {
  var liveCount = this.liveCount();
  if (liveCount == 0) {
    return "unavailable";
  } else if (liveCount < this.nodes.length) {
    return "mixed";
  }
  return "available";
}

Locality.prototype.toggleState = function() {
  var newState = "down";
  if (this.liveCount() < this.nodes.length) {
    newState = "healthy";
  }
  for (var i = 0; i < this.nodes.length; i++) {
    this.nodes[i].state = newState;
  }
}

Locality.prototype.liveCount = function() {
  var count = 0;
  for (var i = 0; i < this.nodes.length; i++) {
    count += (this.nodes[i].state == "healthy") ? 1 : 0;
  }
  return count;
}

Locality.prototype.leaderCount = function() {
  var count = 0;
  for (var i = 0; i < this.nodes.length; i++) {
    count += this.nodes[i].leaderCount();
  }
  return count;
}

Locality.prototype.usageByTable = function() {
  var usageMap = {"__total": 0};
  for (var i = 0; i < this.nodes.length; i++) {
    this.nodes[i].usageByTable(usageMap);
  }
  return usageMap;
}

Locality.prototype.usageByDB = function() {
  var usageMap = {"__total": 0};
  for (var i = 0; i < this.nodes.length; i++) {
    this.nodes[i].usageByDB(usageMap);
  }
  return usageMap;
}

Locality.prototype.throughputByDB = function() {
  var throughputMap = {"__total": 0};
  for (var i = 0; i < this.nodes.length; i++) {
    this.nodes[i].throughputByDB(throughputMap);
  }
  return throughputMap;
}

Locality.prototype.capacity = function() {
  var capacity = 0;
  for (var i = 0; i < this.nodes.length; i++) {
    capacity += this.nodes[i].capacity;
  }
  return capacity;
}

Locality.prototype.clientActivity = function() {
  var activity = 0;
  for (var i = 0; i < this.nodes.length; i++) {
    activity += this.nodes[i].clientActivity();
  }
  if (activity > this.model.maxClientActivity) {
    this.model.maxClientActivity = activity;
  }
  return activity;
}

Locality.prototype.totalNetworkActivity = function() {
  var total = [0, 0];
  for (var i = 0; i < this.nodes.length; i++) {
    var activity = this.nodes[i].networkActivity();
    total = [total[0] + activity[0], total[1] + activity[1]];
  }
  var activity = total[0] + total[1]
  if (activity > this.model.maxNetworkActivity) {
    this.model.maxNetworkActivity = activity;
  }
  return activity;
}

// getDatabasesByUsage returns an array of objects containing database
// name and locality for each database which has non-zero usage by this
// locality, sorted by database index.
Locality.prototype.getDatabasesByUsage = function() {
  var databases = [];
  for (db in this.usageMap) {
    if (db != "__total") {
      databases.push({name: db, locality: this, textPos: [0, 0], textOff: [0, 0]});
    }
  }
  if (databases.length == 0) {
    return [];
  }
  var model = this.model;
  databases.sort(function(a, b) {
    return model.databasesByName[a.name].idx - model.databasesByName[b.name].idx;
  });
  for (var i = 1; i < databases.length; i++) {
    databases[i].prev = databases[i-1];
  }
  databases[databases.length - 1].last = true;
  return databases;
}

Locality.prototype.refreshUsageDetails = function() {
  var capacity = this.capacity();
  this.usageMap = this.usageByDB();
  this.usageSize = this.usageMap["__total"];
  this.usagePct = this.usageSize / capacity;
  this.cachedCapacity = capacity;
  this.cachedClientActivity = this.clientActivity();
  this.cachedTotalNetworkActivity = this.totalNetworkActivity();
}

// localityName extracts the locality name as the first element of the
// locality array and strips out any leading ".*=" pattern.
function localityName(locality) {
  if (locality.length == 0) {
    return "Global";
  }
  var name = locality[locality.length - 1],
      idx = name.indexOf("=");
  if (idx != -1) {
    return name.substr(idx + 1, name.length);
  }
  return name;
}

function fullLocalityName(locality) {
  if (locality.length == 0) {
    return "Global";
  }
  var fullName = "";
  for (var i = 0; i < locality.length; i++) {
    var name = locality[i],
        idx = name.indexOf("=");
    if (idx != -1) {
      name = name.substr(idx + 1, name.length);
    }
    if (fullName.length > 0) {
      fullName += " / ";
    }
    fullName += name;
  }
  return fullName;
}

// localityKey concatenates locality information into a comma-separated
// string for use as the key in a dictionary.
function localityKey(locality) {
  key = '';
  for (var i = 0; i < locality.length; i++) {
    if (i > 0) {
      key += ",";
    }
    key += (i + ":" + locality[i]);
  }
  return key
}

// localityHasPrefix checks whether the supplied locality array has
// the supplied prefix.
function localityHasPrefix(locality, prefix) {
  if (prefix.length > locality.length) {
    return false;
  }
  for (var i = 0; i < prefix.length; i++) {
    if (locality[i] != prefix[i]) {
      return false;
    }
  }
  return true;
}

