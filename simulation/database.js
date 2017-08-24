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
  for (var i = 0; i < this.tables.length; i++) {
    usage += this.tables[i].usage();
  }
  return usage;
}

Database.prototype.throughput = function() {
  var throughput = 0;
  for (var i = 0; i < this.tables.length; i++) {
    throughput += this.tables[i].getThroughput();
  }
  return throughput;
}
