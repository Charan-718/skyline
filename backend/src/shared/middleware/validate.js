/** Express 5 makes req.query (and often params/body) read-only; replace via defineProperty. */
function setParsed(req, key, value) {
  Object.defineProperty(req, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}

export function validate(schemas = {}) {
  return (req, _res, next) => {
    try {
      const params = schemas.params ? schemas.params.parse(req.params) : req.params;
      const query = schemas.query ? schemas.query.parse(req.query) : req.query;
      const body = schemas.body ? schemas.body.parse(req.body) : req.body;
      if (schemas.params) setParsed(req, 'params', params);
      if (schemas.query) setParsed(req, 'query', query);
      if (schemas.body) setParsed(req, 'body', body);
      setParsed(req, 'valid', { params, query, body });
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Validated slices after `validate()` middleware (same as reading req.params/query/body). */
export function input(req) {
  return {
    params: req.params,
    query: req.query,
    body: req.body,
  };
}
