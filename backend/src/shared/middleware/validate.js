// validate({ params, query, body }) — zod schemas; parsed values replace the raw ones on
// req.valid so controllers never read unvalidated input. ZodErrors become VALIDATION_FAILED
// in errorHandler.

export function validate(schemas) {
  return (req, res, next) => {
    try {
      req.valid = {
        params: schemas.params ? schemas.params.parse(req.params) : {},
        query: schemas.query ? schemas.query.parse(req.query) : {},
        body: schemas.body ? schemas.body.parse(req.body ?? {}) : {},
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}
