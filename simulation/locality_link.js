function LocalityLink(l1, l2, model) {
  this.id = "loc-link" + model.localityLinkCount++;
  this.l1 = l1;
  this.l2 = l2;
  this.clazz = "locality-link";
  this.model = model;
}
