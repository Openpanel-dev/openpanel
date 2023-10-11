import express  from "express";
import events from './routes/events'
import profiles from './routes/profiles'
import { authMiddleware } from "./middlewares/auth";
import morgan from 'morgan'
import { db } from "./db";
import { hashPassword } from "./services/password";
import { v4 as uuid } from 'uuid';


const app = express();
const port = 8080;

app.use(morgan('tiny'))
app.use(express.json());
app.use(express.json());
app.use(authMiddleware)


app.use(events)
app.use(profiles)
app.get("/ping", (req, res) => res.json("pong"));
app.listen(port, () => {
  console.log(`Listening on port ${port}...`);
});

// async function main() {
//   const secret = uuid()
//   await db.client.create({
//     data: {
//       project_id: 'eed345ae-2772-42e5-b989-e36e09c5febc',
//       name: 'test',
//       secret: await hashPassword(secret),
//     }
//   })
//   console.log('Your secret is', secret);
  
  
// }

// main()