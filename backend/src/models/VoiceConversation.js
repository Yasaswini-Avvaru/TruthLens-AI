import mongoose from 'mongoose';

const turnSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  text: { type: String, required: true, maxlength: 5000 },
  language: { tag: String, name: String },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const voiceConversationSchema = new mongoose.Schema({
  verification: { type: mongoose.Schema.Types.ObjectId, ref: 'Verification', required: true, index: true },
  inputLanguage: { tag: String, name: String },
  responseLanguage: { tag: String, name: String, mode: { type: String, enum: ['auto', 'manual'] } },
  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  turns: { type: [turnSchema], default: [] },
}, { timestamps: true });

export default mongoose.models.VoiceConversation || mongoose.model('VoiceConversation', voiceConversationSchema);
