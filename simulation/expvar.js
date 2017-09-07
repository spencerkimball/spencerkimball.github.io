function ExpVar(halfLife) {
  if (halfLife == null) {
    // Default half life to 5s */
    this.halfLife = 5 * 1000;
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
  if (deltaTime >= this.halfLife) {
    return this.value = 0;
  }
  return (this.value * Math.exp(-deltaTime / this.halfLife)) / 5;
}
