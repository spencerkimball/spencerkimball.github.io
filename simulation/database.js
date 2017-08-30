function Database(name, model) {
  this.name = name;
  this.tables = [];
  this.model = model;
  this.idx = model.databaseCount++;
  this.id = "db" + this.idx;
  this.model.addDatabase(this);
}

Database.prototype.addTable = function(table) {
  this.tables.push(table);
}

Database.prototype.sites = function() {
  var set = {};
  for (var i = 0; i < this.tables.length; i++) {
    for (var j = 0; j < this.tables[i].zoneConfig.length; j++) {
      var loc = this.tables[i].zoneConfig[j][0],
          idx = loc.indexOf("=");
      if (idx != -1) {
        loc = loc.substr(idx + 1, loc.length);
      }
      set[loc] = null;
    }
  }
  var sites = "";
  for (loc in set) {
    if (sites.length > 0) {
      sites += ", ";
    }
    sites += loc;
  }
  return sites;
}

Database.prototype.usage = function() {
  var usage = 0;
  for (var i = 0; i < this.model.localities.length; i++) {
    var dbUsage = this.model.localities[i].usageByDB();
    if (this.name in dbUsage) {
      usage += dbUsage[this.name];
    }
  }
  return usage;
}

Database.prototype.throughput = function() {
  var throughput = 0;
  for (var i = 0; i < this.model.localities.length; i++) {
    var throughputMap = this.model.localities[i].throughputByDB();
    if (this.name in throughputMap) {
      throughput += throughputMap[this.name];
    }
  }
  return throughput;
}

// availability returns the fraction of ranges in the
Database.prototype.availability = function() {
  var count = 0,
      available = 0;
  for (var i = 0; i < this.tables.length; i++) {
    for (var j = 0; j < this.tables[i].ranges.length; j++) {
      if (this.tables[i].ranges[j].hasQuorum()) {
        available++;
      }
      count++;
    }
  }
  return available / count;
}

// underReplicated returns the total size (in units, not bytes) that
// replicas in this database are under-replicated.
Database.prototype.underReplicated = function() {
  var total = 0;
  for (var i = 0; i < this.tables.length; i++) {
    for (var j = 0; j < this.tables[i].ranges.length; j++) {
      var rng = this.tables[i].ranges[j];
      for (var k = 0; k < rng.replicas.length; k++) {
        if (rng.replicas[k].roachNode.down()) {
          total += rng.quorumSize() - rng.replicas[k].getSize(false);
        }
      }
    }
  }
  return total;
}
