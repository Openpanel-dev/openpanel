export type MixanRequest<Body> = Omit<Express.Request,'body'> & {
  body: Body
}