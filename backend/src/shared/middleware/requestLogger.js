// One structured line per request (LLD §9): no bodies, no query strings, no headers.

export function requestLogger(logger) {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number((process.hrtime.bigint() - started) / 1000000n);
      logger.info(
        {
          requestId: req.id,
          userId: req.actor?.userId ?? null,
          method: req.method,
          path: req.baseUrl + req.path,
          status: res.statusCode,
          durationMs,
        },
        'request',
      );
    });
    next();
  };
}
