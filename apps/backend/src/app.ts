import express from 'express'
import events from './routes/events'
import profiles from './routes/profiles'
import { authMiddleware } from './middlewares/auth'
import morgan from 'morgan'
import { setup } from './routes/setup'

const app = express()
const port = process.env.PORT || 8080

app.use(express.json())
app.use(morgan(':method :url :status :response-time ms'))

// Public routes
app.get('/', (req, res) => res.json('Welcome to Mixan'))
if (process.env.SETUP) {
  app.use('/setup', setup)
}

// Protected routes
app.use(authMiddleware)
app.use('/api/sdk', events)
app.use('/api/sdk', profiles)
app.listen(port, () => {
  console.log(`Listening on port ${port}...`)
})
