// backend/routes/teacherRoutes.js - Complete Auto-Assignment System
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Teacher = require('../Models/Teacher');
const Student = require('../Models/Student');
const Meeting = require('../Models/Meeting');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { generateAndSendOtp } = require('../services/otpService');
const authenticateToken = require('../middleware/auth');
const { sendEmail } = require('../services/emailService');
const { getFrontendUrl, getBackendUrl } = require('../utils/urlHelper');

const router = express.Router();

// ============ CLOUDINARY CONFIGURATION ============
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log('✅ Cloudinary configured');

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'virtual-classroom',
    resource_type: 'auto',
    public_id: (req, file) => {
      const timestamp = Date.now();
      const originalName = file.originalname;
      const lastDotIndex = originalName.lastIndexOf('.');
      let baseName = originalName;
      if (lastDotIndex !== -1) {
        baseName = originalName.substring(0, lastDotIndex);
      }
      const sanitizedName = baseName.replace(/[^a-zA-Z0-9]/g, '_');
      return `${timestamp}-${sanitizedName}`;
    }
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp3'
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(null, true);
  }
};

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: fileFilter
});

// ============ OTP ROUTES ============
router.post('/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });
  const otpResult = await generateAndSendOtp(email);
  res.status(otpResult.success ? 200 : 500).json(otpResult);
});

router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required' });
  const { verifyOtp } = require('../services/otpService');
  const otpResult = verifyOtp(email, otp);
  res.status(otpResult.success ? 200 : 400).json(otpResult);
});

// ============ AUTH ROUTES ============
router.post('/signup', async (req, res) => {
  const { firstName, lastName, email, phoneNumber, password, role, subject } = req.body;

  if (!firstName || !lastName || !email || !phoneNumber || !password || !role || !subject) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    const existingTeacher = await Teacher.findOne({ $or: [{ email }, { phoneNumber }] });
    if (existingTeacher) {
      return res.status(400).json({ message: 'Email or phone number already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const teacherData = {
      firstName,
      lastName,
      email,
      phoneNumber,
      password: hashedPassword,
      isEmailVerified: true,
      role,
      subject,
      className: 'Class 10',
      students: [],
      files: []
    };

    const newTeacher = new Teacher(teacherData);
    await newTeacher.save();

    // If a new Subject Teacher registers, auto-assign all approved students to them
    if (role === 'subject') {
      const approvedStudents = await Student.find({ isApproved: true });
      for (const student of approvedStudents) {
        if (!student.teachers.includes(newTeacher._id)) {
          student.teachers.push(newTeacher._id);
          await student.save();
          await Teacher.findByIdAndUpdate(newTeacher._id, { 
            $addToSet: { students: student._id } 
          });
          console.log(`✅ Auto-assigned existing student ${student.email} to new subject teacher ${newTeacher.subject}`);
        }
      }
    }

    res.status(200).json({ 
      message: 'Teacher account created successfully!',
      teacher: {
        id: newTeacher._id,
        name: `${firstName} ${lastName}`,
        email,
        role,
        subject
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: `Signup failed: ${error.message}` });
  }
});

router.post('/login', async (req, res) => {
  const { emailOrPhone, password } = req.body;
  if (!emailOrPhone || !password) return res.status(400).json({ message: 'Email/Phone and password are required' });

  try {
    const user = await Teacher.findOne({
      $or: [{ email: emailOrPhone }, { phoneNumber: emailOrPhone }],
    });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    if (!user.isEmailVerified) return res.status(400).json({ message: 'Please verify your email' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user._id, email: user.email, role: 'teacher' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    const userData = {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      id: user._id,
      role: user.role,
      subject: user.subject
    };
    
    res.status(200).json({ 
      token, 
      userId: user._id, 
      user: userData, 
      role: 'teacher',
      frontendUrl: getFrontendUrl(),
      backendUrl: getBackendUrl()
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user.id)
      .select('firstName lastName email phoneNumber role subject students files');
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });
    res.status(200).json(teacher);
  } catch (error) {
    console.error('Fetch teacher profile error:', error);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

// ============ STUDENT MANAGEMENT ROUTES ============
router.get('/registered-students', authenticateToken, async (req, res) => {
  try {
    const students = await Student.find()
      .populate('teachers', 'firstName lastName email role subject')
      .select('firstName lastName email phoneNumber isApproved teachers class');
    res.status(200).json({ success: true, students });
  } catch (error) {
    console.error('Fetch students error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch registered students' });
  }
});

router.get('/all-teachers', authenticateToken, async (req, res) => {
  try {
    const teachers = await Teacher.find().select('firstName lastName email role subject');
    res.status(200).json({ success: true, teachers });
  } catch (error) {
    console.error('Fetch teachers error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch teachers' });
  }
});

// ============ APPROVE STUDENT - AUTO ASSIGN TO ALL SUBJECT TEACHERS ============
router.post('/approve-student', authenticateToken, async (req, res) => {
  const { studentId } = req.body;
  
  if (!studentId) {
    return res.status(400).json({ message: 'Student ID is required' });
  }

  try {
    // Get the Class Teacher (current user)
    const classTeacher = await Teacher.findById(req.user.id);
    if (!classTeacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // CHECK: Only Class Teachers can approve students
    if (classTeacher.role !== 'class') {
      return res.status(403).json({ 
        message: 'Only Class Teachers can approve students.' 
      });
    }

    // Get student
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check if already approved
    if (student.isApproved) {
      return res.status(400).json({ message: 'Student is already approved!' });
    }

    // Get ALL Subject Teachers (teachers with role 'subject')
    const subjectTeachers = await Teacher.find({ role: 'subject' });
    
    // Assign Class Teacher first
    if (!student.teachers.includes(classTeacher._id)) {
      student.teachers.push(classTeacher._id);
    }
    
    // AUTO-ASSIGN: Add ALL Subject Teachers to the student
    let assignedSubjects = [];
    for (const subjectTeacher of subjectTeachers) {
      if (!student.teachers.includes(subjectTeacher._id)) {
        student.teachers.push(subjectTeacher._id);
        assignedSubjects.push(subjectTeacher.subject);
        
        // Also add student to subject teacher's students list
        await Teacher.findByIdAndUpdate(subjectTeacher._id, { 
          $addToSet: { students: studentId } 
        });
      }
    }
    
    // Mark student as approved
    student.isApproved = true;
    await student.save();
    
    // Add student to Class Teacher's students list
    await Teacher.findByIdAndUpdate(classTeacher._id, { 
      $addToSet: { students: studentId } 
    });

    // Send approval email to student
    const frontendUrl = getFrontendUrl();
    const assignedTeachersList = [
      `${classTeacher.firstName} ${classTeacher.lastName} (Class Teacher - ${classTeacher.subject})`,
      ...subjectTeachers.map(t => `${t.firstName} ${t.lastName} (${t.subject})`)
    ];

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #667eea;">🎓 Welcome to Virtual Classroom!</h2>
        <p>Dear ${student.firstName} ${student.lastName},</p>
        <p>Your account has been approved by Class Teacher ${classTeacher.firstName} ${classTeacher.lastName}!</p>
        
        <h3>📚 Your Assigned Teachers:</h3>
        <ul>
          ${assignedTeachersList.map(teacher => `<li>${teacher}</li>`).join('')}
        </ul>
        
        <p>You have been automatically assigned to all subject teachers.</p>
        <p>As new subject teachers join in the future, they will be automatically added to your account.</p>
        
        <a href="${frontendUrl}/student/login" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 20px;">
          Login Now
        </a>
      </div>
    `;
    
    await sendEmail(student.email, 'Account Approved! Welcome to Virtual Classroom', htmlContent);

    // Notify all subject teachers
    for (const subjectTeacher of subjectTeachers) {
      const teacherEmailContent = `
        <div style="font-family: Arial, sans-serif;">
          <h2>New Student Assigned to You</h2>
          <p>Student: ${student.firstName} ${student.lastName}</p>
          <p>Subject: ${subjectTeacher.subject}</p>
          <p>This student has been automatically assigned to you by the Class Teacher.</p>
          <a href="${frontendUrl}/teacher/dashboard">View Dashboard</a>
        </div>
      `;
      await sendEmail(subjectTeacher.email, `New Student Assigned: ${student.firstName} ${student.lastName}`, teacherEmailContent);
    }

    res.status(200).json({ 
      success: true, 
      message: `Student ${student.firstName} ${student.lastName} approved and automatically assigned to ${subjectTeachers.length} subject teachers!`,
      assignedTeachers: assignedTeachersList.length,
      subjects: assignedSubjects
    });
    
  } catch (error) {
    console.error('Approval error:', error);
    res.status(500).json({ message: 'Failed to approve student: ' + error.message });
  }
});

// ============ AUTO-ASSIGN NEW SUBJECT TEACHERS TO EXISTING STUDENTS ============
// This endpoint can be called when a new subject teacher registers
router.post('/auto-assign-new-teacher', authenticateToken, async (req, res) => {
  try {
    const { teacherId } = req.body;
    
    const teacher = await Teacher.findById(teacherId);
    if (!teacher || teacher.role !== 'subject') {
      return res.status(400).json({ message: 'Invalid subject teacher' });
    }
    
    // Get all approved students
    const approvedStudents = await Student.find({ isApproved: true });
    
    let assignedCount = 0;
    for (const student of approvedStudents) {
      if (!student.teachers.includes(teacher._id)) {
        student.teachers.push(teacher._id);
        await student.save();
        await Teacher.findByIdAndUpdate(teacher._id, { 
          $addToSet: { students: student._id } 
        });
        assignedCount++;
      }
    }
    
    res.status(200).json({ 
      success: true, 
      message: `New subject teacher ${teacher.firstName} ${teacher.lastName} auto-assigned to ${assignedCount} existing students`
    });
  } catch (error) {
    console.error('Auto-assign error:', error);
    res.status(500).json({ message: 'Failed to auto-assign teacher' });
  }
});

// ============ GET STUDENTS FOR A SPECIFIC TEACHER ============
router.get('/my-students', authenticateToken, async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user.id).populate('students', 'firstName lastName email class isApproved');
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }
    res.status(200).json({ success: true, students: teacher.students });
  } catch (error) {
    console.error('Fetch my students error:', error);
    res.status(500).json({ message: 'Failed to fetch students' });
  }
});

// ============ MEETING ROUTES ============
router.post('/create-meeting', authenticateToken, async (req, res) => {
  const { title, description, scheduledTime } = req.body;
  if (!title) return res.status(400).json({ message: 'Meeting title is required' });

  try {
    const meetingId = 'meeting_' + Math.random().toString(36).substr(2, 9).toUpperCase();

    const newMeeting = new Meeting({
      title,
      description: description || '',
      teacherId: req.user.id,
      meetingId,
      scheduledTime: scheduledTime || new Date(),
      isActive: true
    });

    await newMeeting.save();

    const teacher = await Teacher.findById(req.user.id);
    const assignedStudents = await Student.find({ teachers: req.user.id });
    const frontendUrl = getFrontendUrl();
    const meetingLink = `${frontendUrl}/meeting/${meetingId}`;

    let notifiedCount = 0;
    for (const student of assignedStudents) {
      try {
        const htmlContent = `
          <div style="font-family: Arial, sans-serif;">
            <h2>New Meeting: ${title}</h2>
            <p>Dear ${student.firstName},</p>
            <p>Teacher ${teacher.firstName} ${teacher.lastName} (${teacher.subject}) has scheduled a meeting.</p>
            <p><strong>Meeting ID:</strong> ${meetingId}</p>
            <a href="${meetingLink}">Join Meeting</a>
          </div>
        `;
        await sendEmail(student.email, `New Meeting: ${title} - ${teacher.subject}`, htmlContent);
        notifiedCount++;
      } catch (emailError) {
        console.error(`Failed to send email to ${student.email}:`, emailError);
      }
    }

    res.status(200).json({ 
      success: true, 
      message: `Meeting created! Notified ${notifiedCount} students.`,
      meetingId,
      link: meetingLink
    });
  } catch (error) {
    console.error('Create meeting error:', error);
    res.status(500).json({ message: 'Failed to create meeting' });
  }
});

router.get('/meetings', authenticateToken, async (req, res) => {
  try {
    const meetings = await Meeting.find({ teacherId: req.user.id })
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, meetings });
  } catch (error) {
    console.error('Fetch meetings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch meetings' });
  }
});

router.get('/meeting/:meetingId', async (req, res) => {
  const { meetingId } = req.params;
  try {
    const meeting = await Meeting.findOne({ meetingId })
      .populate('teacherId', 'firstName lastName email subject');
    if (!meeting || !meeting.isActive) {
      return res.status(404).json({ message: 'Meeting not found or inactive' });
    }
    res.status(200).json({ success: true, meeting });
  } catch (error) {
    console.error('Get meeting error:', error);
    res.status(500).json({ message: 'Failed to get meeting details' });
  }
});

router.post('/end-meeting/:meetingId', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    if (meeting.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only the host can end this meeting' });
    }
    meeting.isActive = false;
    meeting.endedAt = new Date();
    await meeting.save();
    res.status(200).json({ success: true, message: 'Meeting ended successfully' });
  } catch (error) {
    console.error('End meeting error:', error);
    res.status(500).json({ message: 'Failed to end meeting' });
  }
});

// ============ FILE MANAGEMENT ROUTES ============
router.post('/upload-file', authenticateToken, upload.array('file', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const description = req.body.description || '';
    const teacher = await Teacher.findById(req.user.id);
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });
    if (!teacher.files) teacher.files = [];

    const uploadedFiles = [];
    for (const file of req.files) {
      const fileData = {
        filename: file.originalname,
        savedAs: file.filename,
        path: file.path,
        uploadedAt: new Date(),
        description: description.trim(),
        fileType: file.mimetype,
        fileSize: file.size,
        cloudinaryId: file.filename
      };
      teacher.files.push(fileData);
      uploadedFiles.push({ ...fileData, id: teacher.files[teacher.files.length - 1]._id });
    }

    await teacher.save();
    res.status(200).json({ success: true, message: `${uploadedFiles.length} file(s) uploaded`, files: uploadedFiles });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ message: error.message || 'Failed to upload files' });
  }
});

router.get('/my-files', authenticateToken, async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user.id).select('files');
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });
    const files = teacher.files ? teacher.files.sort((a, b) => b.uploadedAt - a.uploadedAt) : [];
    res.status(200).json({ success: true, files, count: files.length });
  } catch (error) {
    console.error('Fetch files error:', error);
    res.status(500).json({ message: 'Failed to fetch uploaded files' });
  }
});

router.delete('/file/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const teacher = await Teacher.findById(req.user.id);
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });
    const fileIndex = teacher.files.findIndex(f => f._id.toString() === fileId);
    if (fileIndex === -1) return res.status(404).json({ message: 'File not found' });
    teacher.files.splice(fileIndex, 1);
    await teacher.save();
    res.status(200).json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ message: 'Failed to delete file' });
  }
});

// ============ DASHBOARD STATS ============
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user.id);
    const totalStudents = teacher.students ? teacher.students.length : 0;
    const totalMeetings = await Meeting.countDocuments({ teacherId: req.user.id });
    const totalFiles = teacher.files ? teacher.files.length : 0;
    const activeMeetings = await Meeting.countDocuments({ teacherId: req.user.id, isActive: true });
    res.status(200).json({ success: true, stats: { totalStudents, totalMeetings, totalFiles, activeMeetings } });
  } catch (error) {
    console.error('Fetch stats error:', error);
    res.status(500).json({ message: 'Failed to fetch dashboard statistics' });
  }
});

module.exports = router;