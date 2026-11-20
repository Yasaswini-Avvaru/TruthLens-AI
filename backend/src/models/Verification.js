import mongoose from 'mongoose';

const evidenceSchema = new mongoose.Schema({
  title: { type: String, required: true },
  url: { type: String, required: true },
  snippet: { type: String, default: '' },
  publishedDate: { type: String, default: '' },
  domain: { type: String, default: '' },
  domainType: { type: String, enum: ['official', 'research', 'other'], default: 'other' },
  searchScore: { type: Number, min: 0, max: 1, default: null },
}, { _id: false });

const originSchema = new mongoose.Schema({
  type: { type: String, enum: ['text', 'image_ocr', 'transcript', 'frame_ocr'], required: true },
  timestamp: { type: Number, min: 0, default: null },
}, { _id: false });

const claimResultSchema = new mongoose.Schema({
  claimText: { type: String, required: true, maxlength: 2000 },
  origins: { type: [originSchema], default: [] },
  verdict: { type: String, enum: ['Supported', 'Contradicted', 'Misleading', 'Unverified', 'Inconclusive'], required: true },
  confidence: { type: Number, min: 0, max: 100, required: true },
  summary: { type: String, required: true },
  detailedExplanation: { type: String, required: true },
  supportingEvidence: { type: [evidenceSchema], default: [] },
  contradictingEvidence: { type: [evidenceSchema], default: [] },
  sources: { type: [evidenceSchema], default: [] },
  limitations: { type: [String], default: [] },
});

const verificationSchema = new mongoose.Schema({
  inputType: { type: String, enum: ['text', 'image', 'video'], default: 'text' },
  inputMethod: { type: String, enum: ['text', 'voice'], default: 'text' },
  originalText: { type: String, default: '' },
  originalFilename: { type: String, default: '' },
  mediaMetadata: { type: mongoose.Schema.Types.Mixed, default: null },
  extraction: { type: mongoose.Schema.Types.Mixed, default: null },
  scamAnalysis: { type: mongoose.Schema.Types.Mixed, default: null },
  claim: { type: String, required: true, maxlength: 10000 },
  verdict: { type: String, enum: ['Supported', 'Contradicted', 'Misleading', 'Unverified', 'Inconclusive'], required: true },
  confidence: { type: Number, min: 0, max: 100, required: true },
  summary: { type: String, required: true },
  detailedExplanation: { type: String, required: true },
  supportingEvidence: { type: [evidenceSchema], default: [] },
  contradictingEvidence: { type: [evidenceSchema], default: [] },
  sources: { type: [evidenceSchema], default: [] },
  claimResults: { type: [claimResultSchema], default: [] },
  limitations: { type: [String], default: [] },
  language: { type: String, default: 'English' },
  speechLanguageCode: { type: String, default: null, maxlength: 16 },
  languageDetection: {
    status: { type: String, enum: ['detected', 'uncertain', 'not_detected'], default: 'not_detected' },
    dominantLanguage: { tag: String, name: String },
    detectedLanguages: [{ tag: String, name: String, confidence: Number }],
    provider: String,
    model: String,
    limitations: { type: [String], default: [] },
  },
  responseLanguage: {
    tag: String,
    name: String,
    mode: { type: String, enum: ['auto', 'manual'] },
    translationStatus: String,
  },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.models.Verification || mongoose.model('Verification', verificationSchema);
