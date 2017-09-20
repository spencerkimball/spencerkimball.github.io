// Facility creates a new facility location. The arguments are the city
// name that the facility exists in, the locality in which it's organized,
// the number of racks, and the number of nodes per rack.
function Facility(city, locality, racks, nodesPerRack, model) {
  this.city = city;
  this.locality = locality;
  this.location = lookupCityLocation(city);
  this.racks = racks;
  this.nodesPerRack = nodesPerRack;
  this.nodes = [];

  // Add racks and nodes for each facility.
  for (var k = 0; k < racks; k++) {
    for (var l = 0; l < nodesPerRack; l++) {
      var nodeLocality = locality.slice(0);
      if (this.racks > 1) {
        nodeLocality.push("rack=rack " + k);
      }
      this.nodes.push(
        new RoachNode("10.10." + (k + 1) + "." + (l + 1), this.location, nodeLocality, model));
    }
  }

  model.addFacility(this);
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

