function Locality(locality, nodes, model) {
  this.id = model.id + "-loc" + model.localityCount++;
  this.name = localityName(locality, model);
  this.locality = locality;
  this.links = {};
  this.nodes = nodes;
  this.location = this.findCentroid();
  this.clazz = "locality";
  this.model = model;
  this.showDetail = null;
  this.cachedTotalNetworkActivity = 0;
  this.cachedClientActivity = 0;
  this.model.addLocality(this);
  this.replicasByRangeID = {};
  // Fugly, but this is just to avoid plumbing.
  if (this.name == "Des Moines" || this.name == "New York City" ||
      this.name == "United States" || this.name == "China") {
    this.gridOrientation = Math.PI/2;
  } else if (this.name == "European Union" || this.name == "Berlin" ||
             this.name == "London" || this.name == "Beijing" ||
             this.name == "Shanghai" || this.name == "Shenzhen") {
    this.gridOrientation = 0;
  } else {
    this.gridOrientation = Math.PI;
  }
  var that = this;
  this.angleInterp = function(t) { return that.usagePct; }
  this.refreshUsageDetails();
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].belongsToLoc = this;
  }
}

Locality.prototype.findCentroid = function() {
  var centroid = [0, 0];
  for (var i = 0; i < this.nodes.length; i++) {
    centroid = [centroid[0] + this.nodes[i].origLocation[0],
                centroid[1] + this.nodes[i].origLocation[1]];
  }
  return [centroid[0] / this.nodes.length, centroid[1] / this.nodes.length];
}

function computeAngle(i, count) {
  return 2 * Math.PI * i / count - Math.PI / 2;
}

// adjustLocation adjusts the locality location so that it lies on a
// circle of size radius at an angle defined by computeAngle(i, count).
Locality.prototype.adjustLocation = function(i, count, radius) {
  if (count <= 1) {
    return;
  }
  var angle = computeAngle(i, count),
      xy = this.model.projection(this.location),
      xyAdjusted = [xy[0] + radius * Math.cos(angle), xy[1] + radius * Math.sin(angle)];
  this.location = this.model.projection.invert(xyAdjusted);
  if (count == 3) {
    switch (i) {
    case 0:
      this.gridOrientation = Math.PI;
      break;
    case 1:
    case 2:
      this.gridOrientation = Math.PI/2;
      break;
    }
  } else {
    if (i == 0) {
      this.gridOrientation = -Math.PI/16;
    } else if (i == count/2) {
      this.gridOrientation = Math.PI - Math.PI/16;
    } else {
      this.gridOrientation = (i < count / 2) ? 0 : Math.PI;
    }
  }
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
  toggleStatusRing(this.model, this);
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
  this.replicasByRangeID = {};
  for (var i = 0; i < this.model.tables.length; i++) {
    usageMap[this.model.tables[i].name] = 0;
  }
  for (var i = 0; i < this.nodes.length; i++) {
    this.nodes[i].usageByTable(usageMap, this.replicasByRangeID);
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

Locality.prototype.getTables = function() {
  var tables = [],
      index = 0;
  for (table in this.usageMap) {
    if (table != "__total") {
      tables.push({name: table, locality: this, index: index++});
    }
  }
  return tables;
}

// getTablesByUsage returns an array of objects containing table
// name and locality for each table which has non-zero usage by this
// locality, sorted by table index.
Locality.prototype.getTablesByUsage = function() {
  var tables = [];
  for (table in this.usageMap) {
    if (table != "__total") {
      tables.push({name: table, locality: this, textPos: [0, 0], textOff: [0, 0]});
    }
  }
  if (tables.length == 0) {
    return [];
  }
  var model = this.model;
  tables.sort(function(a, b) {
    return model.tablesByName[a.name].idx - model.tablesByName[b.name].idx;
  });
  for (var i = 1; i < tables.length; i++) {
    tables[i].prev = tables[i-1];
  }
  tables[tables.length - 1].last = true;
  return tables;
}

Locality.prototype.refreshUsageDetails = function() {
  var capacity = this.capacity();
  this.usageMap = this.usageByTable();
  this.usageSize = this.usageMap["__total"];
  this.usagePct = this.usageSize / capacity;
  this.cachedCapacity = capacity;
  this.cachedClientActivity = this.clientActivity();
  this.cachedTotalNetworkActivity = this.totalNetworkActivity();
}

// localityName extracts the locality name as the first element of the
// locality array and strips out any leading ".*=" pattern.
function localityName(locality, model) {
  if (locality.length == 0) {
    return model.id;
  }
  var name = locality[locality.length - 1],
      idx = name.indexOf("=");
  if (idx != -1) {
    return name.substr(idx + 1, name.length);
  }
  return name;
}

function fullLocalityName(locality, model) {
  if (locality.length == 0) {
    return "";
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

