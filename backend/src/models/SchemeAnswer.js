import mongoose from 'mongoose';

const sourceSchema = new mongoose.Schema({ title: String, url: String, snippet: String, publishedDate: String, domain: String, domainType: String }, { _id: false });
const schemeAnswerSchema = new mongoose.Schema({
  schemeName: { type: String, default: '' },
  answer: { type: String, required: true, maxlength: 10000 },
  eligibility: { type: String, default: '' },
  benefits: { type: String, default: '' },
  requiredDocuments: { type: String, default: '' },
  applicationSteps: { type: String, default: '' },
  officialApplicationUrl: { type: String, default: '' },
  deadlines: { type: String, default: '' },
  riskNotes: { type: String, default: '' },
  sources: { type: [sourceSchema], default: [] },
  limitations: { type: [String], default: [] },
  languageDetection: { dominantLanguage: { tag: String, name: String }, detectedLanguages: [{ tag: String, name: String, confidence: Number }] },
  responseLanguage: { tag: String, name: String, mode: String },
}, { timestamps: true });

export default mongoose.models.SchemeAnswer || mongoose.model('SchemeAnswer', schemeAnswerSchema);
