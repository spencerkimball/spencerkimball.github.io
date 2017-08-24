function ExpVar(halfLife) {
  if (halfLife == null) {
    // Default half life to 10s */
    this.halfLife = 10 * 1000;
  } else {
    this.halfLife = halfLife;
  }
  this.value = 0;
  this.lastTime = 0;
}

ExpVar.prototype.record = function(value) {
  var time = Date.now(),
      deltaTime = time - this.lastTime;
  this.value = this.value * Math.exp(-deltaTime / this.halfLife) + value;
  this.lastTime = time;
}

ExpVar.prototype.getValue = function() {
  var time = Date.now(),
      deltaTime = time - this.lastTime;
  return (this.value * Math.exp(-deltaTime / this.halfLife)) / 10;
}
