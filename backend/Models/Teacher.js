// models/Teacher.js
const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phoneNumber: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isEmailVerified: { type: Boolean, default: false },
  
  // Role fields
  role: { 
    type: String, 
    enum: ['class', 'subject'], 
    required: true
  },
  
  // Subject field
  subject: { 
    type: String, 
    required: true,
    enum: ['Java', 'C', 'Python', 'C++']
  },
  
  // For Class Teacher - which class they teach (fixed to Class 10)
  assignedClass: { 
    type: String, 
    default: 'Coding'
  },
  
  // Relationships
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  
  // LMS Files
  files: [{
    filename: { type: String },
    path: { type: String },
    uploadedAt: { type: Date, default: Date.now },
    description: { type: String, default: '' },
    fileType: { type: String },
    fileSize: { type: Number }
  }]
}, {
  timestamps: true
});

module.exports = mongoose.models.Teacher || mongoose.model('Teacher', teacherSchema);