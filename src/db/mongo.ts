import mongoose from 'mongoose';
import "dotenv/config";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.log("MONGODB_URI is not set in .env! Skipping MongoDB connection.");
} else {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log('Successfully connected to MongoDB Atlas!'))
    .catch((error) => console.error('MongoDB connection error:', error));
}

// Session Schema (replaces SQLite 'sessions' table)
const sessionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  roomId: { type: String, required: true },
  pdfFileName: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// Compound index equivalent to UNIQUE(userId, roomId)
sessionSchema.index({ userId: 1, roomId: 1 }, { unique: true });

const Session = mongoose.model('Session', sessionSchema);

export async function logSession(userId: string, roomId: string, pdfFileName: string) {
  if (!MONGODB_URI) return;
  try {
    await Session.findOneAndUpdate(
      { userId, roomId },
      { pdfFileName, createdAt: new Date() },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error logging session to MongoDB:', error);
  }
}

export async function getUserSessions(userId: string) {
  if (!MONGODB_URI) return [];
  try {
    const sessions = await Session.find({ userId })
      .sort({ createdAt: -1 })
      .lean();
    return sessions;
  } catch (error) {
    console.error('Error fetching sessions from MongoDB:', error);
    return [];
  }
}
