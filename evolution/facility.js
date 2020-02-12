// Facility creates a new facility location. The arguments are the city
// name that the facility exists in, the locality in which it's organized,
// the number of racks, and the number of nodes per rack.
function Facility(city, locality, location, racks, nodesPerRack, model) {
  this.city = city;
  this.locality = locality;
  this.location = location;
  this.racks = racks;
  this.nodesPerRack = nodesPerRack;
  this.model = model;
  this.nodes = [];

  // Add racks and nodes for each facility.
  for (var k = 0; k < racks; k++) {
    for (var l = 0; l < nodesPerRack; l++) {
      this.addNode(k, l)
    }
  }

  model.addFacility(this);
}

Facility.prototype.addNode = function(rack, node) {
  var nodeLocality = this.locality.slice(0);
  if (this.racks > 1) {
    nodeLocality.push("rack=rack " + rack);
  }
  var node = new RoachNode("10.10." + (rack + 1) + "." + (node + 1), this.location, nodeLocality, this.model);
  this.nodes.push(node);
  return node;
}

// If the facility location isn't set, looks up the latitude /
// longitude location by city name. Updates all node locations as
// appropriate. Returns true if the city location is updated.
Facility.prototype.updateLocation = function() {
  var location = lookupCityLocation(this.city);
  if (this.location == location) {
    return false;
  }
  this.location = location;
  for (var i = 0; i < this.nodes.length; i++) {
    this.nodes[i].location = location;
  }
  return true;
}

