export {}

declare global {
  // metadata-scraper relies on this type
  type Element = any

  // add context to request
  namespace Express {
    interface Request {
      client: {
        project_id: string
      }
    }
  }
}
