(() => {
  const adapters = [];

  window.FloatlyAdapters = {
    register(adapter) {
      adapters.push(adapter);
    },
    match(location = window.location) {
      return adapters.find((adapter) => adapter.matches?.(location)) ?? null;
    }
  };
})();
