import express from 'express';
import cors from 'cors';
import { ObjectId } from 'mongodb';
import { MongoClient } from 'mongodb';
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
const payments = database.collection('payments');

app.get('/', (req, res) => {
  res.send('Hire loop is looping');
});
app.get('/users', async (req, res) => {
  const cursor = users.find({});
  const result = await cursor.toArray();
  res.send(result);
});

app.get('/users/:id/premium', async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await users.findOne(query, { projection: { premium: 1 } });
  res.send({ result });
});

app.patch('users/:id/role', async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const updatedDoc = {
    $set: {
      role: req.body.role,
    },
  };
  const result = await users.updateOne(query, updatedDoc);
  req.send(result);
});
//jobs related api
// DELETE - Delete a single job by ID
app.delete('/jobs/:id', async (req, res) => {
  try {
    const client = await connectToMongoDB();
    const db = client.db('hireloopdb'); // tomar database er nam ta ekhane dao
    const collection = db.collection('jobs');

    const result = await collection.deleteOne({
      _id: buildIdFilter(req.params.id),
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
    if (req.query.recruiterId) {
      query.recruiterId = req.query.recruiterId;
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

// _id filter — ObjectId ফরম্যাট হলে ObjectId, না হলে (পুরনো seeded job-এর মতো
// "job_006" string id) সরাসরি string দিয়ে query — নাহলে new ObjectId() throw করে 500 দেয়
const buildIdFilter = id =>
  ObjectId.isValid(id) && /^[0-9a-fA-F]{24}$/.test(id) ? new ObjectId(id) : id;

app.get(`/jobs/:id`, async (req, res) => {
  const query = { _id: buildIdFilter(req.params.id) };
  const result = await jobs.findOne(query);
  res.send(result);
});

app.post('/jobs', async (req, res) => {
  const job = req.body;
  const result = await jobs.insertOne(job);
  res.send(result);
});

// GET — all applications (?userId= dile oi user-er application, na dile shob)
app.get('/applications', async (req, res) => {
  const query = {};
  if (req.query.userId) {
    query.userId = req.query.userId;
  }
  if (req.query.jobId) {
    query.jobId = req.query.jobId;
  }
  const cursor = applications.find(query);
  const result = await cursor.toArray();
  res.send(result);
});
app.get('/applications/count', async (req, res) => {
  const query = {};
  if (req.query.userId) {
    query.userId = req.query.userId;
  }

  const result = await applications.countDocuments(query);

  res.send({ count: result });
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

app.patch('/applications/:id', async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const updatedDoc = {
    $set: {
      status: req.body.status,
    },
  };
  const result = await applications.updateOne(query, updatedDoc);
  res.send(result);
});

//payment related api
// frontend-এর checkoutVerify(sessionId, userId) এখানে POST করে —
// session id দিয়ে Stripe-এ payment যাচাই করে payments collection-এ রাখে,
// আর user-কে premium বানায়
app.post('/payments/checkout-verify', async (req, res) => {
  try {
    // frontend `{ sessionId, userId }` পাঠায় — sessionID নামে পড়লে সবসময় undefined আসত
    const { sessionId, userId } = req.body;

    if (!sessionId) {
      return res.send({ success: false, message: 'Session ID is required' });
    }

    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    // Stripe session-এ transactionId/paymentIntentId নামের ফিল্ড নেই —
    // আসল ফিল্ডগুলো থেকে ম্যাপ করে নিতে হয়
    const payment = {
      transactionId: checkoutSession.id, // checkout session নিজেই transaction-এর রেফারেন্স
      paymentIntentId: checkoutSession.payment_intent ?? null, // আসল charge-এর id
      sessionStatus: checkoutSession.status, // paid হলে Stripe 'complete' দেয়
      paymentStatus: checkoutSession.payment_status, // 'paid' / 'unpaid'
      customerEmail: checkoutSession.customer_details?.email ?? null,
      amountPaid: checkoutSession.amount_total, // cents-এ — $20 হলে 2000
      currency: checkoutSession.currency,
      createdAt: checkoutSession.created
        ? new Date(checkoutSession.created * 1000)
        : null,
    };

    // একই session আবার verify করা হলে duplicate record হবে না (page refresh ইত্যাদি)
    const existingPayment = await payments.findOne({
      transactionId: payment.transactionId,
    });
    if (existingPayment) {
      return res.send({ success: false, message: 'Payment already verified' });
    }

    // 'complete'/'paid' না মিললে premium বানানো হবে না — শুধু status ফেরত দিই
    if (
      payment.sessionStatus !== 'complete' ||
      payment.paymentStatus !== 'paid'
    ) {
      return res.send({
        success: false,
        sessionStatus: payment.sessionStatus,
        paymentStatus: payment.paymentStatus,
      });
    }

    const result = await payments.insertOne(payment);

    // user-কে premium বানাই — userId টা frontend-এর logged-in session থেকে আসে
    // (আগে MediaMetadata.userID লেখা ছিল — ওটা browser API, কখনোই define হয় না)
    let updateResult = null;
    if (userId && ObjectId.isValid(userId)) {
      updateResult = await users.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { premium: true } },
      );
    }

    res.send({ success: true, result, updateResult });
  } catch (error) {
    console.log('CHECKOUT-VERIFY ERROR:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
