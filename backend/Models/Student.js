// models/Student.js
const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phoneNumber: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  class: { type: String, required: true, default: 'Coding' }, // Fixed to Class 10
  isEmailVerified: { type: Boolean, default: false },
  isApproved: { type: Boolean, default: false },
  teachers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' }],
  notifications: [{
    message: String,
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    type: { type: String, enum: ['quiz', 'approval', 'general'], default: 'general' },
    link: String
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Student || mongoose.model('Student', studentSchema);