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
  const cursor = jobs.find();
  const result = await cursor.toArray();
  res.send(result);
});
app.post('/jobs', async (req, res) => {
  const job = req.body;
  const result = await jobs.insertOne(job);
  res.send(result);
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
