import { Request } from "express"

export type MixanRequest<Body> = Omit<Request,'body'> & {
  body: Body
}