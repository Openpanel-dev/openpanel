import express  from "express";
import events from './routes/events'
import profiles from './routes/profiles'
import { authMiddleware } from "./middlewares/auth";
import morgan from 'morgan'


const app = express();
const port = process.env.PORT || 8080;

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