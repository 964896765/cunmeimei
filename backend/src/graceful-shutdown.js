'use strict';
// Stop taking traffic, allow in-flight requests to finish, then release the
// database pool. Calling stop more than once must not close the pool twice.
function createGracefulShutdown(server, repo, {drainTimeoutMs = 10000} = {}) {
  if (!server || typeof server.close !== 'function' || !repo || typeof repo.close !== 'function') {
    throw new TypeError('server.close and repo.close are required');
  }
  let stopping;
  function stop() {
    if (stopping) return stopping;
    stopping = (async () => {
      let timer;
      try {
        const drained = new Promise((resolve, reject) => {
          server.close(err => {
            if (err && err.code !== 'ERR_SERVER_NOT_RUNNING') reject(err);
            else resolve();
          });
        });
        if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
        timer = setTimeout(() => {
          // Node.js supported closeAllConnections force-closes connections
          // that failed to drain; never block a service restart indefinitely.
          server.closeAllConnections?.();
        }, drainTimeoutMs);
        timer.unref?.();
        await drained;
      } finally {
        if (timer) clearTimeout(timer);
        await repo.close();
      }
    })();
    return stopping;
  }
  return {stop};
}
module.exports = {createGracefulShutdown};
