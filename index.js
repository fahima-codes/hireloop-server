import express from 'express';
import cors from 'cors';
import { ObjectId } from 'mongodb';
import { MongoClient } from 'mongodb';
import 'dotenv/config';
const app = express();
const port = process.env.PORT || 5000;
//middleware
app.use(express.json());
app.use(cors());

import dotenv from 'dotenv';
dotenv.config();

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log('You successfully connected to MongoDB!');
    return client;
  } catch (err) {
    console.log('MongoDB Error:', err.message);
  }
}

const connectedClient = await connectToMongoDB();
const database = connectedClient.db('hireloopdb');
const users = database.collection('user');
const jobs = database.collection('jobs');
const applications = database.collection('applications');

app.get('/', (req, res) => {
  res.send('Hire loop is looping');
});
app.get('/users', async (req, res) => {
  const cursor = users.find({});
  const result = await cursor.toArray();
  res.send(result);
});
//jobs related api
// DELETE - Delete a single job by ID
app.delete('/jobs/:id', async (req, res) => {
  try {
    const client = await connectToMongoDB();
    const db = client.db('hireloopdb'); // tomar database er nam ta ekhane dao
    const collection = db.collection('jobs');

    const result = await collection.deleteOne({
      _id: new ObjectId(req.params.id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Job not found' });
    }

    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.log('DELETE ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
});
app.get('/jobs', async (req, res) => {
  const query = {};
  console.log('query', req.query);
  if (req.query) {
    if (req.query.jobType) {
      query.jobType = req.query.jobType;
    }
    if (req.query.isRemote) {
      query.isRemote = req.query.isRemote === 'true';
    }
    if (req.query.category) {
      query.category = req.query.category;
    }
    if (req.query.search?.trim()) {
      const searchRegex = new RegExp(
        req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );

      query.$or = [
        { title: searchRegex },
        { category: searchRegex },
        { description: searchRegex },
        { requirements: searchRegex },
      ];
    }
  }
  const cursor = jobs.find(query);
  const result = await cursor.toArray();
  res.send(result);
});

app.get(`/jobs/:id`, async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await jobs.findOne(query);
  res.send(result);
});

app.post('/jobs', async (req, res) => {
  const job = req.body;
  const result = await jobs.insertOne(job);
  res.send(result);
});

// GET — all applications (recruiter dashboard-এ list দেখানোর জন্য)
app.get('/applications', async (req, res) => {
  try {
    const result = await applications.find({}).toArray();
    res.send(result);
  } catch (error) {
    console.log('GET /applications ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
});

app.post('/applications', async (req, res) => {
  try {
    const application = req.body;
    const result = await applications.insertOne(application);
    res.send(result);
  } catch (error) {
    console.log('POST /applications ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
