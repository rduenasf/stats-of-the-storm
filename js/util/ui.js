function getTemplate(name, selector) {
  const link = document.querySelector('link[name="' + name + '"]');
  const template = link.import.querySelector(selector);
  const clone = $(document.importNode(template.content, true));
  return clone;
}

module.exports = {
  getTemplate
};
