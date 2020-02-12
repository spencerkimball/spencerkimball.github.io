function ExpVar(window) {
  if (window == null) {
    // Default half life to 5s */
    this.window = 5 * 1000;
  } else {
    this.window = window;
  }
  this.value = 0;
  this.count = 0;
  this.lastTime = 0;
}

ExpVar.prototype.record = function(value) {
  var time = Date.now(),
      deltaTime = time - this.lastTime;
  if (deltaTime < this.window) {
    this.value = this.value * ((this.window - deltaTime) / this.window);
    this.count = this.count * ((this.window - deltaTime) / this.window);
  } else {
    this.value = 0;
    this.count = 0;
  }
  this.value += value;
  this.count += 1;
  this.lastTime = time;
}

ExpVar.prototype.getValue = function() {
  var time = Date.now(),
      deltaTime = time - this.lastTime;
  if (deltaTime < this.window) {
    return this.value * ((this.window - deltaTime) / this.window) / (this.window / 1000);
  } else {
    return 0;
  }
}

ExpVar.prototype.getCount = function() {
  var time = Date.now(),
      deltaTime = time - this.lastTime;
  if (deltaTime < this.window) {
    return this.count * ((this.window - deltaTime) / this.window) / (this.window / 1000);
  } else {
    return 0;
  }
}
