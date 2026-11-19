export const extensionAttributeCleanup = `(() => {
  const attribute = 'bis_skin_checked';
  const clean = (root) => {
    if (root.nodeType !== 1) return;
    root.removeAttribute(attribute);
    root.querySelectorAll('[' + attribute + ']').forEach(node => node.removeAttribute(attribute));
  };
  clean(document.documentElement);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') record.target.removeAttribute(attribute);
      else record.addedNodes.forEach(clean);
    }
  });
  observer.observe(document.documentElement, {subtree:true,childList:true,attributes:true,attributeFilter:[attribute]});
  window.__flirraHydrationCleanup = () => observer.disconnect();
})();`;

