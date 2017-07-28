function Locality(locality, nodes, model) {
  this.id = "loc" + model.localityCount++;
  this.name = localityName(locality);
  this.locality = locality;
  this.links = {};
  this.nodes = nodes;
  this.clazz = "locality";
  this.model = model;
  this.location = this.findCentroid();
  this.tx = 0;
  this.ty = 0;
  this.model.addLocality(this);
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

Locality.prototype.leaderCount = function() {
  var count = 0
  for (var i = 0; i < this.nodes.length; i++) {
    count += this.nodes[i].leaderCount()
  }
  return count
}

// localityName extracts the locality name as the first element of the
// locality array and strips out any leading ".*=" pattern.
function localityName(locality) {
  if (locality.length == 0) {
    return "Global";
  }
  var name = locality[locality.length-1];
  var idx = name.indexOf("=");
  if (idx != -1) {
    return name.substr(idx + 1, name.length);
  }
  return name;
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

